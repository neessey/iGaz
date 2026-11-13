import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { AdminCancelDto, CompleteOrderDto, CreateOrderDto, ListOrdersQuery, RejectOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles(Role.CLIENT) @Post('orders')
  create(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Get('orders')
  list(@CurrentUser() user: User, @Query() q: ListOrdersQuery) {
    return this.orders.list(user, q.status);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user, id);
  }

  @Roles(Role.CLIENT) @Post('orders/:id/cancel') @HttpCode(200)
  cancel(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancelByClient(user, id);
  }

  @Roles(Role.SUPPLIER) @Post('orders/:id/accept') @HttpCode(200)
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.accept(user, id);
  }

  @Roles(Role.SUPPLIER) @Post('orders/:id/reject') @HttpCode(200)
  reject(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectOrderDto) {
    return this.orders.reject(user, id, dto.reason);
  }

  @Roles(Role.SUPPLIER) @Post('orders/:id/ready') @HttpCode(200)
  ready(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.ready(user, id);
  }

  @Roles(Role.SUPPLIER) @Post('orders/:id/dispatch') @HttpCode(200)
  dispatch(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.dispatch(user, id);
  }

  @Roles(Role.SUPPLIER) @Post('orders/:id/complete') @HttpCode(200)
  complete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteOrderDto) {
    return this.orders.complete(user, id, dto.code);
  }

  @Roles(Role.ADMIN) @Post('admin/orders/:id/cancel') @HttpCode(200)
  adminCancel(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminCancelDto) {
    return this.orders.cancelByAdmin(admin, id, dto.reason);
  }
}
