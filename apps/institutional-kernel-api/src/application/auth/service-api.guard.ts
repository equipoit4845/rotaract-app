import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

// §14.3/§9.12: every /service/* route requires a technical scope on top of
// the aud:institutional-kernel identity check. "*" (granted to the
// development-only x-service-api-key bypass) matches any scope.
const serviceScopeByHandler: Record<string, string> = {
  userContext: "kernel.service.users.read",
  person: "kernel.service.persons.read",
  organization: "kernel.service.organizations.read",
  membership: "kernel.service.memberships.read",
  authorities: "kernel.service.authorities.read",
  period: "kernel.service.periods.read",
  check: "kernel.service.authorization.check",
  batch: "kernel.service.authorization.check",
  installation: "kernel.service.modules.read",
  introspect: "kernel.service.tokens.introspect",
};

@Injectable()
export class ServiceApiGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    let scopes: string[];
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{
          sub?: string;
          scope?: string | string[];
        }>(token, { audience: "institutional-kernel" });
        if (!payload.sub)
          throw new UnauthorizedException("Service subject is required");
        scopes = Array.isArray(payload.scope)
          ? payload.scope
          : (payload.scope?.split(" ") ?? []);
        (
          request as Request & { service: { id: string; scopes: string[] } }
        ).service = { id: payload.sub, scopes };
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        throw new UnauthorizedException("Invalid service token");
      }
    } else {
      // Development-only compatibility for local compose. Never honored in
      // production, regardless of whether the env var happens to be set,
      // so it can't become a silent bypass in a misconfigured deployment.
      const expected = process.env.KERNEL_SERVICE_API_KEY;
      if (
        process.env.NODE_ENV === "production" ||
        !expected ||
        request.headers["x-service-api-key"] !== expected
      )
        throw new UnauthorizedException("Service credential required");
      scopes = ["*"];
      (
        request as Request & { service: { id: string; scopes: string[] } }
      ).service = { id: "dev-api-key", scopes };
    }
    const handler = context.getHandler().name;
    const requiredScope = serviceScopeByHandler[handler];
    if (
      requiredScope &&
      !scopes.includes("*") &&
      !scopes.includes(requiredScope)
    )
      throw new ForbiddenException(
        `Service credential is missing required scope: ${requiredScope}`,
      );
    return true;
  }
}
