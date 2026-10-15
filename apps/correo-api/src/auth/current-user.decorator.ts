import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentUserPayload = {
  /** kernel personId */
  personId: string;
  name: string | null;
};

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
