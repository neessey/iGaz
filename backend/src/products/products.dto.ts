import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FulfillmentType } from '@prisma/client';

export class CreateProductDto {
  @IsUUID() brandId: string;
  @IsUUID() cylinderTypeId: string;
  @IsInt() @Min(0) @Max(1_000_000) purchasePrice: number;
  @IsInt() @Min(0) @Max(1_000_000) exchangePrice: number;
  @IsOptional() @IsInt() @Min(0) @Max(100000) quantity?: number;
}

export class UpdateProductDto {
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) purchasePrice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) exchangePrice?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetStockDto {
  @IsInt() @Min(0) @Max(100000) quantity: number;
}

export class AdminSetStockDto extends SetStockDto {
  /** Justification obligatoire pour toute correction administrative. */
  @IsString() @MinLength(5) @MaxLength(300) note: string;
}

export class SearchProductsQuery {
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsUUID() cylinderTypeId?: string;
  @IsOptional() @IsEnum(FulfillmentType) fulfillment?: FulfillmentType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
}
