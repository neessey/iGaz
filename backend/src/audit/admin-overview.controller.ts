import { Controller, Get, Module, Query } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export class AuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/** Lecture seule pour l'administration : journal d'audit et chiffres clés du MVP. */
@Controller('admin')
@Roles(Role.ADMIN)
export class AdminOverviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('audit-logs')
  auditLogs(@Query() q: AuditQuery) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 100,
      include: { actor: { select: { phone: true, name: true } } },
    });
  }

  @Get('stats')
  async stats() {
    const [clients, suppliers, stores, orders, revenue] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.supplier.groupBy({ by: ['status'], _count: true }),
      this.prisma.store.count(),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { total: true } }),
    ]);
    return {
      clients,
      stores,
      suppliers: Object.fromEntries(suppliers.map((s) => [s.status, s._count])),
      orders: Object.fromEntries(orders.map((o) => [o.status, o._count])),
      completedVolume: revenue._sum.total ?? 0,
    };
  }
}

@Module({ controllers: [AdminOverviewController] })
export class AdminOverviewModule {}
