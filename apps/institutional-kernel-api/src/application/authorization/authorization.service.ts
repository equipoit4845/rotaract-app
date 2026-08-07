import { Injectable } from "@nestjs/common";
import { AssignmentEffect, ScopeType } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { OptionalRedisCacheService } from "../../infrastructure/cache/optional-redis-cache.service";

export type AuthorizationInput = {
  personId: string;
  permissionCode: string;
  organizationId?: string;
  periodId?: string;
  at?: Date;
};
// Contract per kernel-spec.md §9.8: the shape callers of
// POST /authorization/check and /authorization/batch-check receive.
export type AuthorizationDecision = {
  allowed: boolean;
  decisionId: string;
  subjectId: string;
  permission: string;
  matchedAssignments: string[];
  reasonCodes: string[];
  evaluatedAt: string;
  cacheUntil?: string;
};
type CachedDecision = {
  allowed: boolean;
  reasonCodes: string[];
  matchedAssignments: string[];
};
const CACHE_TTL_SECONDS = 60;
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: OptionalRedisCacheService,
  ) {}
  async check(input: AuthorizationInput): Promise<AuthorizationDecision> {
    const at = input.at ?? new Date();
    const cacheVersion = input.at
      ? 1
      : ((await this.cache.get<number>(
          `kernel:permissions-version:${input.personId}:v1`,
        )) ?? 1);
    const cacheKey = `kernel:permissions:${input.personId}:${input.permissionCode}:${input.organizationId ?? "platform"}:${input.periodId ?? "current"}:${cacheVersion}`;
    const present = (cached: CachedDecision): AuthorizationDecision => ({
      ...cached,
      decisionId: randomUUID(),
      subjectId: input.personId,
      permission: input.permissionCode,
      evaluatedAt: new Date().toISOString(),
      cacheUntil: input.at
        ? undefined
        : new Date(Date.now() + CACHE_TTL_SECONDS * 1_000).toISOString(),
    });
    if (!input.at) {
      const cached = await this.cache.get<CachedDecision>(cacheKey);
      if (cached) return present(cached);
    }
    const person = await this.prisma.person.findUnique({
      where: { id: input.personId },
      include: { account: true },
    });
    if (person?.account?.platformRole === "SUPERADMIN") {
      await this.prisma.kernelAuditLog.create({
        data: {
          actorType: "USER",
          actorId: person.account.id,
          action: "authorization.superadmin_bypass",
          resourceType: "permission",
          resourceId: input.permissionCode,
          organizationId: input.organizationId,
          result: "SUCCESS",
          reason: "SUPERADMIN",
        },
      });
      const decision: CachedDecision = {
        allowed: true,
        reasonCodes: ["SUPERADMIN_BYPASS"],
        matchedAssignments: [],
      };
      if (!input.at)
        await this.cache.set(cacheKey, decision, CACHE_TTL_SECONDS);
      return present(decision);
    }
    const assignments = await this.prisma.roleAssignment.findMany({
      where: {
        personId: input.personId,
        revokedAt: null,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
      },
      include: {
        roleDefinition: {
          include: { permissions: { include: { permissionDefinition: true } } },
        },
      },
    });
    const applicable: Array<{
      id: string;
      effect: AssignmentEffect;
      specificity: number;
    }> = [];
    for (const assignment of assignments) {
      if (
        !assignment.roleDefinition.permissions.some(
          (link) => link.permissionDefinition.code === input.permissionCode,
        )
      )
        continue;
      if (
        input.periodId &&
        assignment.periodId &&
        assignment.periodId !== input.periodId
      )
        continue;
      const specificity = await this.scopeSpecificity(
        assignment.scopeType,
        assignment.organizationId,
        input.organizationId,
      );
      if (specificity < 0) continue;
      applicable.push({
        id: assignment.id,
        effect: assignment.effect,
        specificity,
      });
    }
    const maximum = Math.max(-1, ...applicable.map((item) => item.specificity));
    const strongest = applicable.filter((item) => item.specificity === maximum);
    const denied = strongest.some(
      (item) => item.effect === AssignmentEffect.DENY,
    );
    const allowed =
      !denied &&
      strongest.some((item) => item.effect === AssignmentEffect.ALLOW);
    const winningEffect = denied
      ? AssignmentEffect.DENY
      : AssignmentEffect.ALLOW;
    const decision: CachedDecision = {
      allowed,
      reasonCodes: [
        denied ? "EXPLICIT_DENY" : allowed ? "ROLE_ALLOWED" : "NO_GRANT",
      ],
      matchedAssignments:
        denied || allowed
          ? strongest
              .filter((item) => item.effect === winningEffect)
              .map((item) => item.id)
          : [],
    };
    if (!input.at) await this.cache.set(cacheKey, decision, CACHE_TTL_SECONDS);
    return present(decision);
  }
  async invalidate(personId: string): Promise<void> {
    await this.cache.set(
      `kernel:permissions-version:${personId}:v1`,
      Date.now(),
      3_600,
    );
  }
  private async scopeSpecificity(
    scope: ScopeType,
    assignmentOrganizationId: string | null,
    resourceOrganizationId?: string,
  ): Promise<number> {
    if (scope === ScopeType.PLATFORM) return 0;
    if (!assignmentOrganizationId || !resourceOrganizationId) return -1;
    if (scope === ScopeType.ORGANIZATION)
      return assignmentOrganizationId === resourceOrganizationId ? 3 : -1;
    if (assignmentOrganizationId === resourceOrganizationId) return 2;
    return (await this.scopeMatches(
      scope,
      assignmentOrganizationId,
      resourceOrganizationId,
    ))
      ? 1
      : -1;
  }
  private async scopeMatches(
    scope: ScopeType,
    assignmentOrganizationId: string | null,
    resourceOrganizationId?: string,
  ): Promise<boolean> {
    if (scope === ScopeType.PLATFORM) return true;
    if (!assignmentOrganizationId || !resourceOrganizationId) return false;
    if (scope === ScopeType.ORGANIZATION)
      return assignmentOrganizationId === resourceOrganizationId;
    if (assignmentOrganizationId === resourceOrganizationId) return true;
    let current = await this.prisma.organization.findUnique({
      where: { id: resourceOrganizationId },
      select: { parentId: true },
    });
    while (current?.parentId) {
      if (current.parentId === assignmentOrganizationId) return true;
      current = await this.prisma.organization.findUnique({
        where: { id: current.parentId },
        select: { parentId: true },
      });
    }
    return false;
  }
  async effectivePermissions(
    personId: string,
    organizationId?: string,
    periodId?: string,
  ): Promise<string[]> {
    const permissions = await this.prisma.permissionDefinition.findMany({
      select: { code: true },
    });
    const decisions = await Promise.all(
      permissions.map(async (permission) => ({
        code: permission.code,
        decision: await this.check({
          personId,
          permissionCode: permission.code,
          organizationId,
          periodId,
        }),
      })),
    );
    return decisions
      .filter((item) => item.decision.allowed)
      .map((item) => item.code);
  }
}
