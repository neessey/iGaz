import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength, Min } from 'class-validator';

export class InitiatePaymentDto {
  /** Clé fournie par le client : rejouer la même clé ne crée jamais une seconde transaction. */
  @IsString() @MinLength(8) @MaxLength(80)
  idempotencyKey: string;
}

export class PaymentWebhookDto {
  /** Identifiant du paiement iGaz transmis à l'agrégateur comme référence marchand. */
  @IsUUID() reference: string;
  @IsIn(['SUCCEEDED', 'FAILED']) status: 'SUCCEEDED' | 'FAILED';
  @IsInt() @Min(0) amount: number;
  @IsOptional() @IsString() @MaxLength(120) providerRef?: string;
}
