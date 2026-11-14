import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus, User } from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIvorianPhone } from '../orders/order-rules';
import { demoKeyMatches } from './demo';
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

  private readonly logger = new Logger('Auth');

  async requestOtp(rawPhone: string, demoKey?: string) {
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
    // Démonstration locale (EXPOSE_DEV_OTP=true, jamais en production) ou démo en ligne protégée par clé (voir demo.ts).
    const local = this.config.get('EXPOSE_DEV_OTP') === 'true' && process.env.NODE_ENV !== 'production';
    const expose = local || demoKeyMatches(this.config.get<string>('DEMO_ACCESS_KEY'), demoKey);
    try {
      await this.sms.send(phone, `iGaz : votre code de connexion est ${code}. Il expire dans ${Math.round(ttl / 60)} min.`);
    } catch (e) {
      // En démo, le code est affiché à l'écran : un SMS raté (prestataire sans crédit…) n'empêche pas de se connecter.
      if (!expose) throw e;
      this.logger.warn(`SMS non envoyé, code affiché (démo) : ${(e as Error).message}`);
      return { sent: false, devCode: code };
    }
    return expose ? { sent: true, devCode: code } : { sent: true };
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

  /**
   * Suppression de compte demandée par l'utilisateur (exigence Google Play). Le compte est anonymisé et désactivé :
   * numéro et nom effacés, adresses et codes SMS supprimés, adresses de livraison retirées des commandes. Les commandes
   * restent, sans identité, pour la comptabilité. Refusée tant qu'une commande est en cours. Le même numéro peut
   * ensuite recréer un compte neuf.
   */
  async deleteAccount(user: User) {
    if (user.role === 'ADMIN') {
      throw new ConflictException('Un compte administrateur ne se supprime pas depuis l’application');
    }
    const supplier = user.role === 'SUPPLIER'
      ? await this.prisma.supplier.findUnique({ where: { userId: user.id }, include: { stores: { select: { id: true } } } })
      : null;
    const active = await this.prisma.order.count({
      where: {
        status: { in: ACTIVE_STATUSES },
        OR: [{ clientId: user.id }, ...(supplier ? [{ storeId: { in: supplier.stores.map((s) => s.id) } }] : [])],
      },
    });
    if (active > 0) {
      throw new ConflictException(
        `Vous avez ${active} commande${active > 1 ? 's' : ''} en cours : terminez-${active > 1 ? 'les' : 'la'} ou annulez-${active > 1 ? 'les' : 'la'} avant de supprimer votre compte`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (supplier) {
        await tx.supplier.update({ where: { id: supplier.id }, data: { status: 'SUSPENDED' } });
        await tx.store.updateMany({ where: { supplierId: supplier.id }, data: { isOpen: false } });
      }
      await tx.address.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
      await tx.otpCode.deleteMany({ where: { phone: user.phone } });
      await tx.order.updateMany({ where: { clientId: user.id }, data: { deliveryDetails: null } });
      await tx.user.update({
        where: { id: user.id },
        data: { phone: `supprime:${user.id}`, name: null, isActive: false },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'ACCOUNT_DELETED', entity: 'User', entityId: user.id, after: { role: user.role } },
      });
    });
  }
}

/** Commandes encore en cours : elles empêchent la suppression du compte (client ou dépôt). */
const ACTIVE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'SUBMITTED', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
