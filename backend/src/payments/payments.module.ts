import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackClient, paystackConfigFromEnv } from './paystack';

/** Paystack n'est actif qu'avec PAYSTACK_SECRET_KEY ; sans clé, pas de page de paiement (paiement simulé en démo). */
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: PaystackClient, useFactory: () => { const c = paystackConfigFromEnv(); return c ? new PaystackClient(c) : null; } },
  ],
})
export class PaymentsModule {}
