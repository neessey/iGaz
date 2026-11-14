import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { authorName, REVIEW_WINDOW_DAYS, reviewWindowOpen, storeRating, tidyText } from './review-rules';
import { ReviewDto } from './reviews.dto';

const PUBLIC_REVIEW = {
  id: true, rating: true, comment: true, reply: true, repliedAt: true, createdAt: true, updatedAt: true,
  client: { select: { name: true } },
} satisfies Prisma.ReviewSelect;

/** Avis public : l'auteur réduit à « Prénom I. », jamais son numéro ni son identifiant. */
const present = <T extends { client: { name: string | null } }>({ client, ...r }: T) => ({ ...r, author: authorName(client.name) });

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Le client note le dépôt d'une de ses commandes terminées (ou modifie sa note), dans les 30 jours après la remise.
   * Commande d'un autre client : 404. Compteurs du dépôt mis à jour dans la même transaction.
   */
  async upsert(user: User, orderId: string, dto: ReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        review: true, store: { include: { supplier: { select: { userId: true } } } },
        events: { where: { status: 'COMPLETED' }, select: { createdAt: true }, take: 1 },
      },
    });
    if (!order || order.clientId !== user.id) throw new NotFoundException('Commande introuvable');
    if (order.status !== 'COMPLETED' || !order.events[0]) {
      throw new ConflictException('Vous pourrez noter le dépôt une fois la commande remise');
    }
    if (!reviewWindowOpen(order.events[0].createdAt)) {
      throw new UnprocessableEntityException(`Les avis se donnent dans les ${REVIEW_WINDOW_DAYS} jours qui suivent la remise`);
    }
    const comment = tidyText(dto.comment);
    const before = order.review;

    const review = await this.prisma.$transaction(async (tx) => {
      if (!before) {
        const created = await tx.review.create({
          data: { orderId, storeId: order.storeId, clientId: user.id, rating: dto.rating, comment },
        });
        await tx.store.update({ where: { id: order.storeId }, data: { ratingCount: { increment: 1 }, ratingSum: { increment: dto.rating } } });
        return created;
      }
      const updated = await tx.review.update({ where: { id: before.id }, data: { rating: dto.rating, comment } });
      if (!before.hidden && before.rating !== dto.rating) {
        await tx.store.update({ where: { id: order.storeId }, data: { ratingSum: { increment: dto.rating - before.rating } } });
      }
      return updated;
    }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Votre avis est déjà enregistré'); // double envoi simultané
      }
      throw e;
    });

    if (!before) {
      await this.notifications.notifyUser(order.store.supplier.userId, {
        kind: 'REVIEW_NEW', title: `Nouvel avis : ${'★'.repeat(dto.rating)}${'☆'.repeat(5 - dto.rating)}`,
        body: comment ? `« ${comment.slice(0, 120)} » Vous pouvez y répondre.` : 'Un client a noté votre dépôt.',
        url: '/fournisseur/avis', orderId,
      });
    }
    return review;
  }

  /** Note et avis visibles d'un dépôt (public). Dépôt inconnu ou non validé : 404. */
  async forStore(storeId: string, take = 20) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, supplier: { status: 'APPROVED' } },
      select: { ratingCount: true, ratingSum: true },
    });
    if (!store) throw new NotFoundException('Boutique introuvable');
    const reviews = await this.prisma.review.findMany({
      where: { storeId, hidden: false }, select: PUBLIC_REVIEW, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(take, 1), 50),
    });
    return { rating: storeRating(store.ratingCount, store.ratingSum), reviews: reviews.map(present) };
  }

  /** Avis du dépôt du fournisseur connecté, masqués compris (signalés). Boutique d'un autre : 404. */
  async forSupplier(user: User, storeId: string) {
    const store = await this.suppliers.requireOwnedStore(user, storeId);
    const reviews = await this.prisma.review.findMany({
      where: { storeId }, select: { ...PUBLIC_REVIEW, hidden: true, order: { select: { code: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
    return { rating: storeRating(store.ratingCount, store.ratingSum), reviews: reviews.map(present) };
  }

  /** Réponse publique du dépôt, une seule fois. Avis d'un autre dépôt : 404. */
  async reply(user: User, storeId: string, reviewId: string, text: string) {
    await this.suppliers.requireOwnedStore(user, storeId);
    const review = await this.prisma.review.findFirst({ where: { id: reviewId, storeId }, include: { store: { select: { name: true } } } });
    if (!review) throw new NotFoundException('Avis introuvable');
    if (review.reply) throw new ConflictException('Vous avez déjà répondu à cet avis');
    const reply = tidyText(text);
    if (!reply) throw new UnprocessableEntityException('Écrivez votre réponse');
    // Mise à jour conditionnelle : deux réponses simultanées n'en enregistrent qu'une.
    const { count } = await this.prisma.review.updateMany({ where: { id: reviewId, reply: null }, data: { reply, repliedAt: new Date() } });
    if (count === 0) throw new ConflictException('Vous avez déjà répondu à cet avis');
    await this.notifications.notifyUser(review.clientId, {
      kind: 'REVIEW_REPLY', title: `${review.store.name} a répondu à votre avis`, body: reply.slice(0, 140),
      url: `/commandes/${review.orderId}`, orderId: review.orderId,
    });
    return this.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
  }

  /** Liste admin : derniers avis, masqués compris, avec le dépôt et la commande. */
  adminList(hiddenOnly = false) {
    return this.prisma.review.findMany({
      where: hiddenOnly ? { hidden: true } : {},
      include: { store: { select: { id: true, name: true } }, order: { select: { code: true } }, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }).then((list) => list.map(present));
  }

  /** Masquer (abus) ou réafficher un avis : moyenne du dépôt corrigée, action tracée dans le journal d'audit. */
  async setHidden(admin: User, reviewId: string, hidden: boolean, reason?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Avis introuvable');
    if (review.hidden === hidden) return review;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.review.updateMany({ where: { id: reviewId, hidden: !hidden }, data: { hidden } });
      if (count === 0) return tx.review.findUniqueOrThrow({ where: { id: reviewId } }); // déjà fait en parallèle
      const sign = hidden ? -1 : 1;
      await tx.store.update({
        where: { id: review.storeId },
        data: { ratingCount: { increment: sign }, ratingSum: { increment: sign * review.rating } },
      });
      await this.audit.log({
        actorId: admin.id, action: hidden ? 'REVIEW_HIDDEN' : 'REVIEW_SHOWN', entity: 'Review', entityId: reviewId,
        before: { hidden: review.hidden }, after: { hidden, reason: tidyText(reason) },
      }, tx);
      return tx.review.findUniqueOrThrow({ where: { id: reviewId } });
    });
  }
}
