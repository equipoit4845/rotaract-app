import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './role';
import { ROLES_KEY } from './roles.decorator';

/** Legacy RolesGuard, unchanged: SUPERADMIN always passes. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;
    const { user } = context.switchToHttp().getRequest();
    if (user?.role === Role.SUPERADMIN) return true;
    return requiredRoles.some((role) => user?.role === role);
  }
}
