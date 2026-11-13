import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_DELIVERY_SHARE, MAX_SERVICE_FEE } from './fees';

export class UpdateFeesDto {
  @IsOptional() @IsInt({ message: 'Montant en FCFA entiers' }) @Min(0) @Max(MAX_SERVICE_FEE, { message: `Frais de service : ${MAX_SERVICE_FEE} F au plus` })
  serviceFee?: number;

  @IsOptional() @IsInt({ message: 'Montant en FCFA entiers' }) @Min(0) @Max(MAX_DELIVERY_SHARE, { message: `Part sur la livraison : ${MAX_DELIVERY_SHARE} F au plus` })
  deliveryShare?: number;
}

export class MonthQuery {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mois attendu au format AAAA-MM' })
  month?: string;
}

export class SettleDto {
  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}
