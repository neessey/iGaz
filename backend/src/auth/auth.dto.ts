import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @IsString() @MaxLength(25)
  phone: string;
}

export class VerifyOtpDto {
  @IsString() @MaxLength(25)
  phone: string;

  @IsString() @Length(6, 6)
  code: string;

  @IsOptional() @IsString() @MaxLength(80)
  name?: string;
}
