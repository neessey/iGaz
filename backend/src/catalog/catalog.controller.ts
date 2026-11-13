import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBrandDto, CreateCylinderTypeDto, CreateZoneDto,
  UpdateBrandDto, UpdateCylinderTypeDto, UpdateZoneDto,
} from './catalog.dto';

/** Catalogue central (marques, formats, zones) : lecture publique, écriture réservée à l'administration. */
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ---- Lecture publique ----
  @Public() @Get('catalog/brands')
  brands() {
    return this.prisma.gasBrand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  @Public() @Get('catalog/cylinder-types')
  cylinderTypes() {
    return this.prisma.cylinderType.findMany({ where: { isActive: true }, orderBy: { capacityKg: 'asc' } });
  }

  @Public() @Get('catalog/zones')
  zones() {
    return this.prisma.serviceZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  // ---- Administration ----
  @Roles(Role.ADMIN) @Get('admin/brands')
  allBrands() {
    return this.prisma.gasBrand.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles(Role.ADMIN) @Get('admin/cylinder-types')
  allCylinderTypes() {
    return this.prisma.cylinderType.findMany({ orderBy: { capacityKg: 'asc' } });
  }

  @Roles(Role.ADMIN) @Get('admin/zones')
  allZones() {
    return this.prisma.serviceZone.findMany({ orderBy: { name: 'asc' } });
  }

  private async create<T extends { id: string }>(
    admin: User, entity: string, run: () => Promise<T>, duplicateMessage: string,
  ): Promise<T> {
    try {
      const created = await run();
      await this.audit.log({ actorId: admin.id, action: 'CREATE', entity, entityId: created.id, after: created });
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(duplicateMessage);
      }
      throw e;
    }
  }

  private async update<T extends { id: string }>(
    admin: User, entity: string, id: string,
    find: () => Promise<T | null>, run: () => Promise<T>,
  ): Promise<T> {
    const before = await find();
    if (!before) throw new NotFoundException('Élément introuvable');
    const after = await run();
    await this.audit.log({ actorId: admin.id, action: 'UPDATE', entity, entityId: id, before, after });
    return after;
  }

  @Roles(Role.ADMIN) @Post('admin/brands')
  createBrand(@CurrentUser() admin: User, @Body() dto: CreateBrandDto) {
    return this.create(admin, 'GasBrand', () => this.prisma.gasBrand.create({ data: { name: dto.name.trim() } }), 'Cette marque existe déjà');
  }

  @Roles(Role.ADMIN) @Patch('admin/brands/:id')
  updateBrand(@CurrentUser() admin: User, @Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.update(admin, 'GasBrand', id,
      () => this.prisma.gasBrand.findUnique({ where: { id } }),
      () => this.prisma.gasBrand.update({ where: { id }, data: dto }));
  }

  @Roles(Role.ADMIN) @Post('admin/cylinder-types')
  createCylinderType(@CurrentUser() admin: User, @Body() dto: CreateCylinderTypeDto) {
    return this.create(admin, 'CylinderType', () => this.prisma.cylinderType.create({ data: dto }), 'Ce format existe déjà');
  }

  @Roles(Role.ADMIN) @Patch('admin/cylinder-types/:id')
  updateCylinderType(@CurrentUser() admin: User, @Param('id') id: string, @Body() dto: UpdateCylinderTypeDto) {
    return this.update(admin, 'CylinderType', id,
      () => this.prisma.cylinderType.findUnique({ where: { id } }),
      () => this.prisma.cylinderType.update({ where: { id }, data: dto }));
  }

  @Roles(Role.ADMIN) @Post('admin/zones')
  createZone(@CurrentUser() admin: User, @Body() dto: CreateZoneDto) {
    return this.create(admin, 'ServiceZone', () => this.prisma.serviceZone.create({ data: { name: dto.name.trim(), city: dto.city } }), 'Cette zone existe déjà');
  }

  @Roles(Role.ADMIN) @Patch('admin/zones/:id')
  updateZone(@CurrentUser() admin: User, @Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.update(admin, 'ServiceZone', id,
      () => this.prisma.serviceZone.findUnique({ where: { id } }),
      () => this.prisma.serviceZone.update({ where: { id }, data: dto }));
  }
}
