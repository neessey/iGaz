import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { CreateStoreDto, ListSuppliersQuery, RegisterSupplierDto, UpdateStoreDto } from './suppliers.dto';
import { SuppliersService } from './suppliers.service';

@Controller()
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  // Tout utilisateur connecté (non admin) peut déposer une demande fournisseur.
  @Post('suppliers/register')
  register(@CurrentUser() user: User, @Body() dto: RegisterSupplierDto) {
    return this.suppliers.register(user, dto);
  }

  @Roles(Role.SUPPLIER) @Get('suppliers/me')
  me(@CurrentUser() user: User) {
    return this.suppliers.me(user);
  }

  @Roles(Role.SUPPLIER) @Get('suppliers/me/stores')
  stores(@CurrentUser() user: User) {
    return this.suppliers.myStores(user);
  }

  @Roles(Role.SUPPLIER) @Post('suppliers/me/stores')
  createStore(@CurrentUser() user: User, @Body() dto: CreateStoreDto) {
    return this.suppliers.createStore(user, dto);
  }

  @Roles(Role.SUPPLIER) @Patch('suppliers/me/stores/:storeId')
  updateStore(
    @CurrentUser() user: User,
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.suppliers.updateStore(user, storeId, dto);
  }

  // ---- Administration ----
  @Roles(Role.ADMIN) @Get('admin/suppliers')
  list(@Query() q: ListSuppliersQuery) {
    return this.suppliers.listForAdmin(q.status);
  }

  @Roles(Role.ADMIN) @Post('admin/suppliers/:id/approve')
  approve(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.setStatus(admin, id, 'APPROVED', ['PENDING', 'SUSPENDED']);
  }

  @Roles(Role.ADMIN) @Post('admin/suppliers/:id/reject')
  reject(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.setStatus(admin, id, 'REJECTED', ['PENDING']);
  }

  @Roles(Role.ADMIN) @Post('admin/suppliers/:id/suspend')
  suspend(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.setStatus(admin, id, 'SUSPENDED', ['APPROVED']);
  }
}
