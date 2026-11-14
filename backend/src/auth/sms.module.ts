import { Global, Module } from '@nestjs/common';
import { CelcomSmsProvider, celcomConfigFromEnv } from './celcom-sms.provider';
import { OrangeSmsProvider, orangeConfigFromEnv } from './orange-sms.provider';
import { ConsoleSmsProvider, SmsProvider } from './sms.provider';

/** Choix du prestataire par SMS_PROVIDER (l'API refuse de démarrer si ses identifiants manquent). */
export function smsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  switch (env.SMS_PROVIDER?.trim().toLowerCase()) {
    case 'celcom': return new CelcomSmsProvider(celcomConfigFromEnv(env)); // Celcom Africa (prestataire retenu)
    case 'orange': return new OrangeSmsProvider(orangeConfigFromEnv(env)); // Orange Developer (en réserve)
    default: return new ConsoleSmsProvider(); // développement, démo protégée : message dans les journaux
  }
}

/** Global : les codes de connexion et les alertes « nouvelle commande » aux dépôts passent par le même prestataire. */
@Global()
@Module({ providers: [{ provide: SmsProvider, useFactory: () => smsProviderFromEnv() }], exports: [SmsProvider] })
export class SmsModule {}
