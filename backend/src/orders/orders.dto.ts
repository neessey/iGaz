import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength,
  Min, MinLength, ValidateNested,
} from 'class-validator';
import { FulfillmentType, OrderStatus, PaymentMethod, SaleKind } from '@prisma/client';

export class OrderItemDto {
  @IsUUID() productId: string;
  @IsEnum(SaleKind) kind: SaleKind;
  @IsInt() @Min(1) @Max(50) quantity: number;

  /** Échange : marque et format de la bouteille vide remise. */
  @IsOptional() @IsUUID() returnedBrandId?: string;
  @IsOptional() @IsUUID() returnedCylinderTypeId?: string;
}

export class CreateOrderDto {
  @IsUUID() storeId: string;
  @IsEnum(FulfillmentType) fulfillment: FulfillmentType;
  @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
  @IsOptional() @IsUUID() addressId?: string;

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

/** Une partie du panier : les articles d'un dépôt, qui deviendront une commande. */
export class CheckoutStoreDto {
  @IsUUID() storeId: string;
  @IsEnum(FulfillmentType) fulfillment: FulfillmentType;

  // Panier vide ou plus de 10 articles : refusés par checkoutShapeError, avec un message en français.
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

/** Panier multi-dépôts : une adresse et un mode de paiement communs, une commande par dépôt (3 au plus). */
export class CreateCheckoutDto {
  @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
  @IsOptional() @IsUUID() addressId?: string;

  // La limite de 3 dépôts est vérifiée par checkoutShapeError (message en français).
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CheckoutStoreDto)
  stores: CheckoutStoreDto[];
}

export class RejectOrderDto {
  @IsString() @MinLength(3) @MaxLength(200) reason: string;
}

export class CompleteOrderDto {
  @IsString() @Length(6, 6) code: string;
}

export class AdminCancelDto {
  @IsString() @MinLength(5) @MaxLength(300) reason: string;
}

export class ListOrdersQuery {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
}
