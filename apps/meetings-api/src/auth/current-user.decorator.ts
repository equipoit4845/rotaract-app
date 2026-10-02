import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from './role';

export type CurrentUserPayload = {
  /** kernel personId */
  id: string;
  email: string;
  role: Role;
  fullName: string;
};

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
