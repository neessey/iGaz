import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SmsProvider } from './sms.provider';

/**
 * Envoi de SMS par Celcom Africa (Orange, MTN et Moov en Côte d'Ivoire, crédit payé en FCFA).
 * POST https://isms.celcomafrica.com/api/services/sendsms/ avec la clé et l'identifiant partenaire du tableau de bord
 * Celcom, le numéro au format international sans « + » (225XXXXXXXXXX) et le nom d'expéditeur approuvé (« shortcode »).
 * La réponse donne un code par destinataire (« respose-code », orthographe de Celcom) : 200 = accepté.
 * Le texte du message (code de connexion) n'est jamais écrit dans les journaux.
 */
export interface CelcomSmsConfig {
  apiKey: string;
  partnerId: string;
  /** Nom d'expéditeur enregistré chez Celcom (obligatoire : MTN refuse les envois depuis un numéro). */
  sender: string;
  url?: string;
}

/** Codes d'erreur de Celcom, pour des journaux lisibles. */
export const CELCOM_ERRORS: Record<number, string> = {
  1001: 'nom d’expéditeur invalide ou non approuvé',
  1002: 'réseau non autorisé',
  1003: 'numéro invalide',
  1004: 'crédit SMS insuffisant',
  1005: 'erreur du système Celcom',
  1006: 'identifiants invalides (CELCOM_API_KEY, CELCOM_PARTNER_ID)',
  1007: 'erreur du système Celcom',
  4090: 'erreur interne Celcom (réessayer plus tard)',
  4091: 'identifiant partenaire manquant',
  4092: 'clé d’API manquante',
  4093: 'compte introuvable',
};

export function celcomConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CelcomSmsConfig {
  const apiKey = env.CELCOM_API_KEY?.trim();
  const partnerId = env.CELCOM_PARTNER_ID?.trim();
  const sender = env.CELCOM_SENDER?.trim();
  if (!apiKey || !partnerId || !sender) {
    throw new Error('SMS_PROVIDER=celcom : CELCOM_API_KEY, CELCOM_PARTNER_ID et CELCOM_SENDER sont requis');
  }
  return { apiKey, partnerId, sender };
}

const FAILED = 'Envoi du SMS impossible pour le moment. Réessayez dans un instant.';

@Injectable()
export class CelcomSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS Celcom');

  constructor(private readonly config: CelcomSmsConfig, private readonly http: typeof fetch = fetch) {
    super();
  }

  async send(phone: string, message: string): Promise<void> {
    const mobile = phone.replace(/^\+/, ''); // numéro déjà normalisé : +225XXXXXXXXXX → 225XXXXXXXXXX
    let res: Response;
    try {
      res = await this.http(this.config.url ?? 'https://isms.celcomafrica.com/api/services/sendsms/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          apikey: this.config.apiKey, partnerID: this.config.partnerId, shortcode: this.config.sender, mobile, message,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.error(`Celcom injoignable : ${(e as Error).name}`);
      throw new ServiceUnavailableException(FAILED);
    }

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    // Réponse par destinataire, ou erreur globale (identifiants manquants…) au premier niveau.
    const first = (Array.isArray(body?.responses) ? body!.responses[0] : body) as Record<string, unknown> | undefined;
    const code = Number(first?.['respose-code'] ?? first?.['response-code'] ?? (res.ok ? NaN : res.status));
    if (res.ok && code === 200) return;

    const reason = CELCOM_ERRORS[code] ?? String(first?.['response-description'] ?? 'réponse inattendue');
    this.logger.error(`Envoi refusé par Celcom (HTTP ${res.status}, code ${code} : ${reason}) vers ${phone.slice(0, 7)}…`);
    throw new ServiceUnavailableException(FAILED);
  }
}
