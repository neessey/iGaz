import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post,
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

@Controller('addresses')
@Roles(Role.CLIENT)
export class AddressesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.prisma.address.findMany({ where: { userId: user.id }, include: { zone: true } });
  }

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    const zone = await this.prisma.serviceZone.findFirst({ where: { id: dto.zoneId, isActive: true } });
    if (!zone) throw new BadRequestException('Zone inconnue ou inactive');
    return this.prisma.address.create({ data: { ...dto, userId: user.id }, include: { zone: true } });
  }

  @Delete(':id') @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.prisma.address.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) throw new NotFoundException('Adresse introuvable');
  }
}

@Module({ controllers: [AddressesController] })
export class AddressesModule {}
