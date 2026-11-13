import {
  BadRequestException, ConflictException, HttpException, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, Prisma, User } from '@prisma/client';
import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { FeeSettings, orderFees } from '../revenue/fees';
import { RevenueService } from '../revenue/revenue.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CreateCheckoutDto, CreateOrderDto } from './orders.dto';
import { canTransition, checkoutShapeError, isExchangeCompatible, isStoreOpenNow, orderTotals, STOCK_HELD } from './order-rules';

const ORDER_INCLUDE = {
  items: { include: { product: { include: { brand: true, cylinderType: true } } } },
  events: { orderBy: { createdAt: 'asc' } },
  store: { select: { id: true, name: true, address: true, phone: true } },
  // Coordonnées du client : nécessaires au dépôt pour joindre le client à la livraison.
  client: { select: { name: true, phone: true } },
  payments: { select: { id: true, method: true, amount: true, status: true, createdAt: true } },
  // Panier d'origine : réservé au client et à l'admin (retiré pour le dépôt, voir present()).
  checkout: { select: { id: true, code: true, payments: { select: { method: true, status: true, createdAt: true } } } },
} satisfies Prisma.OrderInclude;

type FullOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Payée en ligne : par un paiement propre à la commande ou par celui de son panier. */
export function paidOnline(order: Pick<FullOrder, 'payments' | 'checkout'>): boolean {
  const ok = (p: { method: string; status: string }) => p.method === 'MOBILE_MONEY' && p.status === 'SUCCEEDED';
  return order.payments.some(ok) || !!order.checkout?.payments.some(ok);
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly revenue: RevenueService,
  ) {}

  /**
   * Le code de confirmation n'est visible que par le client : il le remet au livreur ou au dépôt.
   * Le panier d'origine n'est jamais montré au dépôt : il y verrait les achats du client chez d'autres dépôts.
   */
  private present(order: FullOrder, viewer: User) {
    const view = { ...order, paidOnline: paidOnline(order) };
    // La part d'iGaz sur la livraison se règle entre le dépôt et iGaz : le client n'en a pas l'usage.
    if (order.clientId === viewer.id) { const { platformShare: _share, ...forClient } = view; return forClient; }
    const { confirmationCode: _hidden, checkout, ...rest } = view;
    return viewer.role === 'ADMIN' ? { ...rest, checkout } : rest;
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

  /** Adresse de livraison du client (la sienne uniquement), si au moins une commande est en livraison. */
  private async resolveAddress(user: User, needed: boolean, addressId?: string) {
    if (!needed) return null;
    if (!addressId) throw new BadRequestException('Une adresse est requise pour la livraison');
    const address = await this.prisma.address.findFirst({ where: { id: addressId, userId: user.id }, include: { zone: true } });
    if (!address) throw new BadRequestException('Adresse introuvable');
    return address;
  }

  /**
   * Prépare une commande pour un dépôt, sans rien écrire : dépôt ouvert et validé, mode de remise proposé, zone livrée,
   * produits actifs du dépôt, stock suffisant, échange compatible, prix figés, plafond du paiement à la livraison.
   * Utilisée par la commande directe et par le panier multi-dépôts : mêmes règles dans les deux cas.
   */
  private async prepare(
    dto: Pick<CreateOrderDto, 'storeId' | 'fulfillment' | 'items'>, paymentMethod: PaymentMethod,
    address: { zoneId: string; details: string; zone: { name: string } } | null,
    fees: FeeSettings,
  ) {
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
      if (!address) throw new BadRequestException('Une adresse est requise pour la livraison');
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
      return {
        productId: p.id, kind: item.kind, quantity: item.quantity, unitPrice,
        returnedBrandId: item.kind === 'EXCHANGE' ? item.returnedBrandId : null,
        returnedCylinderTypeId: item.kind === 'EXCHANGE' ? item.returnedCylinderTypeId : null,
      };
    });

    // Frais d'iGaz figés sur la commande : un changement de réglage n'affecte jamais une commande passée.
    const { serviceFee, platformShare } = orderFees(fees, dto.fulfillment, dto.fulfillment === 'DELIVERY' ? store.deliveryFee : 0);
    const { subtotal, deliveryFee, total } = orderTotals(itemsData, dto.fulfillment, store.deliveryFee, serviceFee);

    if (paymentMethod === 'CASH_ON_DELIVERY') {
      const cap = Number(this.config.get('COD_MAX_AMOUNT') ?? 100000);
      if (total > cap) {
        throw new UnprocessableEntityException(`Paiement à la livraison limité à ${cap} FCFA`);
      }
    }

    return { store, fulfillment: dto.fulfillment, zoneId, deliveryDetails, subtotal, deliveryFee, serviceFee, platformShare, total, itemsData };
  }

  /** Écrit une commande préparée (dans la transaction donnée), avec son paiement en espèces le cas échéant. */
  private async write(
    tx: Tx, user: User, prepared: Awaited<ReturnType<OrdersService['prepare']>>, paymentMethod: PaymentMethod, checkoutId?: string,
  ) {
    const status: OrderStatus = paymentMethod === 'MOBILE_MONEY' ? 'PENDING_PAYMENT' : 'SUBMITTED';
    const { store, fulfillment, zoneId, deliveryDetails, subtotal, deliveryFee, serviceFee, platformShare, total, itemsData } = prepared;
    const order = await tx.order.create({
      data: {
        code: `GZ-${randomBytes(4).toString('hex').toUpperCase()}`,
        clientId: user.id, storeId: store.id, checkoutId,
        fulfillment, paymentMethod, status,
        zoneId, deliveryDetails, subtotal, deliveryFee, serviceFee, platformShare, total,
        confirmationCode: String(randomInt(0, 1_000_000)).padStart(6, '0'),
        items: { create: itemsData },
        events: { create: { status, actorId: user.id } },
      },
    });
    // Espèces : chaque dépôt encaisse sa propre commande à la remise, même dans un panier.
    if (paymentMethod === 'CASH_ON_DELIVERY') {
      await tx.payment.create({
        data: { orderId: order.id, method: 'CASH_ON_DELIVERY', amount: total, idempotencyKey: `cod:${order.id}` },
      });
    }
    return order;
  }

  async create(user: User, dto: CreateOrderDto) {
    const address = await this.resolveAddress(user, dto.fulfillment === 'DELIVERY', dto.addressId);
    const prepared = await this.prepare(dto, dto.paymentMethod, address, await this.revenue.settings());
    const created = await this.prisma.$transaction((tx) => this.write(tx, user, prepared, dto.paymentMethod));
    // Espèces : la commande part tout de suite au dépôt (en mobile money, au webhook de paiement).
    if (created.status === 'SUBMITTED') await this.notifications.orderEvent(created.id, 'SUBMITTED');
    return this.present(await this.load(created.id), user);
  }

  /**
   * Panier multi-dépôts : une commande par dépôt, créées ensemble ou pas du tout. Si un dépôt pose problème
   * (fermé, hors zone, stock…), rien n'est créé et le message nomme le dépôt.
   */
  async checkout(user: User, dto: CreateCheckoutDto) {
    const shape = checkoutShapeError(dto.stores);
    if (shape) throw new BadRequestException(shape);
    const address = await this.resolveAddress(user, dto.stores.some((s) => s.fulfillment === 'DELIVERY'), dto.addressId);

    const prepared: Awaited<ReturnType<OrdersService['prepare']>>[] = [];
    const fees = await this.revenue.settings(); // mêmes réglages pour toutes les commandes du panier
    for (const s of dto.stores) {
      try {
        prepared.push(await this.prepare(s, dto.paymentMethod, address, fees));
      } catch (e) {
        throw await this.namedStoreError(e, s.storeId);
      }
    }

    const { checkoutId, orders } = await this.prisma.$transaction(async (tx) => {
      const checkout = await tx.checkout.create({
        data: {
          code: `PN-${randomBytes(4).toString('hex').toUpperCase()}`,
          clientId: user.id, paymentMethod: dto.paymentMethod,
          total: prepared.reduce((sum, p) => sum + p.total, 0),
        },
      });
      const written = [];
      for (const p of prepared) written.push(await this.write(tx, user, p, dto.paymentMethod, checkout.id));
      return { checkoutId: checkout.id, orders: written };
    });
    // Chaque dépôt est prévenu de sa propre commande (en espèces ; en mobile money, au paiement).
    for (const o of orders) if (o.status === 'SUBMITTED') await this.notifications.orderEvent(o.id, 'SUBMITTED');
    return this.getCheckout(user, checkoutId);
  }

  /** Préfixe un refus par le nom du dépôt concerné, pour que le client sache quoi retirer de son panier. */
  private async namedStoreError(e: unknown, storeId: string) {
    if (!(e instanceof HttpException)) return e;
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
    const message = `${store?.name ?? 'Un dépôt du panier'} : ${e.message}`;
    return new HttpException({ statusCode: e.getStatus(), message, error: e.name }, e.getStatus());
  }

  /** Panier du client avec ses commandes (une par dépôt). Introuvable pour tout autre utilisateur. */
  async getCheckout(user: User, id: string) {
    const checkout = await this.prisma.checkout.findUnique({
      where: { id },
      include: {
        // Créées dans la même transaction, les commandes ont la même date : on les range par nom de dépôt.
        orders: { include: ORDER_INCLUDE, orderBy: [{ store: { name: 'asc' } }, { id: 'asc' }] },
        payments: { select: { id: true, method: true, amount: true, status: true, createdAt: true } },
      },
    });
    if (!checkout || checkout.clientId !== user.id) throw new NotFoundException('Panier introuvable');
    return { ...checkout, orders: checkout.orders.map((o) => this.present(o, user)) };
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
    await this.notifications.orderEvent(id, 'ACCEPTED');
    return this.present(await this.load(id), user);
  }

  async reject(user: User, id: string, reason: string) {
    const order = await this.loadForOwner(user, id);
    await this.prisma.$transaction((tx) => this.move(tx, order, 'REJECTED', user.id, reason));
    await this.notifications.orderEvent(id, 'REJECTED', { reason });
    return this.present(await this.load(id), user);
  }

  async ready(user: User, id: string) {
    const order = await this.loadForOwner(user, id);
    if (order.fulfillment !== 'PICKUP') throw new ConflictException('Cette commande est en livraison, pas en retrait');
    await this.prisma.$transaction((tx) => this.move(tx, order, 'READY_FOR_PICKUP', user.id));
    await this.notifications.orderEvent(id, 'READY_FOR_PICKUP');
    return this.present(await this.load(id), user);
  }

  async dispatch(user: User, id: string) {
    const order = await this.loadForOwner(user, id);
    if (order.fulfillment !== 'DELIVERY') throw new ConflictException('Cette commande est en retrait, pas en livraison');
    await this.prisma.$transaction((tx) => this.move(tx, order, 'OUT_FOR_DELIVERY', user.id));
    await this.notifications.orderEvent(id, 'OUT_FOR_DELIVERY');
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
    await this.notifications.orderEvent(id, 'COMPLETED');
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
    const paid = paidOnline(order);
    await this.prisma.$transaction((tx) =>
      this.move(tx, order, 'CANCELLED', user.id,
        paid ? 'Annulée par le client — remboursement à traiter par l’administration' : 'Annulée par le client'));
    await this.notifications.orderEvent(id, 'CANCELLED_BY_CLIENT', { wasVisibleToStore: order.status === 'SUBMITTED' });
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
    await this.notifications.orderEvent(id, 'CANCELLED_BY_ADMIN', { reason, wasVisibleToStore: order.status !== 'PENDING_PAYMENT' });
    return this.get(admin, id);
  }
}
