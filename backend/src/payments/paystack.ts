import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Paystack (agrégateur retenu : Wave, Orange Money, MTN et cartes en Côte d'Ivoire), en franc CFA (XOF).
 * - Session de paiement : POST /transaction/initialize → adresse de la page de paiement Paystack.
 *   Montant XOF multiplié par 100 (règle Paystack, bien que le franc CFA n'ait pas de centimes).
 * - Notification : POST de Paystack sur /payments/paystack/webhook, signée en HMAC-SHA512 du corps brut
 *   (clé de signature des webhooks, ou à défaut la clé secrète), puis revérifiée par GET /transaction/verify.
 * Clés en variables d'environnement (PAYSTACK_SECRET_KEY, PAYSTACK_WEBHOOK_SECRET) : jamais dans le code.
 */
export interface PaystackConfig {
  secretKey: string;
  webhookSecret?: string;
  /** Adresse e-mail transmise à Paystack (obligatoire chez eux) ; {id} est remplacé par la référence du paiement. */
  customerEmail: string;
  baseUrl?: string;
}

export function paystackConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PaystackConfig | null {
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();
  if (!secretKey) return null; // pas de clé : pas de paiement en ligne réel (comportement d'avant)
  return {
    secretKey,
    webhookSecret: env.PAYSTACK_WEBHOOK_SECRET?.trim() || undefined,
    customerEmail: env.PAYSTACK_CUSTOMER_EMAIL?.trim() || 'client-{id}@igaz.ci',
  };
}

/** Montant XOF (entier) → montant Paystack, et retour. */
export const toPaystackAmount = (fcfa: number) => fcfa * 100;
export const fromPaystackAmount = (amount: number) => Math.floor(amount / 100);

const FAILED = 'Le paiement en ligne est indisponible pour le moment. Réessayez dans un instant ou payez à la remise.';

export class PaystackClient {
  private readonly logger = new Logger('Paystack');
  private readonly base: string;

  constructor(private readonly config: PaystackConfig, private readonly http: typeof fetch = fetch) {
    this.base = config.baseUrl ?? 'https://api.paystack.co';
  }

  /** Vrai avec une clé de test (sk_test_…) : aucun argent réel ne circule. */
  get testMode() { return this.config.secretKey.startsWith('sk_test_'); }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.http(`${this.base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.config.secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      this.logger.error(`Paystack injoignable (${path}) : ${(e as Error).name}`);
      throw new ServiceUnavailableException(FAILED);
    }
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
    if (!res.ok || !body?.status) {
      this.logger.error(`Paystack a refusé ${path} (HTTP ${res.status}) : ${body?.message ?? 'réponse illisible'}`);
      throw new ServiceUnavailableException(FAILED);
    }
    return body.data as T;
  }

  /** Crée la page de paiement d'un paiement iGaz (référence = identifiant du paiement). */
  async initialize(p: { reference: string; amount: number; callbackUrl: string; metadata: Record<string, string> }) {
    const data = await this.call<{ authorization_url: string; reference: string; access_code: string }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: this.config.customerEmail.replace('{id}', p.reference.slice(0, 8)),
        amount: toPaystackAmount(p.amount),
        currency: 'XOF',
        reference: p.reference,
        callback_url: p.callbackUrl,
        channels: ['mobile_money', 'card'],
        metadata: p.metadata,
      }),
    });
    return { url: data.authorization_url };
  }

  /** État réel d'une transaction chez Paystack (contre-vérification de chaque notification). */
  async verify(reference: string) {
    const data = await this.call<{ status: string; amount: number; currency: string; id: number; reference: string }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    return { succeeded: data.status === 'success', amount: fromPaystackAmount(data.amount), currency: data.currency, providerRef: String(data.id) };
  }

  /** Signature x-paystack-signature : HMAC-SHA512 (hexadécimal) du corps brut, avec la clé de webhook ou la clé secrète. */
  signatureValid(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature || !/^[0-9a-f]+$/i.test(signature)) return false;
    const given = Buffer.from(signature, 'hex');
    return [this.config.webhookSecret, this.config.secretKey].filter(Boolean).some((key) => {
      const expected = createHmac('sha512', key!).update(rawBody).digest();
      return expected.length === given.length && timingSafeEqual(expected, given);
    });
  }
}
