import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider } from '../auth/sms.provider';
import { PrismaService } from '../prisma/prisma.service';
import { orderMessages, OrderNotifyEvent } from './messages';
import { PushSender } from './push.sender';

/**
 * Prévient le client et le dépôt des étapes d'une commande : notification dans l'application, push sur les
 * téléphones abonnés et, en option (NOTIFY_SUPPLIER_BY_SMS=true), SMS au dépôt pour chaque nouvelle commande.
 * Ne lève jamais d'erreur : une notification ratée ne doit pas faire échouer la commande.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
    private readonly sms: SmsProvider,
    private readonly config: ConfigService,
  ) {}

  async orderEvent(orderId: string, event: OrderNotifyEvent, extra: { reason?: string | null; wasVisibleToStore?: boolean } = {}) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: { include: { brand: true, cylinderType: true } } } },
          store: { include: { supplier: { select: { userId: true } } } },
          zone: { select: { name: true } },
          payments: { select: { method: true, status: true } },
          checkout: { select: { payments: { select: { method: true, status: true } } } },
        },
      });
      if (!order) return;
      const paid = (p: { method: string; status: string }) => p.method === 'MOBILE_MONEY' && p.status === 'SUCCEEDED';
      const messages = orderMessages(event, {
        id: order.id, code: order.code, storeName: order.store.name, fulfillment: order.fulfillment, total: order.total,
        items: order.items.map((i) => `${i.quantity} × ${i.product.brand.name} ${i.product.cylinderType.label}`).join(', '),
        zone: order.zone?.name, cash: order.paymentMethod === 'CASH_ON_DELIVERY',
        paidOnline: order.payments.some(paid) || !!order.checkout?.payments.some(paid),
        ...extra,
      });

      for (const m of messages) {
        const userId = m.to === 'CLIENT' ? order.clientId : order.store.supplier.userId;
        await this.prisma.notification.create({
          data: { userId, kind: m.kind, title: m.title, body: m.body, url: m.url, orderId: order.id },
        });
        await this.pushTo(userId, { title: m.title, body: m.body, url: m.url });
        if (m.to === 'STORE' && m.kind === 'ORDER_NEW' && this.config.get('NOTIFY_SUPPLIER_BY_SMS') === 'true') {
          await this.sms.send(order.store.phone, `iGaz : ${m.title}. ${m.body}`);
        }
      }
    } catch (e) {
      this.logger.warn(`Notification non envoyée (commande ${orderId}, ${event}) : ${(e as Error).message}`);
    }
  }

  /** Notification simple à un utilisateur (avis, réponse…), dans l'application et en push. Ne lève jamais d'erreur. */
  async notifyUser(userId: string, m: { kind: string; title: string; body: string; url: string; orderId?: string }) {
    try {
      await this.prisma.notification.create({ data: { userId, kind: m.kind, title: m.title, body: m.body, url: m.url, orderId: m.orderId } });
      await this.pushTo(userId, { title: m.title, body: m.body, url: m.url });
    } catch (e) {
      this.logger.warn(`Notification non envoyée (${m.kind}) : ${(e as Error).message}`);
    }
  }

  private async pushTo(userId: string, payload: { title: string; body: string; url: string }) {
    if (!this.push.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    for (const s of subs) {
      const alive = await this.push.send(s, payload);
      if (!alive) await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
    }
  }
}
