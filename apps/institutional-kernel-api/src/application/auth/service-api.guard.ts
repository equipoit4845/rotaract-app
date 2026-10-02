import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DeveloperAppStatus } from "@prisma/client";
import type { Request } from "express";

import { SigningKeyService } from "../../infrastructure/crypto/signing-key.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { KERNEL_AUDIENCE } from "../oauth/scopes";

/**
 * Who is calling /service/* and what it may see. `organizationId` /
 * `allowedOrganizationIds` are undefined only for the development
 * x-service-api-key bypass, which means "unrestricted"; services that list
 * data must filter by `allowedOrganizationIds` whenever it is set.
 */
export type ServiceIdentity = {
  id: string;
  clientId?: string;
  scopes: string[];
  organizationId?: string;
  allowedOrganizationIds?: string[];
};

export type ServiceRequest = Request & { service: ServiceIdentity };

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

const OUT_OF_SCOPE = "Fuera del alcance de esta app";

type ServiceTokenPayload = {
  sub?: string;
  client_id?: string;
  token_use?: string;
  scope?: string;
  org?: string;
};

/**
 * Authenticates developer-app service tokens (ES256, issued by
 * `grant_type=client_credentials`, docs/11-developer-platform-auth.md
 * §ServiceApiGuard) and confines each app to its organization's tree.
 */
@Injectable()
export class ServiceApiGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: SigningKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ServiceRequest>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token) request.service = await this.fromToken(token);
    else {
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
      request.service = { id: "dev-api-key", scopes: ["*"] };
    }
    const { scopes, allowedOrganizationIds } = request.service;
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
    if (allowedOrganizationIds)
      await this.assertInScope(
        handler,
        request,
        new Set(allowedOrganizationIds),
      );
    return true;
  }

  private async fromToken(token: string): Promise<ServiceIdentity> {
    let payload: ServiceTokenPayload;
    try {
      payload = await this.keys.verify<ServiceTokenPayload>(token, {
        audience: KERNEL_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException("Invalid service token");
    }
    if (
      payload.token_use !== "service" ||
      !payload.sub ||
      !payload.client_id ||
      !payload.org
    )
      throw new UnauthorizedException("Invalid service token");
    // Checked on every request: suspending or revoking an app cuts its
    // tokens immediately, not when they expire.
    const app = await this.prisma.developerApp.findUnique({
      where: { clientId: payload.client_id },
      select: { status: true, organizationId: true },
    });
    if (
      !app ||
      app.status !== DeveloperAppStatus.ACTIVE ||
      app.organizationId !== payload.org
    )
      throw new UnauthorizedException("Service app is not active");
    return {
      id: payload.sub,
      clientId: payload.client_id,
      scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
      organizationId: payload.org,
      allowedOrganizationIds: await this.organizationTree(payload.org),
    };
  }

  /** The organization and all its descendants. */
  private async organizationTree(rootId: string): Promise<string[]> {
    const ids = [rootId];
    let frontier = [rootId];
    while (frontier.length) {
      const children = await this.prisma.organization.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = children
        .map((child) => child.id)
        .filter((id) => !ids.includes(id));
      ids.push(...frontier);
    }
    return ids;
  }

  private async assertInScope(
    handler: string,
    request: Request,
    allowed: Set<string>,
  ): Promise<void> {
    const deny = () => new ForbiddenException(OUT_OF_SCOPE);
    const params = request.params ?? {};
    if (params.organizationId && !allowed.has(String(params.organizationId)))
      throw deny();
    if (
      params.personId &&
      !(await this.personInScope(String(params.personId), allowed))
    )
      throw deny();
    if (params.accountId) {
      const account = await this.prisma.userAccount.findUnique({
        where: { id: String(params.accountId) },
        select: { personId: true },
      });
      if (!account || !(await this.personInScope(account.personId, allowed)))
        throw deny();
    }
    if (handler === "check" || handler === "batch") {
      const body = (request.body ?? {}) as {
        checks?: unknown;
      } & CheckItem;
      const items: CheckItem[] =
        handler === "batch"
          ? Array.isArray(body.checks)
            ? (body.checks as CheckItem[])
            : []
          : [body];
      // A check without an organization is a platform-wide question, which
      // is outside any organization-bound app.
      for (const item of items) {
        const organizationId =
          item?.scope?.organizationId ?? item?.organizationId;
        if (typeof organizationId !== "string" || !allowed.has(organizationId))
          throw deny();
      }
    }
  }

  private async personInScope(
    personId: string,
    allowed: Set<string>,
  ): Promise<boolean> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        personId: String(personId),
        organizationId: { in: [...allowed] },
      },
      select: { id: true },
    });
    return !!membership;
  }
}

type CheckItem = {
  organizationId?: unknown;
  scope?: { organizationId?: unknown };
};
