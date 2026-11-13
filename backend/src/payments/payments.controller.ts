import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { InitiatePaymentDto, PaymentWebhookDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles(Role.CLIENT) @Post('orders/:orderId/payments') @HttpCode(200)
  initiate(
    @CurrentUser() user: User,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiate(user, orderId, dto.idempotencyKey);
  }

  /** Un seul paiement pour tout le panier multi-dépôts. */
  @Roles(Role.CLIENT) @Post('checkouts/:checkoutId/payments') @HttpCode(200)
  initiateCheckout(
    @CurrentUser() user: User,
    @Param('checkoutId', ParseUUIDPipe) checkoutId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiateCheckout(user, checkoutId, dto.idempotencyKey);
  }

  /** Appelée par l'agrégateur, pas par un utilisateur : authentifiée par signature du corps brut. */
  @Public() @Post('payments/webhook') @HttpCode(200)
  webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-igaz-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ) {
    this.payments.verifySignature(req.rawBody, signature);
    return this.payments.handleWebhook(dto);
  }
}
