import { Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [SuppliersModule], controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
