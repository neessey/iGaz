import { Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** Avis et notes des dépôts (clients des commandes terminées, réponse du dépôt, masquage par l'admin). */
@Module({ imports: [SuppliersModule], controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
