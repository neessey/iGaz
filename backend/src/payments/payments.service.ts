import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment, Prisma, User } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentWebhookDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  /**
   * Démarre (ou retrouve) le paiement mobile money d'une commande.
   * Idempotent : même clé → même paiement ; un paiement déjà en attente pour la commande est réutilisé.
   * L'appel à l'agrégateur (création de la session de paiement) se branche ici une fois le prestataire choisi.
   */
  async initiate(user: User, orderId: string, idempotencyKey: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.clientId !== user.id) throw new NotFoundException('Commande introuvable');
    if (order.paymentMethod !== 'MOBILE_MONEY') throw new ConflictException('Cette commande ne se paie pas en ligne');
    if (order.status !== 'PENDING_PAYMENT') throw new ConflictException(`Commande non payable (statut ${order.status})`);

    const byKey = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (byKey) {
      if (byKey.orderId !== orderId) throw new ConflictException('Clé d’idempotence déjà utilisée');
      return this.view(byKey);
    }
    const pending = await this.prisma.payment.findFirst({ where: { orderId, status: 'PENDING' } });
    if (pending) return this.view(pending);

    try {
      const payment = await this.prisma.payment.create({
        data: { orderId, method: 'MOBILE_MONEY', amount: order.total, idempotencyKey },
      });
      return this.view(payment);
    } catch (e) {
      // Double clic simultané : l'une des deux requêtes perd la course sur la contrainte d'unicité.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.payment.findFirst({
          where: { OR: [{ idempotencyKey }, { orderId, status: 'PENDING' }] },
        });
        if (existing) return this.view(existing);
      }
      throw e;
    }
  }

  private view(p: Payment) {
    // checkoutUrl : renseigné par l'intégration de l'agrégateur de paiement (à brancher).
    return { id: p.id, orderId: p.orderId, amount: p.amount, status: p.status, checkoutUrl: null as string | null };
  }

  /** Vérifie la signature HMAC-SHA256 du corps brut. Le schéma exact sera aligné sur celui de l'agrégateur retenu. */
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): void {
    const secret = this.config.getOrThrow<string>('PAYMENT_WEBHOOK_SECRET');
    if (!rawBody || !signature) throw new UnauthorizedException('Signature manquante');
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    let given: Buffer;
    try {
      given = Buffer.from(signature, 'hex');
    } catch {
      throw new UnauthorizedException('Signature invalide');
    }
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Signature invalide');
    }
  }

  /**
   * Seule source de vérité d'un paiement mobile money : la notification serveur à serveur de l'agrégateur.
   * Un retour de navigateur ne confirme jamais un paiement. Traitement idempotent.
   */
  async handleWebhook(dto: PaymentWebhookDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id: dto.reference } });
    if (!payment) throw new NotFoundException('Paiement inconnu');
    if (dto.amount !== payment.amount) throw new BadRequestException('Montant incohérent');

    if (dto.status === 'FAILED') {
      await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      return { ok: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Transition PENDING → SUCCEEDED atomique : un rejeu du webhook ne fait rien.
        const res = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'SUCCEEDED', providerRef: dto.providerRef },
        });
        if (res.count === 0) return { ok: true, duplicate: true };

        const moved = await tx.order.updateMany({
          where: { id: payment.orderId, status: 'PENDING_PAYMENT' }, data: { status: 'SUBMITTED' },
        });
        if (moved.count === 1) {
          await tx.orderEvent.create({ data: { orderId: payment.orderId, status: 'SUBMITTED', note: 'Paiement confirmé' } });
        } else {
          // Paiement reçu sur une commande déjà annulée : on le signale pour remboursement.
          const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
          await tx.orderEvent.create({
            data: { orderId: order.id, status: order.status, note: 'Paiement reçu après annulation — remboursement à traiter' },
          });
        }
        return { ok: true };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Référence prestataire déjà utilisée');
      }
      throw e;
    }
  }
}
