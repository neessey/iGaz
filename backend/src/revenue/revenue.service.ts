import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { FeeSettings, monthIsClosed, monthOf, monthRange, orderSettlement, statement } from './fees';
import { UpdateFeesDto } from './revenue.dto';

const NO_FEES: FeeSettings = { serviceFee: 0, deliveryShare: 0 };

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly suppliers: SuppliersService,
  ) {}

  /** Réglages en vigueur (aucun réglage enregistré : iGaz ne prend rien). */
  async settings(): Promise<FeeSettings> {
    const s = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    return s ? { serviceFee: s.serviceFee, deliveryShare: s.deliveryShare } : NO_FEES;
  }

  async updateSettings(admin: User, dto: UpdateFeesDto) {
    const before = await this.settings();
    const after = { ...before, ...dto };
    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.platformSettings.upsert({ where: { id: 1 }, create: { id: 1, ...after }, update: after });
      await this.audit.log({ actorId: admin.id, action: 'FEES_UPDATE', entity: 'PlatformSettings', entityId: '1', before, after }, tx);
      return row;
    });
    return { serviceFee: saved.serviceFee, deliveryShare: saved.deliveryShare };
  }

  private range(month: string) {
    const r = monthRange(month);
    if (!r) throw new BadRequestException('Mois attendu au format AAAA-MM');
    return r;
  }

  /** Commandes terminées d'un mois (date de la remise au client), pour un dépôt ou pour tous. */
  private completedOrders(month: string, storeId?: string) {
    const { start, end } = this.range(month);
    return this.prisma.order.findMany({
      where: {
        status: 'COMPLETED', ...(storeId ? { storeId } : {}),
        events: { some: { status: 'COMPLETED', createdAt: { gte: start, lt: end } } },
      },
      select: {
        id: true, code: true, storeId: true, paymentMethod: true, fulfillment: true, total: true, serviceFee: true, platformShare: true,
        events: { where: { status: 'COMPLETED' }, select: { createdAt: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Relevé détaillé d'un dépôt pour un mois : commandes, totaux, solde et règlement éventuel. */
  async storeStatement(storeId: string, month: string) {
    const [orders, settlement] = await Promise.all([
      this.completedOrders(month, storeId),
      this.prisma.settlement.findUnique({ where: { storeId_month: { storeId, month } } }),
    ]);
    return {
      month,
      closed: monthIsClosed(month),
      ...statement(orders),
      settlement,
      lines: orders.map(({ events, storeId: _s, ...o }) => ({ ...o, completedAt: events[0]?.createdAt, ...orderSettlement(o) })),
    };
  }

  /** Relevé d'une boutique du fournisseur connecté (boutique d'un autre : 404). */
  async supplierStatement(user: User, storeId: string, month = monthOf(new Date())) {
    const store = await this.suppliers.requireOwnedStore(user, storeId);
    return { store: { id: store.id, name: store.name }, ...(await this.storeStatement(storeId, month)) };
  }

  /** Vue admin d'un mois : revenus d'iGaz et relevé de chaque dépôt ayant des commandes terminées ou un règlement. */
  async adminMonth(month = monthOf(new Date())) {
    const [orders, settlements] = await Promise.all([
      this.completedOrders(month),
      this.prisma.settlement.findMany({ where: { month } }),
    ]);
    const storeIds = [...new Set([...orders.map((o) => o.storeId), ...settlements.map((s) => s.storeId)])];
    const stores = await this.prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, phone: true, supplier: { select: { businessName: true } } },
    });
    const lines = stores.map((store) => ({
      store,
      ...statement(orders.filter((o) => o.storeId === store.id)),
      settlement: settlements.find((s) => s.storeId === store.id) ?? null,
    })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    return { month, closed: monthIsClosed(month), settings: await this.settings(), ...statement(orders), stores: lines };
  }

  /**
   * Enregistre le règlement du relevé d'un dépôt, une fois l'argent échangé. Seulement pour un mois terminé (le
   * relevé ne bouge plus), une seule fois par dépôt et par mois ; montant = solde calculé, jamais saisi à la main.
   */
  async settle(admin: User, storeId: string, month: string, note?: string) {
    this.range(month);
    if (!monthIsClosed(month)) throw new UnprocessableEntityException('Le mois n’est pas terminé : le relevé peut encore changer');
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Boutique introuvable');
    const { balance, orders } = await this.storeStatement(storeId, month);
    if (orders === 0) throw new UnprocessableEntityException('Aucune commande terminée ce mois-ci pour ce dépôt');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const s = await tx.settlement.create({ data: { storeId, month, amount: balance, note: note?.trim() || null, recordedById: admin.id } });
        await this.audit.log({ actorId: admin.id, action: 'SETTLEMENT', entity: 'Store', entityId: storeId, after: { month, amount: balance, note: s.note } }, tx);
        return s;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ce relevé est déjà réglé');
      }
      throw e;
    }
  }
}
