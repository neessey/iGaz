import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { HideReviewDto, ReplyDto, ReviewDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Donner ou modifier son avis sur une commande terminée. */
  @Roles(Role.CLIENT) @Put('orders/:id/review')
  upsert(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.reviews.upsert(user, id, dto);
  }

  @Public() @Get('stores/:storeId/reviews')
  forStore(@Param('storeId', ParseUUIDPipe) storeId: string, @Query('take') take?: string) {
    return this.reviews.forStore(storeId, Number(take) || 20);
  }

  @Roles(Role.SUPPLIER) @Get('stores/:storeId/reviews/mine')
  forSupplier(@CurrentUser() user: User, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.reviews.forSupplier(user, storeId);
  }

  @Roles(Role.SUPPLIER) @Put('stores/:storeId/reviews/:reviewId/reply')
  reply(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReplyDto,
  ) {
    return this.reviews.reply(user, storeId, reviewId, dto.reply);
  }

  @Roles(Role.ADMIN) @Get('admin/reviews')
  adminList(@Query('hidden') hidden?: string) {
    return this.reviews.adminList(hidden === 'true');
  }

  @Roles(Role.ADMIN) @Patch('admin/reviews/:id')
  setHidden(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HideReviewDto) {
    return this.reviews.setHidden(admin, id, dto.hidden, dto.reason);
  }
}
