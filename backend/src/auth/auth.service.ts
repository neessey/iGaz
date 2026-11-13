import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIvorianPhone } from '../orders/order-rules';
import { SmsProvider } from './sms.provider';

const MAX_REQUESTS_PER_WINDOW = 3;
const WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsProvider,
  ) {}

  private hash(phone: string, code: string): Buffer {
    const pepper = this.config.getOrThrow<string>('JWT_SECRET');
    return createHash('sha256').update(`${pepper}:${phone}:${code}`).digest();
  }

  private phoneOrThrow(raw: string): string {
    const phone = normalizeIvorianPhone(raw);
    if (!phone) throw new BadRequestException('Numéro de téléphone ivoirien invalide');
    return phone;
  }

  async requestOtp(rawPhone: string) {
    const phone = this.phoneOrThrow(rawPhone);

    const recent = await this.prisma.otpCode.count({
      where: { phone, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
    });
    if (recent >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException('Trop de demandes, réessayez dans quelques minutes', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ttl = Number(this.config.get('OTP_TTL_SECONDS') ?? 300);
    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: this.hash(phone, code).toString('hex'),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    await this.sms.send(phone, `iGaz : votre code de connexion est ${code}. Il expire dans ${Math.round(ttl / 60)} min.`);
    return { sent: true };
  }

  async verifyOtp(rawPhone: string, code: string, name?: string) {
    const phone = this.phoneOrThrow(rawPhone);
    const maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS') ?? 5);

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= maxAttempts) throw new UnauthorizedException('Code invalide ou expiré');

    const expected = Buffer.from(otp.codeHash, 'hex');
    const given = this.hash(phone, code);
    if (!timingSafeEqual(expected, given)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Code invalide ou expiré');
    }

    // Consommation atomique : un même code ne peut servir qu'une fois.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw new UnauthorizedException('Code invalide ou expiré');

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: name ? { name } : {},
      create: { phone, name },
    });
    if (!user.isActive) throw new UnauthorizedException('Compte indisponible');

    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, user: { id: user.id, phone: user.phone, name: user.name, role: user.role } };
  }
}
