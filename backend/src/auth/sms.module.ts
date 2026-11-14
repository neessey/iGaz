import { Global, Module } from '@nestjs/common';
import { OrangeSmsProvider, orangeConfigFromEnv } from './orange-sms.provider';
import { ConsoleSmsProvider, SmsProvider } from './sms.provider';

/**
 * Global : les codes de connexion et les alertes « nouvelle commande » aux dépôts passent par le même prestataire.
 * SMS_PROVIDER=orange : API SMS d'Orange (identifiants ORANGE_SMS_*, l'API refuse de démarrer s'ils manquent) ;
 * sinon, affichage dans les journaux (développement, démo protégée).
 */
@Global()
@Module({
  providers: [{
    provide: SmsProvider,
    useFactory: (): SmsProvider =>
      process.env.SMS_PROVIDER?.trim().toLowerCase() === 'orange'
        ? new OrangeSmsProvider(orangeConfigFromEnv())
        : new ConsoleSmsProvider(),
  }],
  exports: [SmsProvider],
})
export class SmsModule {}
