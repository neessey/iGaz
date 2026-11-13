import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post,
} from '@nestjs/common';
import { IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Role, User } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export class CreateAddressDto {
  @IsUUID() zoneId: string;
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsString() @MinLength(3) @MaxLength(250) details: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}

export class UpdateAddressDto {
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) label?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(250) details?: string;
}

@Controller('addresses')
@Roles(Role.CLIENT)
export class AddressesController {
  constructor(private readonly prisma: PrismaService) {}

  private async activeZoneOrThrow(zoneId: string) {
    const zone = await this.prisma.serviceZone.findFirst({ where: { id: zoneId, isActive: true } });
    if (!zone) throw new BadRequestException('Zone inconnue ou inactive');
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.prisma.address.findMany({ where: { userId: user.id }, include: { zone: true }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    await this.activeZoneOrThrow(dto.zoneId);
    return this.prisma.address.create({ data: { ...dto, userId: user.id }, include: { zone: true } });
  }

  /** Modifier une de ses adresses (nom, commune, repères). Les commandes passées gardent leur copie de l'adresse. */
  @Patch(':id')
  async update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddressDto) {
    if (dto.zoneId) await this.activeZoneOrThrow(dto.zoneId);
    const res = await this.prisma.address.updateMany({ where: { id, userId: user.id }, data: dto });
    if (res.count === 0) throw new NotFoundException('Adresse introuvable');
    return this.prisma.address.findUniqueOrThrow({ where: { id }, include: { zone: true } });
  }

  @Delete(':id') @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.prisma.address.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) throw new NotFoundException('Adresse introuvable');
  }
}

@Module({ controllers: [AddressesController] })
export class AddressesModule {}
