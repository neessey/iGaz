import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser, Public, Roles } from '../common/decorators';
import {
  AdminSetStockDto, CreateProductDto, SearchProductsQuery, SetStockDto, UpdateProductDto,
} from './products.dto';
import { ProductsService } from './products.service';

@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public() @Get('products')
  search(@Query() q: SearchProductsQuery) {
    return this.products.search(q);
  }

  @Public() @Get('products/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.detail(id);
  }

  @Roles(Role.SUPPLIER) @Get('stores/:storeId/products')
  list(@CurrentUser() user: User, @Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.products.listForStore(user, storeId);
  }

  @Roles(Role.SUPPLIER) @Post('stores/:storeId/products')
  create(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(user, storeId, dto);
  }

  @Roles(Role.SUPPLIER) @Patch('stores/:storeId/products/:productId')
  update(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user, storeId, productId, dto);
  }

  @Roles(Role.SUPPLIER) @Put('stores/:storeId/products/:productId/stock')
  setStock(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetStockDto,
  ) {
    return this.products.setStock(user, storeId, productId, dto.quantity);
  }

  /** Corps : l'image elle-même (Content-Type image/jpeg, image/png ou image/webp), pas du JSON. */
  @Roles(Role.SUPPLIER) @Put('stores/:storeId/products/:productId/photo')
  setPhoto(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: Request,
  ) {
    return this.products.setPhoto(user, storeId, productId, Buffer.isBuffer(req.body) ? req.body : undefined, req.headers['content-type']);
  }

  @Roles(Role.SUPPLIER) @Delete('stores/:storeId/products/:productId/photo') @HttpCode(204)
  removePhoto(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.products.removePhoto(user, storeId, productId);
  }

  /** L'adresse contient la version (?v=date de la photo) : le navigateur peut la garder en cache sans limite. */
  @Public() @Get('products/:id/photo')
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const photo = await this.products.photo(id);
    res.set({
      'Content-Type': photo.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(Buffer.from(photo.data));
  }

  @Roles(Role.SUPPLIER) @Get('stores/:storeId/products/:productId/movements')
  movements(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.products.movements(user, storeId, productId);
  }

  @Roles(Role.ADMIN) @Put('admin/products/:productId/stock')
  adminCorrect(
    @CurrentUser() admin: User,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AdminSetStockDto,
  ) {
    return this.products.adminCorrectStock(admin, productId, dto.quantity, dto.note);
  }
}
