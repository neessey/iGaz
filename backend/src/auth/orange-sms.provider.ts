import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/**
 * Envoi de SMS par l'API SMS d'Orange (Orange Developer, offre « SMS Côte d'Ivoire »).
 * - Jeton : POST https://api.orange.com/oauth/v3/token (client_credentials, identifiants de « My apps »), valable
 *   une heure ; gardé en mémoire et renouvelé avant expiration ou si Orange répond 401.
 * - Envoi : POST https://api.orange.com/smsmessaging/v1/outbound/{expéditeur encodé}/requests.
 * - Les SMS sont décomptés des forfaits achetés sur le portail (rien n'est envoyé sans forfait).
 * Le texte du message (code de connexion) n'est jamais écrit dans les journaux.
 */
export interface OrangeSmsConfig {
  clientId: string;
  clientSecret: string;
  /** Adresse d'envoi Orange, « tel:+2250000 » pour la Côte d'Ivoire. */
  senderAddress: string;
  /** Nom affiché (11 caractères au plus), seulement s'il est approuvé par Orange pour le contrat. */
  senderName?: string;
  baseUrl?: string;
}

const SENDER_NAME = /^[A-Za-z0-9 ]{1,11}$/;
const MARGIN_MS = 60_000; // jeton renouvelé une minute avant son expiration

export function orangeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OrangeSmsConfig {
  const clientId = env.ORANGE_SMS_CLIENT_ID?.trim();
  const clientSecret = env.ORANGE_SMS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('SMS_PROVIDER=orange : ORANGE_SMS_CLIENT_ID et ORANGE_SMS_CLIENT_SECRET sont requis');
  }
  const senderName = env.ORANGE_SMS_SENDER_NAME?.trim() || undefined;
  if (senderName && !SENDER_NAME.test(senderName)) {
    throw new Error('ORANGE_SMS_SENDER_NAME : 11 lettres, chiffres ou espaces au plus, approuvé par Orange');
  }
  return { clientId, clientSecret, senderAddress: env.ORANGE_SMS_SENDER?.trim() || 'tel:+2250000', senderName };
}

@Injectable()
export class OrangeSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS Orange');
  private token: { value: string; expiresAt: number } | null = null;
  private pending: Promise<string> | null = null;
  private readonly base: string;

  constructor(private readonly config: OrangeSmsConfig, private readonly http: typeof fetch = fetch) {
    super();
    this.base = config.baseUrl ?? 'https://api.orange.com';
  }

  /** Jeton en cours de validité ; un seul renouvellement à la fois, même si plusieurs SMS partent ensemble. */
  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt - MARGIN_MS) return this.token.value;
    this.pending ??= this.fetchToken().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const res = await this.http(`${this.base}/oauth/v3/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      this.logger.error(`Jeton refusé par Orange (HTTP ${res.status}) : vérifiez ORANGE_SMS_CLIENT_ID et ORANGE_SMS_CLIENT_SECRET`);
      throw new ServiceUnavailableException('Envoi du SMS impossible pour le moment. Réessayez dans un instant.');
    }
    const body = (await res.json()) as { access_token: string; expires_in: number | string };
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
    return body.access_token;
  }

  private post(token: string, phone: string, message: string) {
    const { senderAddress, senderName } = this.config;
    return this.http(`${this.base}/smsmessaging/v1/outbound/${encodeURIComponent(senderAddress)}/requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:${phone}`, // numéro déjà normalisé : +225XXXXXXXXXX
          senderAddress,
          ...(senderName ? { senderName } : {}),
          outboundSMSTextMessage: { message },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  }

  async send(phone: string, message: string): Promise<void> {
    let res: Response;
    try {
      res = await this.post(await this.accessToken(), phone, message);
      if (res.status === 401) res = await this.post(await this.accessToken(true), phone, message); // jeton expiré
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      this.logger.error(`Orange injoignable : ${(e as Error).name}`);
      throw new ServiceUnavailableException('Envoi du SMS impossible pour le moment. Réessayez dans un instant.');
    }
    if (!res.ok) { // succès : 201 Created
      // Ex. forfait épuisé ou expiré, nom d'expéditeur non approuvé : visible dans les journaux, pas le message.
      const detail = await res.text().catch(() => '');
      this.logger.error(`Envoi refusé par Orange (HTTP ${res.status}) vers ${phone.slice(0, 7)}… : ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException('Envoi du SMS impossible pour le moment. Réessayez dans un instant.');
    }
  }
}
