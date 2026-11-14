import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminOverviewModule } from './audit/admin-overview.controller';
import { AuditModule } from './audit/audit.service';
import { AddressesModule } from './addresses/addresses.controller';
import { AuthModule } from './auth/auth.module';
import { SmsModule } from './auth/sms.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CatalogModule } from './catalog/catalog.module';
import { AuthGuard } from './common/auth.guard';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RevenueModule } from './revenue/revenue.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, AuditModule, SmsModule, NotificationsModule, AdminOverviewModule, AuthModule, CatalogModule,
    AddressesModule, SuppliersModule, ProductsModule, OrdersModule, PaymentsModule, RevenueModule, ReviewsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
