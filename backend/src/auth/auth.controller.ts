import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser, Public } from '../common/decorators';
import { RequestOtpDto, VerifyOtpDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('otp/request') @HttpCode(200)
  request(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public() @Post('otp/verify') @HttpCode(200)
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.name);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return { id: user.id, phone: user.phone, name: user.name, role: user.role };
  }
}
