import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, IsUrl,
  Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { SupplierStatus } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SupplierDocumentDto {
  @IsString() @MaxLength(80) type: string;
  @IsUrl({ require_tld: false }) url: string;
}

export class RegisterSupplierDto {
  @IsString() @MinLength(2) @MaxLength(120)
  businessName: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierDocumentDto)
  documents?: SupplierDocumentDto[];
}

export class CreateStoreDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(3) @MaxLength(200) address: string;
  @IsString() @MaxLength(25) phone: string;
  @IsOptional() @Matches(HHMM) opensAt?: string;
  @IsOptional() @Matches(HHMM) closesAt?: string;
  @IsOptional() @IsBoolean() offersDelivery?: boolean;
  @IsOptional() @IsBoolean() offersPickup?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100000) deliveryFee?: number;

  @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true })
  zoneIds: string[];
}

export class UpdateStoreDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(25) phone?: string;
  @IsOptional() @Matches(HHMM) opensAt?: string;
  @IsOptional() @Matches(HHMM) closesAt?: string;
  @IsOptional() @IsBoolean() isOpen?: boolean;
  @IsOptional() @IsBoolean() offersDelivery?: boolean;
  @IsOptional() @IsBoolean() offersPickup?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100000) deliveryFee?: number;

  @IsOptional() @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true })
  zoneIds?: string[];
}

export class ListSuppliersQuery {
  @IsOptional() @IsEnum(SupplierStatus) status?: SupplierStatus;
}
