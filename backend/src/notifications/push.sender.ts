import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export interface PushPayload { title: string; body: string; url: string }

/** Envoi des notifications push. Retourne false si l'abonnement n'existe plus (à supprimer). */
export abstract class PushSender {
  abstract readonly enabled: boolean;
  abstract readonly publicKey: string | null;
  abstract send(target: PushTarget, payload: PushPayload): Promise<boolean>;
}

/**
 * Web Push (standard des navigateurs, fonctionne dans l'application Android installée). Nécessite des clés VAPID :
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…). Sans clés, le push est simplement désactivé.
 */
@Injectable()
export class WebPushSender extends PushSender {
  private readonly logger = new Logger('Push');
  readonly enabled: boolean;
  readonly publicKey: string | null;

  constructor(config: ConfigService) {
    super();
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    this.enabled = !!(pub && priv);
    this.publicKey = this.enabled ? pub! : null;
    if (this.enabled) webpush.setVapidDetails(config.get('VAPID_SUBJECT') ?? 'mailto:contact@igaz.ci', pub!, priv!);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<boolean> {
    if (!this.enabled) return true;
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      return true;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return false; // abonnement expiré ou révoqué
      this.logger.warn(`Échec d'envoi push (${status ?? 'réseau'})`);
      return true;
    }
  }
}
