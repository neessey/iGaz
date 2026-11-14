import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { demoModeEnabled } from './demo';

/** Abstraction d'envoi de SMS : Celcom, Orange ou affichage dans les journaux, choisi par SmsModule (SMS_PROVIDER). */
export abstract class SmsProvider {
  abstract send(phone: string, message: string): Promise<void>;
}

/**
 * Implémentation de développement : affiche le message dans les logs. Interdite en production, sauf pour la démo en
 * ligne protégée (DEMO_ACCESS_KEY, voir demo.ts) tant qu'aucun prestataire SMS n'est branché.
 */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');

  async send(phone: string, message: string): Promise<void> {
    if (process.env.NODE_ENV === 'production' && !demoModeEnabled()) {
      throw new ServiceUnavailableException("Aucun prestataire SMS n'est configuré");
    }
    this.logger.log(`→ ${phone} : ${message}`);
  }
}
