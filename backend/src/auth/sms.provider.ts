import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** Abstraction d'envoi de SMS. Brancher ici le prestataire retenu (agrégateur SMS ivoirien). */
export abstract class SmsProvider {
  abstract send(phone: string, message: string): Promise<void>;
}

/** Implémentation de développement : affiche le message dans les logs. Interdite en production. */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');

  async send(phone: string, message: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException("Aucun prestataire SMS n'est configuré");
    }
    this.logger.log(`→ ${phone} : ${message}`);
  }
}
