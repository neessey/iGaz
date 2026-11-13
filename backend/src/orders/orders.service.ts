import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, User } from '@prisma/client';
import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CreateOrderDto } from './orders.dto';
import { canTransition, isExchangeCompatible, isStoreOpenNow, STOCK_HELD } from './order-rules';

const ORDER_INCLUDE = {
  items: { include: { product: { include: { brand: true, cylinderType: true } } } },
  events: { orderBy: { createdAt: 'asc' } },
  store: { select: { id: true, name: true, address: true, phone: true } },
  // Coordonnées du client : nécessaires au dépôt pour joindre le client à la livraison.
  client: { select: { name: true, phone: true } },
  payments: { select: { id: true, method: true, amount: true, status: true, createdAt: true } },
} satisfies Prisma.OrderInclude;

type FullOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Le code de confirmation n'est visible que par le client : il le remet au livreur ou au dépôt. */
  private present(order: FullOrder, viewer: User) {
    if (order.clientId === viewer.id) return order;
    const { confirmationCode: _hidden, ...rest } = order;
    return rest;
  }

  private async load(id: string): Promise<FullOrder> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Commande introuvable');
    return order;
  }

  /** Charge une commande en vérifiant que l'utilisateur y a accès (client, fournisseur propriétaire ou admin). */
  private async loadForUser(user: User, id: string): Promise<FullOrder> {
    const order = await this.load(id);
    if (user.role === 'ADMIN' || order.clientId === user.id) return order;
    if (user.role === 'SUPPLIER') {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      const store = supplier && (await this.prisma.store.findFirst({ where: { id: order.storeId, supplierId: supplier.id } }));
      if (store) return order;
    }
    throw new NotFoundException('Commande introuvable');
  }

  /** Charge une commande pour le fournisseur propriétaire de la boutique concernée (cloisonnement strict). */
  private async loadForOwner(user: User, id: string): Promise<FullOrder> {
    const order = await this.load(id);
    await this.suppliers.requireOwnedStore(user, order.storeId);
    return order;
  }

  private async move(
    tx: Tx, order: { id: string; status: OrderStatus }, to: OrderStatus, actorId: string | null, note?: string,
  ) {
    if (!canTransition(order.status, to)) {
      throw new ConflictException(`Transition impossible : ${order.status} → ${to}`);
    }
    // Garde optimiste : si la commande a changé entre-temps, on refuse plutôt que d'écraser.
    const res = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: to } });
    if (res.count === 0) throw new ConflictException('La commande vient d’être modifiée, rechargez-la');
    await tx.orderEvent.create({ data: { orderId: order.id, status: to, actorId, note } });
  }

  // ---------------------------------------------------------------- création

  async create(user: User, dto: CreateOrderDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { supplier: true, areas: true },
    });
    if (!store || store.supplier.status !== 'APPROVED') throw new NotFoundException('Boutique introuvable');
    if (!store.isOpen || !isStoreOpenNow(store.opensAt, store.closesAt)) {
      throw new UnprocessableEntityException('Cette boutique est fermée actuellement');
    }
    if (dto.fulfillment === 'DELIVERY' && !store.offersDelivery) {
      throw new UnprocessableEntityException('Cette boutique ne propose pas la livraison');
    }
    if (dto.fulfillment === 'PICKUP' && !store.offersPickup) {
      throw new UnprocessableEntityException('Cette boutique ne propose pas le retrait');
    }

    let zoneId: string | null = null;
    let deliveryDetails: string | null = null;
    if (dto.fulfillment === 'DELIVERY') {
      if (!dto.addressId) throw new BadRequestException('Une adresse est requise pour la livraison');
      const address = await this.prisma.address.findFirst({
        where: { id: dto.addressId, userId: user.id }, include: { zone: true },
      });
      if (!address) throw new BadRequestException('Adresse introuvable');
      if (!store.areas.some((a) => a.zoneId === address.zoneId)) {
        throw new UnprocessableEntityException("Cette boutique ne livre pas dans votre zone");
      }
      zoneId = address.zoneId;
      deliveryDetails = `${address.zone.name} — ${address.details}`;
    }

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId: store.id, isActive: true, brand: { isActive: true }, cylinderType: { isActive: true } },
      include: { inventory: true, brand: true, cylinderType: true },
    });
    if (products.length !== productIds.length) throw new BadRequestException('Produit indisponible dans cette boutique');
    const byId = new Map(products.map((p) => [p.id, p]));

    // Stock : bloquant dès la création (la réservation ferme intervient à l'acceptation).
    const requested = new Map<string, number>();
    for (const item of dto.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
    for (const [productId, qty] of requested) {
      const p = byId.get(productId)!;
      if ((p.inventory?.quantity ?? 0) < qty) {
        throw new ConflictException(`Stock insuffisant pour ${p.brand.name} ${p.cylinderType.label}`);
      }
    }

    let subtotal = 0;
    const itemsData = dto.items.map((item) => {
      const p = byId.get(item.productId)!;
      if (item.kind === 'EXCHANGE') {
        if (!isExchangeCompatible(p, { brandId: item.returnedBrandId, cylinderTypeId: item.returnedCylinderTypeId })) {
          throw new UnprocessableEntityException(
            `Échange refusé : la bouteille vide doit être de marque ${p.brand.name} et de format ${p.cylinderType.label}`,
          );
        }
      }
      const unitPrice = item.kind === 'EXCHANGE' ? p.exchangePrice : p.purchasePrice;
      subtotal += unitPrice * item.quantity;
      return {
        productId: p.id, kind: item.kind, quantity: item.quantity, unitPrice,
        returnedBrandId: item.kind === 'EXCHANGE' ? item.returnedBrandId : null,
        returnedCylinderTypeId: item.kind === 'EXCHANGE' ? item.returnedCylinderTypeId : null,
      };
    });

    const deliveryFee = dto.fulfillment === 'DELIVERY' ? store.deliveryFee : 0;
    const total = subtotal + deliveryFee;

    if (dto.paymentMethod === 'CASH_ON_DELIVERY') {
      const cap = Number(this.config.get('COD_MAX_AMOUNT') ?? 100000);
      if (total > cap) {
        throw new UnprocessableEntityException(`Paiement à la livraison limité à ${cap} FCFA`);
      }
    }

    const status: OrderStatus = dto.paymentMethod === 'MOBILE_MONEY' ? 'PENDING_PAYMENT' : 'SUBMITTED';
    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          code: `GZ-${randomBytes(4).toString('hex').toUpperCase()}`,
          clientId: user.id, storeId: store.id,
          fulfillment: dto.fulfillment, paymentMethod: dto.paymentMethod, status,
          zoneId, deliveryDetails, subtotal, deliveryFee, total,
          confirmationCode: String(randomInt(0, 1_000_000)).padStart(6, '0'),
          items: { create: itemsData },
          events: { create: { status, actorId: user.id } },
        },
      });
      if (dto.paymentMethod === 'CASH_ON_DELIVERY') {
        await tx.payment.create({
          data: { orderId: order.id, method: 'CASH_ON_DELIVERY', amount: total, idempotencyKey: `cod:${order.id}` },
        });
      }
      return order;
    });
    return this.present(await this.load(created.id), user);
  }

  // ----------------------------------------------------------------- lecture

  async list(user: User, status?: OrderStatus) {
    let where: Prisma.OrderWhereInput = status ? { status } : {};
    if (user.role === 'CLIENT') {
      where = { ...where, clientId: user.id };
    } else if (user.role === 'SUPPLIER') {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
      if (!supplier) return [];
      where = { ...where, store: { supplierId: supplier.id } };
    }
    const orders = await this.prisma.order.findMany({
      where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: 100,
    });
    return orders.map((o) => this.present(o, user));
  }

  async get(user: User, id: string) {
    return this.present(await this.loadForUser(user, id), user);
  }

  // ------------------------------------------------------- actions fournisseur

  async accept(user: User, id: string) {
    const order = await this.loadForOwner(user, id);
    if (order.status !== 'SUBMITTED') throw new ConflictException(`Commande non acceptable (statut ${order.status})`);

    await this.prisma.$transaction(async (tx) => {
      const perProduct = new Map<string, number>();
      for (const item of order.items) perProduct.set(item.productId, (perProduct.get(item.productId) ?? 0) + item.quantity);

      for (const [productId, qty] of perProduct) {
        // Décrément conditionnel atomique : impossible de descendre sous zéro, même en cas de commandes concurrentes.
        const res = await tx.inventory.updateMany({
          where: { productId, quantity: { gte: qty } }, data: { quantity: { decrement: qty } },
        });
        if (res.count === 0) throw new ConflictException('Stock insuffisant pour accepter cette commande');
        await tx.stockMovement.create({
          data: { productId, delta: -qty, reason: 'ORDER_ACCEPTED', orderId: order.id, actorId: user.id },
        });
      }
      await this.move(tx, order, 'ACCEPTED', user.id);
    });
    return this.present(await this.load(id), user);
  }

  async reject(user: User, id: string, reason: string) {
    const order = await this.loadForOwner(user, id);
    await this.prisma.$transaction((tx) => this.move(tx, order, 'REJECTED', user.id, reason));
    return this.present(await this.load(id), user);
  }

  async ready(user: User, id: string) {
    const order = await this.loadForOwner(user, id);
    if (order.fulfillment !== 'PICKUP') throw new ConflictException('Cette commande est en livraison, pas en retrait');
    await this.prisma.$transaction((tx) => this.move(tx, order, 'READY_FOR_PICKUP', user.id));
    return this.present(await this.load(id), user);
  }

  async dispatch(user: User, id: string) {
    const order = await this.loadForOwner(user, id);
    if (order.fulfillment !== 'DELIVERY') throw new ConflictException('Cette commande est en retrait, pas en livraison');
    await this.prisma.$transaction((tx) => this.move(tx, order, 'OUT_FOR_DELIVERY', user.id));
    return this.present(await this.load(id), user);
  }

  /** Clôture : uniquement avec le code de confirmation donné par le client, jamais sur simple déclaration. */
  async complete(user: User, id: string, code: string) {
    const order = await this.loadForOwner(user, id);
    if (order.status !== 'READY_FOR_PICKUP' && order.status !== 'OUT_FOR_DELIVERY') {
      throw new ConflictException(`Commande non clôturable (statut ${order.status})`);
    }
    const a = Buffer.from(order.confirmationCode);
    const b = Buffer.from(code);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Code de confirmation incorrect');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, order, 'COMPLETED', user.id, 'Code de confirmation vérifié');
      if (order.paymentMethod === 'CASH_ON_DELIVERY') {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' }, data: { status: 'SUCCEEDED' },
        });
      }
    });
    return this.present(await this.load(id), user);
  }

  // ------------------------------------------------------------ client / admin

  /** Le client peut annuler tant que le fournisseur n'a pas accepté la commande. */
  async cancelByClient(user: User, id: string) {
    const order = await this.load(id);
    if (order.clientId !== user.id) throw new NotFoundException('Commande introuvable');
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'SUBMITTED') {
      throw new ConflictException('La commande est déjà acceptée : contactez le support pour l’annuler');
    }
    const paid = order.payments.some((p) => p.status === 'SUCCEEDED');
    await this.prisma.$transaction((tx) =>
      this.move(tx, order, 'CANCELLED', user.id,
        paid ? 'Annulée par le client — remboursement à traiter par l’administration' : 'Annulée par le client'));
    return this.present(await this.load(id), user);
  }

  /** Annulation administrative : libère le stock si la commande l'avait déjà décompté, avec trace d'audit. */
  async cancelByAdmin(admin: User, id: string, reason: string) {
    const order = await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      if (STOCK_HELD.includes(order.status)) {
        const perProduct = new Map<string, number>();
        for (const item of order.items) perProduct.set(item.productId, (perProduct.get(item.productId) ?? 0) + item.quantity);
        for (const [productId, qty] of perProduct) {
          await tx.inventory.update({ where: { productId }, data: { quantity: { increment: qty } } });
          await tx.stockMovement.create({
            data: { productId, delta: qty, reason: 'ORDER_RELEASED', orderId: order.id, actorId: admin.id, note: reason },
          });
        }
      }
      await this.move(tx, order, 'CANCELLED', admin.id, `Annulation administrative : ${reason}`);
      await this.audit.log({
        actorId: admin.id, action: 'ORDER_CANCEL', entity: 'Order', entityId: id,
        before: { status: order.status }, after: { status: 'CANCELLED', reason },
      }, tx);
    });
    return this.get(admin, id);
  }
}
