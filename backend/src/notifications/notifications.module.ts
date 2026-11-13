import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSender, WebPushSender } from './push.sender';

/** Global : les commandes et les paiements déclenchent des notifications. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: PushSender, useClass: WebPushSender }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
