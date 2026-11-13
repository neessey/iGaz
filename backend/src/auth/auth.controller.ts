import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Patch, Post } from '@nestjs/common';
import { DEMO_HEADER } from './demo';
import { User } from '@prisma/client';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RequestOtpDto, UpdateMeDto, VerifyOtpDto } from './auth.dto';
import { AuthService } from './auth.service';
import { fullName } from './names';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Public() @Post('otp/request') @HttpCode(200)
  request(@Body() dto: RequestOtpDto, @Headers(DEMO_HEADER) demoKey?: string) {
    return this.auth.requestOtp(dto.phone, demoKey);
  }

  @Public() @Post('otp/verify') @HttpCode(200)
  verify(@Body() dto: VerifyOtpDto) {
    if (!!dto.firstName !== !!dto.lastName) throw new BadRequestException('Indiquez le prénom et le nom');
    const name = dto.firstName && dto.lastName ? fullName(dto.firstName, dto.lastName) : dto.name;
    return this.auth.verifyOtp(dto.phone, dto.code, name);
  }

  /** Modifier son prénom et son nom. */
  @Patch('me')
  async update(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { name: fullName(dto.firstName, dto.lastName) } });
    return { id: updated.id, phone: updated.phone, name: updated.name, role: updated.role };
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return { id: user.id, phone: user.phone, name: user.name, role: user.role };
  }

  /** Suppression du compte par son titulaire (anonymisation ; refusée si une commande est en cours). */
  @Delete('me') @HttpCode(204)
  async remove(@CurrentUser() user: User) {
    await this.auth.deleteAccount(user);
  }
}
