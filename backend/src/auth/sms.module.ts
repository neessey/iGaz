import { Global, Module } from '@nestjs/common';
import { ConsoleSmsProvider, SmsProvider } from './sms.provider';

/** Global : les codes de connexion et les alertes « nouvelle commande » aux dépôts passent par le même prestataire. */
@Global()
@Module({ providers: [{ provide: SmsProvider, useClass: ConsoleSmsProvider }], exports: [SmsProvider] })
export class SmsModule {}
