import { Global, Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';

/** Rémunération d'iGaz : réglages des frais, relevés mensuels des dépôts, règlements. */
@Global()
@Module({ imports: [SuppliersModule], controllers: [RevenueController], providers: [RevenueService], exports: [RevenueService] })
export class RevenueModule {}
