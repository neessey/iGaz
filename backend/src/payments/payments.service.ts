import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment, Prisma, User } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { PaymentWebhookDto } from './payments.dto';
import { PaystackClient } from './paystack';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cible d'un paiement mobile money : une commande directe ou un panier multi-dépôts (un seul paiement). */
type Target = { orderId: string } | { checkoutId: string };

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @Optional() @Inject(PaystackClient) private readonly paystack: PaystackClient | null = null,
  ) {}

  /**
   * Démarre (ou retrouve) le paiement mobile money d'une commande directe.
   * Idempotent : même clé → même paiement ; un paiement déjà en attente pour la commande est réutilisé.
   * L'appel à l'agrégateur (création de la session de paiement) se branche ici une fois le prestataire choisi.
   */
  async initiate(user: User, orderId: string, idempotencyKey: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.clientId !== user.id) throw new NotFoundException('Commande introuvable');
    if (order.paymentMethod !== 'MOBILE_MONEY') throw new ConflictException('Cette commande ne se paie pas en ligne');
    if (order.checkoutId) throw new ConflictException('Cette commande fait partie d’un panier : payez le panier en une fois');
    if (order.status !== 'PENDING_PAYMENT') throw new ConflictException(`Commande non payable (statut ${order.status})`);
    return this.startPayment({ orderId }, order.total, idempotencyKey);
  }

  /**
   * Paiement unique d'un panier multi-dépôts : montant = commandes du panier encore en attente de paiement
   * (une commande annulée avant le paiement n'est pas facturée). Mêmes garanties d'idempotence.
   */
  async initiateCheckout(user: User, checkoutId: string, idempotencyKey: string) {
    const checkout = await this.prisma.checkout.findUnique({ where: { id: checkoutId }, include: { orders: true } });
    if (!checkout || checkout.clientId !== user.id) throw new NotFoundException('Panier introuvable');
    if (checkout.paymentMethod !== 'MOBILE_MONEY') throw new ConflictException('Ce panier ne se paie pas en ligne');
    const due = checkout.orders.filter((o) => o.status === 'PENDING_PAYMENT');
    if (due.length === 0) throw new ConflictException('Aucune commande de ce panier n’attend de paiement');
    return this.startPayment({ checkoutId }, due.reduce((sum, o) => sum + o.total, 0), idempotencyKey);
  }

  private async startPayment(target: Target, amount: number, idempotencyKey: string) {
    const sameTarget = (p: Payment) => ('orderId' in target ? p.orderId === target.orderId : p.checkoutId === target.checkoutId);

    const byKey = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (byKey) {
      if (!sameTarget(byKey)) throw new ConflictException('Clé d’idempotence déjà utilisée');
      return this.view(await this.withSession(byKey));
    }
    const pending = await this.prisma.payment.findFirst({ where: { ...target, status: 'PENDING' } });
    if (pending) return this.view(await this.withSession(pending));

    try {
      const payment = await this.prisma.payment.create({ data: { ...target, method: 'MOBILE_MONEY', amount, idempotencyKey } });
      return this.view(await this.withSession(payment));
    } catch (e) {
      // Double clic simultané : l'une des deux requêtes perd la course sur la contrainte d'unicité.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.payment.findFirst({
          where: { OR: [{ idempotencyKey }, { ...target, status: 'PENDING' }] },
        });
        if (existing) return this.view(await this.withSession(existing));
      }
      throw e;
    }
  }

  /**
   * Page de paiement Paystack d'un paiement en attente, créée une seule fois (référence Paystack = id du paiement)
   * puis réutilisée. Si Paystack refuse, le paiement passe en échec : le client pourra réessayer (nouveau paiement).
   */
  private async withSession(p: Payment): Promise<Payment> {
    if (!this.paystack || p.status !== 'PENDING' || p.checkoutUrl) return p;
    const web = (this.config.get<string>('APP_URL') ?? this.config.get<string>('CORS_ORIGIN')?.split(',').pop() ?? '').trim().replace(/\/$/, '');
    const back = p.orderId ? `/commandes/${p.orderId}` : `/commandes/panier/${p.checkoutId}`;
    try {
      const { url } = await this.paystack.initialize({
        reference: p.id, amount: p.amount, callbackUrl: `${web}${back}`,
        metadata: p.orderId ? { orderId: p.orderId } : { checkoutId: p.checkoutId! },
      });
      return await this.prisma.payment.update({ where: { id: p.id }, data: { checkoutUrl: url } });
    } catch (e) {
      await this.prisma.payment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      throw e;
    }
  }

  private view(p: Payment) {
    return { id: p.id, orderId: p.orderId, checkoutId: p.checkoutId, amount: p.amount, status: p.status, checkoutUrl: p.checkoutUrl };
  }

  /**
   * Notification Paystack : signature HMAC-SHA512 vérifiée, puis transaction revérifiée auprès de Paystack (jamais
   * crue sur parole). Seul « charge.success » confirme un paiement ; le reste est accusé et ignoré.
   */
  async handlePaystack(rawBody: Buffer | undefined, signature: string | undefined, event: { event?: string; data?: { reference?: string } }) {
    if (!this.paystack) throw new NotFoundException('Paiement en ligne non configuré');
    if (!this.paystack.signatureValid(rawBody, signature)) throw new UnauthorizedException('Signature invalide');
    const reference = event?.data?.reference;
    if (event?.event !== 'charge.success' || !reference || !UUID.test(reference)) return { ok: true, ignored: true };
    const tx = await this.paystack.verify(reference);
    if (!tx.succeeded) return { ok: true, ignored: true };
    if (tx.currency !== 'XOF') throw new BadRequestException('Devise inattendue');
    return this.handleWebhook({ reference, status: 'SUCCEEDED', amount: tx.amount, providerRef: tx.providerRef });
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
      const submitted: string[] = [];
      const result = await this.prisma.$transaction(async (tx) => {
        // Transition PENDING → SUCCEEDED atomique : un rejeu du webhook ne fait rien.
        const res = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: { status: 'SUCCEEDED', providerRef: dto.providerRef },
        });
        if (res.count === 0) return { ok: true, duplicate: true };

        if (payment.orderId) {
          if (await this.submitPaid(tx, payment.orderId, 'Paiement confirmé')) submitted.push(payment.orderId);
        } else {
          // Panier : toutes les commandes payées par ce paiement partent ensemble à leurs dépôts.
          const orders = await tx.order.findMany({ where: { checkoutId: payment.checkoutId! }, include: { events: true } });
          for (const o of orders) {
            // Une commande annulée avant le lancement du paiement n'a pas été facturée : rien à rembourser.
            const cancelledBefore = o.status === 'CANCELLED' &&
              o.events.some((e) => e.status === 'CANCELLED' && e.createdAt < payment.createdAt);
            if (!cancelledBefore && await this.submitPaid(tx, o.id, 'Paiement du panier confirmé')) submitted.push(o.id);
          }
        }
        return { ok: true };
      });
      // Après l'enregistrement : chaque dépôt est prévenu de la commande qui vient de lui être transmise.
      for (const id of submitted) await this.notifications.orderEvent(id, 'SUBMITTED');
      return result;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Référence prestataire déjà utilisée');
      }
      throw e;
    }
  }

  /**
   * Commande payée : transmise au dépôt (retourne true) ; si elle a été annulée entre-temps, on le signale pour
   * remboursement (retourne false).
   */
  private async submitPaid(tx: Tx, orderId: string, note: string): Promise<boolean> {
    const moved = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING_PAYMENT' }, data: { status: 'SUBMITTED' } });
    if (moved.count === 1) {
      await tx.orderEvent.create({ data: { orderId, status: 'SUBMITTED', note } });
      return true;
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await tx.orderEvent.create({
      data: { orderId, status: order.status, note: 'Paiement reçu après annulation — remboursement à traiter' },
    });
    return false;
  }
}
