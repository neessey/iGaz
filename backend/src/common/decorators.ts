import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role, User } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';

/** Route accessible sans connexion. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restreint la route à certains rôles (en plus de la connexion). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  return ctx.switchToHttp().getRequest().user;
});
