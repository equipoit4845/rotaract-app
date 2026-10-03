import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DeveloperAppReviewStatus,
  DeveloperAppStatus,
  Prisma,
} from "@prisma/client";

import type { CommandContext } from "../../domain/shared/command-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { scopeLabel } from "../oauth/scopes";
import { CommandExecutorService } from "../shared/command-executor.service";
import { organizationTree } from "../webhooks/event-mapper";
import { validateQuotaOverride } from "./app-quota";
import { AppQuotaService } from "./app-quota.service";
import { pendingScopes, validateReviewDecision } from "./review-policy";

const STATUSES = Object.values(DeveloperAppReviewStatus) as string[];

function personName(person: {
  firstName: string;
  lastName: string;
  displayName: string | null;
}): string {
  return person.displayName || `${person.firstName} ${person.lastName}`.trim();
}

const describe = (scope: string) => ({ scope, label: scopeLabel(scope) });

/**
 * E11.1 — the RDR's review of each app before production, with the
 * checklist (purpose, requested data, owner, privacy policy, contact).
 * docs/18-data-governance.md §"Revisión de apps".
 */
@Injectable()
export class AppReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandExecutorService,
    private readonly audit: AuditService,
    private readonly quotas: AppQuotaService,
  ) {}

  /** E11.3 — the app's limits and how much of them it used. */
  async quota(appId: string) {
    const app = await this.load(this.prisma, appId);
    const usage = await this.quotas.usage(app);
    const window = (limit: number, used: number, resetsInSeconds: number) => ({
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsInSeconds,
    });
    return {
      enabled: this.quotas.enabled,
      source: usage.limits.source,
      perMinute: window(
        usage.limits.perMinute,
        usage.minuteUsed,
        usage.minuteResetSeconds,
      ),
      perDay: window(usage.limits.perDay, usage.dayUsed, usage.dayResetSeconds),
      defaults: {
        perMinute: app.approvedAt
          ? this.quotas.defaults.perMinute
          : this.quotas.defaults.reviewPerMinute,
        perDay: app.approvedAt
          ? this.quotas.defaults.perDay
          : this.quotas.defaults.reviewPerDay,
      },
    };
  }

  /** The RDR's override (null = back to the default). */
  async updateQuota(appId: string, input: unknown, context: CommandContext) {
    this.actor(context);
    const body = (input ?? {}) as Record<string, unknown>;
    let limits: ReturnType<typeof validateQuotaOverride>;
    try {
      limits = validateQuotaOverride(body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    await this.commands.execute(
      "updateDeveloperAppQuota",
      context,
      { appId, ...limits },
      async (tx) => {
        const app = await this.load(tx, appId);
        await tx.developerApp.update({ where: { id: appId }, data: limits });
        await this.audit.record(
          tx,
          context,
          "updateDeveloperAppQuota",
          "DeveloperApp",
          appId,
          app.organizationId,
        );
        return { appId };
      },
    );
    return this.quota(appId);
  }

  /** Apps of the organization and its descendants, by review status. */
  async queue(organizationId: string, status?: string) {
    if (!organizationId)
      throw new BadRequestException("organizationId es obligatorio");
    const reviewStatus = status || DeveloperAppReviewStatus.IN_REVIEW;
    if (!STATUSES.includes(reviewStatus))
      throw new BadRequestException(
        `status debe ser uno de: ${STATUSES.join(", ")}`,
      );
    const tree = await organizationTree(this.prisma, organizationId);
    const apps = await this.prisma.developerApp.findMany({
      where: {
        organizationId: { in: tree },
        reviewStatus: reviewStatus as DeveloperAppReviewStatus,
        status: { not: DeveloperAppStatus.REVOKED },
      },
      include: {
        organization: { select: { name: true } },
        owner: {
          select: { firstName: true, lastName: true, displayName: true },
        },
        reviews: {
          where: { kind: { in: ["SUBMITTED", "REOPENED"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return apps.map((app) => ({
      appId: app.id,
      name: app.name,
      description: app.description,
      type: app.type,
      status: app.status,
      reviewStatus: app.reviewStatus,
      organizationId: app.organizationId,
      organizationName: app.organization.name,
      ownerPersonId: app.ownerPersonId,
      ownerName: personName(app.owner),
      purpose: app.purpose,
      privacyPolicyUrl: app.privacyPolicyUrl,
      contactEmail: app.contactEmail,
      scopes: app.scopes.map(describe),
      pendingScopes: pendingScopes(app).map(describe),
      submittedAt: app.reviews[0]?.createdAt ?? app.createdAt,
      approvedAt: app.approvedAt,
    }));
  }

  async history(appId: string) {
    await this.load(this.prisma, appId);
    const reviews = await this.prisma.developerAppReview.findMany({
      where: { appId },
      orderBy: { createdAt: "desc" },
    });
    const actorIds = [
      ...new Set(
        reviews.map((r) => r.actorPersonId).filter((id): id is string => !!id),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: actorIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        })
      : [];
    const names = new Map(actors.map((a) => [a.id, personName(a)]));
    return reviews.map((review) => ({
      id: review.id,
      kind: review.kind,
      checklist: (review.checklist as Record<string, boolean> | null) ?? null,
      reason: review.reason,
      actorPersonId: review.actorPersonId,
      actorName: review.actorPersonId
        ? (names.get(review.actorPersonId) ?? null)
        : null,
      scopes: review.scopes,
      createdAt: review.createdAt,
    }));
  }

  /** The RDR approves (every checklist item) or rejects (with a reason). */
  async decide(appId: string, input: unknown, context: CommandContext) {
    const actor = this.actor(context);
    const body = (input ?? {}) as Record<string, unknown>;
    const request = {
      decision: body.decision,
      checklist: body.checklist,
      reason: body.reason,
    };
    return this.commands.execute(
      "reviewDeveloperApp",
      context,
      { appId, ...request },
      async (tx) => {
        const app = await this.load(tx, appId);
        if (app.status === DeveloperAppStatus.REVOKED)
          throw new ConflictException("Una app revocada no se revisa");
        if (app.reviewStatus !== DeveloperAppReviewStatus.IN_REVIEW)
          throw new ConflictException("Esta app no está esperando revisión");
        const decision = validateReviewDecision(request, app);
        const now = new Date();
        const approve = decision.decision === "approve";
        await tx.developerApp.update({
          where: { id: appId },
          data: approve
            ? {
                reviewStatus: DeveloperAppReviewStatus.APPROVED,
                approvedScopes: app.scopes,
                approvedAt: app.approvedAt ?? now,
                reviewedAt: now,
              }
            : {
                reviewStatus: DeveloperAppReviewStatus.REJECTED,
                reviewedAt: now,
              },
        });
        const review = await tx.developerAppReview.create({
          data: {
            appId,
            kind: approve ? "APPROVED" : "REJECTED",
            checklist: decision.checklist as Prisma.InputJsonValue,
            reason: decision.reason,
            actorPersonId: actor,
            scopes: app.scopes,
          },
        });
        await this.audit.record(
          tx,
          context,
          approve ? "approveDeveloperApp" : "rejectDeveloperApp",
          "DeveloperApp",
          appId,
          app.organizationId,
        );
        return {
          id: review.id,
          kind: review.kind,
          checklist: decision.checklist,
          reason: review.reason,
          actorPersonId: actor,
          actorName: null,
          scopes: review.scopes,
          createdAt: review.createdAt,
        };
      },
    );
  }

  /** After a rejection, the team fixes what was asked and sends it again. */
  async requestReview(appId: string, context: CommandContext) {
    const actor = this.actor(context);
    return this.commands.execute(
      "requestDeveloperAppReview",
      context,
      { appId },
      async (tx) => {
        const app = await this.load(tx, appId);
        if (app.status === DeveloperAppStatus.REVOKED)
          throw new ConflictException("Una app revocada no se revisa");
        if (app.reviewStatus === DeveloperAppReviewStatus.IN_REVIEW)
          throw new ConflictException("La app ya está esperando revisión");
        if (
          app.reviewStatus === DeveloperAppReviewStatus.APPROVED &&
          pendingScopes(app).length === 0
        )
          throw new ConflictException(
            "La app ya está aprobada y no pide nada nuevo",
          );
        await tx.developerApp.update({
          where: { id: appId },
          data: { reviewStatus: DeveloperAppReviewStatus.IN_REVIEW },
        });
        await tx.developerAppReview.create({
          data: {
            appId,
            kind: "SUBMITTED",
            actorPersonId: actor,
            scopes: app.scopes,
          },
        });
        await this.audit.record(
          tx,
          context,
          "requestDeveloperAppReview",
          "DeveloperApp",
          appId,
          app.organizationId,
        );
        return { appId, reviewStatus: DeveloperAppReviewStatus.IN_REVIEW };
      },
    );
  }

  private async load(
    client: PrismaService | Prisma.TransactionClient,
    appId: string,
  ) {
    const app = await client.developerApp.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException("App no encontrada");
    return app;
  }

  private actor(context: CommandContext): string {
    if (context.actor.type !== "USER" || !context.actor.id)
      throw new BadRequestException(
        "Esta operación requiere una persona autenticada",
      );
    return context.actor.id;
  }
}
