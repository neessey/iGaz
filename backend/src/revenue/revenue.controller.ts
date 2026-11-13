import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { MonthQuery, SettleDto, UpdateFeesDto } from './revenue.dto';
import { RevenueService } from './revenue.service';

@Controller()
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  /** Frais de service en vigueur : affichés au client avant qu'il valide son panier. */
  @Public() @Get('catalog/fees')
  async fees() {
    const { serviceFee } = await this.revenue.settings();
    return { serviceFee };
  }

  @Roles(Role.ADMIN) @Get('admin/revenue/settings')
  settings() {
    return this.revenue.settings();
  }

  @Roles(Role.ADMIN) @Patch('admin/revenue/settings')
  updateSettings(@CurrentUser() admin: User, @Body() dto: UpdateFeesDto) {
    return this.revenue.updateSettings(admin, dto);
  }

  @Roles(Role.ADMIN) @Get('admin/revenue')
  month(@Query() q: MonthQuery) {
    return this.revenue.adminMonth(q.month);
  }

  @Roles(Role.ADMIN) @Get('admin/revenue/stores/:storeId')
  storeDetail(@Param('storeId', ParseUUIDPipe) storeId: string, @Query() q: MonthQuery) {
    return this.revenue.storeStatement(storeId, q.month ?? new Date().toISOString().slice(0, 7));
  }

  @Roles(Role.ADMIN) @Post('admin/revenue/stores/:storeId/:month/settle')
  settle(
    @CurrentUser() admin: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('month') month: string,
    @Body() dto: SettleDto,
  ) {
    return this.revenue.settle(admin, storeId, month, dto.note);
  }

  /** Relevé du dépôt connecté (boutique d'un autre fournisseur : 404). */
  @Roles(Role.SUPPLIER) @Get('stores/:storeId/statement')
  statement(@CurrentUser() user: User, @Param('storeId', ParseUUIDPipe) storeId: string, @Query() q: MonthQuery) {
    return this.revenue.supplierStatement(user, storeId, q.month);
  }
}
