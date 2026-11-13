import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser, Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { PushSender } from './push.sender';

class PushKeysDto {
  @IsString() @MaxLength(200) p256dh: string;
  @IsString() @MaxLength(100) auth: string;
}

/** Abonnement push tel que renvoyé par le navigateur (PushSubscription.toJSON()). */
export class PushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_tld: false }) @MaxLength(600) endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString() @MaxLength(600) endpoint: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly push: PushSender) {}

  /** Les 50 dernières notifications et le nombre de non lues. */
  @Get()
  async list(@CurrentUser() user: User) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { unread, items };
  }

  @Post('read-all') @HttpCode(204)
  async readAll(@CurrentUser() user: User) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  }

  @Post(':id/read') @HttpCode(204)
  async read(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  }

  /** Clé publique VAPID pour s'abonner au push (null si le push n'est pas configuré sur le serveur). */
  @Public() @Get('push-key')
  pushKey() {
    return { publicKey: this.push.publicKey };
  }

  /** Enregistre l'abonnement push de ce téléphone (un même téléphone passe au dernier compte connecté). */
  @Post('push-subscriptions') @HttpCode(204)
  async subscribe(@CurrentUser() user: User, @Body() dto: PushSubscriptionDto) {
    const data = { userId: user.id, p256dh: dto.keys.p256dh, auth: dto.keys.auth };
    await this.prisma.pushSubscription.upsert({ where: { endpoint: dto.endpoint }, update: data, create: { ...data, endpoint: dto.endpoint } });
  }

  @Delete('push-subscriptions') @HttpCode(204)
  async unsubscribe(@CurrentUser() user: User, @Body() dto: PushUnsubscribeDto) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: dto.endpoint, userId: user.id } });
  }
}
