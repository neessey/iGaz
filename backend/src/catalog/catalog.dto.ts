import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateBrandDto {
  @IsString() @MinLength(2) @MaxLength(60)
  name: string;
}
export class UpdateBrandDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCylinderTypeDto {
  @IsString() @Matches(/^B\d{1,3}$/, { message: 'Format attendu : B3, B6, B12…' })
  label: string;

  @IsInt() @Min(1) @Max(100)
  capacityKg: number;
}
export class UpdateCylinderTypeDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateZoneDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
}
export class UpdateZoneDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
