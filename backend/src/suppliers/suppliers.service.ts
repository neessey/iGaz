import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Supplier, SupplierStatus, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { normalizeIvorianPhone } from '../orders/order-rules';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto, RegisterSupplierDto, UpdateStoreDto } from './suppliers.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async register(user: User, dto: RegisterSupplierDto) {
    if (user.role === 'ADMIN') throw new ForbiddenException('Un administrateur ne peut pas être fournisseur');
    const existing = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
    if (existing) throw new ConflictException('Une demande fournisseur existe déjà pour ce compte');

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          userId: user.id,
          businessName: dto.businessName.trim(),
          documents: { create: dto.documents ?? [] },
        },
        include: { documents: true },
      });
      await tx.user.update({ where: { id: user.id }, data: { role: 'SUPPLIER' } });
      return supplier;
    });
  }

  async me(user: User) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId: user.id },
      include: { documents: true, stores: { include: { areas: true } } },
    });
    if (!supplier) throw new NotFoundException("Vous n'avez pas de compte fournisseur");
    return supplier;
  }

  /** Fournisseur connecté, obligatoirement validé par l'administration pour toute action commerciale. */
  async requireApproved(user: User): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
    if (!supplier) throw new ForbiddenException("Vous n'avez pas de compte fournisseur");
    if (supplier.status !== 'APPROVED') {
      throw new ForbiddenException(`Compte fournisseur non actif (statut : ${supplier.status})`);
    }
    return supplier;
  }

  /** Cloisonnement : retourne la boutique uniquement si elle appartient au fournisseur connecté. */
  async requireOwnedStore(user: User, storeId: string) {
    const supplier = await this.requireApproved(user);
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    // 404 plutôt que 403 : on ne révèle pas l'existence des boutiques des autres fournisseurs.
    if (!store || store.supplierId !== supplier.id) throw new NotFoundException('Boutique introuvable');
    return store;
  }

  private async assertZones(zoneIds: string[]) {
    const unique = [...new Set(zoneIds)];
    const count = await this.prisma.serviceZone.count({ where: { id: { in: unique }, isActive: true } });
    if (count !== unique.length) throw new BadRequestException('Zone de livraison inconnue ou inactive');
    return unique;
  }

  async createStore(user: User, dto: CreateStoreDto) {
    const supplier = await this.requireApproved(user);
    const phone = normalizeIvorianPhone(dto.phone);
    if (!phone) throw new BadRequestException('Numéro de téléphone ivoirien invalide');
    const zoneIds = await this.assertZones(dto.zoneIds);
    if (dto.offersDelivery === false && dto.offersPickup === false) {
      throw new BadRequestException('La boutique doit proposer la livraison ou le retrait');
    }
    const { zoneIds: _z, ...data } = dto;
    return this.prisma.store.create({
      data: {
        ...data, phone, supplierId: supplier.id,
        areas: { create: zoneIds.map((zoneId) => ({ zoneId })) },
      },
      include: { areas: true },
    });
  }

  async updateStore(user: User, storeId: string, dto: UpdateStoreDto) {
    const store = await this.requireOwnedStore(user, storeId);
    const { zoneIds, phone, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (phone !== undefined) {
      const normalized = normalizeIvorianPhone(phone);
      if (!normalized) throw new BadRequestException('Numéro de téléphone ivoirien invalide');
      data.phone = normalized;
    }
    const offersDelivery = dto.offersDelivery ?? store.offersDelivery;
    const offersPickup = dto.offersPickup ?? store.offersPickup;
    if (!offersDelivery && !offersPickup) {
      throw new BadRequestException('La boutique doit proposer la livraison ou le retrait');
    }
    const zones = zoneIds ? await this.assertZones(zoneIds) : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (zones) {
        await tx.storeServiceArea.deleteMany({ where: { storeId } });
        await tx.storeServiceArea.createMany({ data: zones.map((zoneId) => ({ storeId, zoneId })) });
      }
      return tx.store.update({ where: { id: storeId }, data, include: { areas: true } });
    });
  }

  async myStores(user: User) {
    const supplier = await this.requireApproved(user);
    return this.prisma.store.findMany({ where: { supplierId: supplier.id }, include: { areas: true } });
  }

  // ---- Administration ----
  listForAdmin(status?: SupplierStatus) {
    return this.prisma.supplier.findMany({
      where: status ? { status } : {},
      include: { documents: true, user: { select: { phone: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setStatus(admin: User, supplierId: string, status: SupplierStatus, allowedFrom: SupplierStatus[]) {
    const before = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!before) throw new NotFoundException('Fournisseur introuvable');
    if (!allowedFrom.includes(before.status)) {
      throw new ConflictException(`Transition impossible depuis le statut ${before.status}`);
    }
    const after = await this.prisma.supplier.update({ where: { id: supplierId }, data: { status } });
    await this.audit.log({
      actorId: admin.id, action: `SUPPLIER_${status}`, entity: 'Supplier', entityId: supplierId, before, after,
    });
    return after;
  }
}
