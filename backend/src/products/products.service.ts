import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockReason, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { isStoreOpenNow } from '../orders/order-rules';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CreateProductDto, SearchProductsQuery, UpdateProductDto } from './products.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  /** Fixe la quantité absolue d'un produit et journalise le mouvement correspondant. */
  async applyStock(
    tx: Tx, productId: string, quantity: number,
    reason: StockReason, actorId: string, note?: string,
  ) {
    const current = await tx.inventory.findUnique({ where: { productId } });
    const before = current?.quantity ?? 0;
    const inventory = await tx.inventory.upsert({
      where: { productId },
      create: { productId, quantity },
      update: { quantity },
    });
    if (quantity !== before) {
      await tx.stockMovement.create({
        data: { productId, delta: quantity - before, reason, actorId, note },
      });
    }
    return { inventory, before };
  }

  async create(user: User, storeId: string, dto: CreateProductDto) {
    await this.suppliers.requireOwnedStore(user, storeId);
    const [brand, cylinder] = await Promise.all([
      this.prisma.gasBrand.findFirst({ where: { id: dto.brandId, isActive: true } }),
      this.prisma.cylinderType.findFirst({ where: { id: dto.cylinderTypeId, isActive: true } }),
    ]);
    if (!brand || !cylinder) {
      throw new BadRequestException('Marque ou format absent du catalogue central');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            storeId, brandId: dto.brandId, cylinderTypeId: dto.cylinderTypeId,
            purchasePrice: dto.purchasePrice, exchangePrice: dto.exchangePrice,
          },
        });
        await this.applyStock(tx, product.id, dto.quantity ?? 0, 'SUPPLIER_UPDATE', user.id);
        return tx.product.findUniqueOrThrow({
          where: { id: product.id }, include: { brand: true, cylinderType: true, inventory: true },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ce produit existe déjà dans votre boutique');
      }
      throw e;
    }
  }

  async update(user: User, storeId: string, productId: string, dto: UpdateProductDto) {
    await this.suppliers.requireOwnedStore(user, storeId);
    const found = await this.prisma.product.findFirst({ where: { id: productId, storeId } });
    if (!found) throw new NotFoundException('Produit introuvable');
    // Un changement de prix n'affecte jamais les commandes déjà validées : le prix est copié dans OrderItem.
    return this.prisma.product.update({ where: { id: productId }, data: dto, include: { inventory: true } });
  }

  async setStock(user: User, storeId: string, productId: string, quantity: number) {
    await this.suppliers.requireOwnedStore(user, storeId);
    const found = await this.prisma.product.findFirst({ where: { id: productId, storeId } });
    if (!found) throw new NotFoundException('Produit introuvable');
    return this.prisma.$transaction((tx) =>
      this.applyStock(tx, productId, quantity, 'SUPPLIER_UPDATE', user.id).then((r) => r.inventory));
  }

  async listForStore(user: User, storeId: string) {
    await this.suppliers.requireOwnedStore(user, storeId);
    return this.prisma.product.findMany({
      where: { storeId },
      include: { brand: true, cylinderType: true, inventory: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async movements(user: User, storeId: string, productId: string) {
    await this.suppliers.requireOwnedStore(user, storeId);
    return this.prisma.stockMovement.findMany({
      where: { productId, product: { storeId } }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  /** Correction administrative du stock : justification obligatoire et trace dans le journal d'audit. */
  async adminCorrectStock(admin: User, productId: string, quantity: number, note: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produit introuvable');
    return this.prisma.$transaction(async (tx) => {
      const { inventory, before } = await this.applyStock(tx, productId, quantity, 'ADMIN_CORRECTION', admin.id, note);
      await this.audit.log({
        actorId: admin.id, action: 'STOCK_CORRECTION', entity: 'Product', entityId: productId,
        before: { quantity: before }, after: { quantity, note },
      }, tx);
      return inventory;
    });
  }

  /**
   * Recherche publique. Ne retourne que les offres réellement commandables :
   * produit actif, stock > 0, fournisseur validé, boutique ouverte (horaires compris),
   * mode de remise proposé et zone desservie.
   */
  async search(q: SearchProductsQuery, now = new Date()) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      brand: { isActive: true },
      cylinderType: { isActive: true },
      inventory: { quantity: { gt: 0 } },
      store: {
        isOpen: true,
        supplier: { status: 'APPROVED' },
        ...(q.fulfillment === 'DELIVERY' ? { offersDelivery: true } : {}),
        ...(q.fulfillment === 'PICKUP' ? { offersPickup: true } : {}),
        ...(q.zoneId ? { areas: { some: { zoneId: q.zoneId } } } : {}),
      },
      ...(q.brandId ? { brandId: q.brandId } : {}),
      ...(q.cylinderTypeId ? { cylinderTypeId: q.cylinderTypeId } : {}),
      ...(q.maxPrice !== undefined ? { purchasePrice: { lte: q.maxPrice } } : {}),
    };
    const products = await this.prisma.product.findMany({
      where,
      include: {
        brand: true, cylinderType: true, inventory: { select: { quantity: true } },
        store: {
          select: {
            id: true, name: true, address: true, phone: true, opensAt: true, closesAt: true,
            offersDelivery: true, offersPickup: true, deliveryFee: true,
          },
        },
      },
      orderBy: { purchasePrice: 'asc' },
      take: 200,
    });
    return products.filter((p) => isStoreOpenNow(p.store.opensAt, p.store.closesAt, now)).slice(0, 50);
  }
}
