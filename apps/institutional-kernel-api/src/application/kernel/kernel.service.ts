import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes, randomUUID } from "crypto";
import {
  AppointmentStatus,
  AssignmentEffect,
  MembershipStatus,
  MembershipTransitionType,
  OrganizationStatus,
  PeriodStatus,
  Prisma,
  ScopeType,
  TransferStatus,
} from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { OutboxService } from "../outbox/outbox.service";
import { CommandExecutorService } from "../shared/command-executor.service";
import { NotificationService } from "../notifications/notification.service";
import { webUrl } from "../shared/web-url";
import { allowInput } from "../shared/input-allowlist";
import {
  compareSemver,
  summarizeErrors,
  validateConfiguration,
  validateManifest,
  type ModuleManifest,
  type ValidationError,
} from "../modules/manifest";
import { SUBSCRIBABLE_EVENT_TYPES } from "../webhooks/catalog";

/**
 * Permissions that act beyond a single club (structure, role delegation,
 * platform data). A club-owned position can never receive them.
 */
const DISTRICT_ONLY_PERMISSIONS = new Set([
  "kernel.organization.create",
  "kernel.organization.activate",
  "kernel.organization.archive",
  "kernel.organization.move",
  "kernel.person.manage",
  "kernel.role.manage",
  "kernel.role.assign",
  "kernel.role.revoke",
  "kernel.module.register",
  "kernel.account.manage",
  "kernel.audit.read",
]);
import { OptionalRedisCacheService } from "../../infrastructure/cache/optional-redis-cache.service";
import { CommandContext } from "../../domain/shared/command-context";
import {
  assertActiveMembership,
  assertDateRange,
  assertDistrictMembership,
  assertNonArchived,
  assertRotaryPeriod,
  assertScope,
} from "../../domain/institutional/invariants";
import {
  applicationStateMachine,
  appointmentStateMachine,
  installationStateMachine,
  membershipStateMachine,
  periodStateMachine,
  transferStateMachine,
} from "../../domain/institutional/state-machines";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

type Json = Prisma.InputJsonValue;
type Page<T> = {
  items: T[];
  pageInfo: { hasMore: boolean; nextCursor: string | null };
};

/** Application boundary for every institutional aggregate. HTTP adapters never access Prisma. */
@Injectable()
export class KernelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandExecutorService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly notifications: NotificationService,
    private readonly cache: OptionalRedisCacheService,
  ) {}

  private context(
    context?: CommandContext,
    operation = "KernelCommand",
  ): CommandContext {
    return context ?? this.commands.systemContext(operation);
  }
  // §15: Redis-backed read caches for the org tree, current period,
  // current authorities and module installations. Redis is never the
  // source of truth — OptionalRedisCacheService already falls back to
  // "no cache" on any failure, so a cache miss always resolves against
  // PostgreSQL. Each cached read is namespaced under a version key that
  // the corresponding mutation bumps (§15.3), which invalidates every
  // previously cached entry for that key without having to enumerate them.
  private async cacheVersion(key: string): Promise<number> {
    return (await this.cache.get<number>(key)) ?? 1;
  }
  private async bumpCacheVersion(key: string): Promise<void> {
    await this.cache.set(key, Date.now(), 3_600);
  }
  private async cached<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await load();
    await this.cache.set(key, value, ttlSeconds);
    return value;
  }
  private async mutate<T extends object>(
    operation: string,
    context: CommandContext | undefined,
    request: object,
    resource: {
      type: string;
      id: string;
      organizationId?: string;
      event?: string;
      payload?: Json;
    },
    handler: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const meta = this.context(context, operation);
    return this.commands.execute(operation, meta, request, async (tx) => {
      const result = await handler(tx);
      const resourceId =
        resource.id === "pending"
          ? String((result as { id?: string }).id ?? resource.id)
          : resource.id;
      if (resource.event)
        await this.outbox.record(
          tx,
          resource.event,
          resource.type,
          resourceId,
          resource.payload ?? { id: resourceId },
          meta,
          resource.organizationId,
        );
      await this.audit.record(
        tx,
        meta,
        operation,
        resource.type,
        resourceId,
        resource.organizationId,
      );
      return result;
    });
  }
  private page<T extends { id: string }>(items: T[], limit: number): Page<T> {
    const data = items.slice(0, limit);
    return {
      items: data,
      pageInfo: {
        hasMore: items.length > limit,
        nextCursor: data.at(-1)?.id ?? null,
      },
    };
  }
  private date(value?: string | Date | null): Date | null {
    return value ? new Date(value) : null;
  }

  // Persons
  createPerson(input: any, context?: CommandContext) {
    input = allowInput("createPerson", input);
    return this.mutate(
      "CreatePerson",
      context,
      input,
      { type: "Person", id: "pending", event: undefined },
      async (tx) => {
        const person = await tx.person.create({ data: input });
        await this.outbox.record(
          tx,
          "kernel.person.created.v1",
          "Person",
          person.id,
          { personId: person.id },
          this.context(context),
        );
        return person;
      },
    );
  }
  listPersons(query: any = {}): Promise<Page<any>> {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    return this.prisma.person
      .findMany({
        where: {
          archivedAt: query.includeArchived ? undefined : null,
          OR: query.query
            ? [
                { firstName: { contains: query.query, mode: "insensitive" } },
                { lastName: { contains: query.query, mode: "insensitive" } },
                {
                  primaryEmail: { contains: query.query, mode: "insensitive" },
                },
              ]
            : undefined,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
        cursor: query.cursor ? { id: String(query.cursor) } : undefined,
        skip: query.cursor ? 1 : undefined,
        take: limit + 1,
      })
      .then((values) => this.page(values, limit));
  }
  getPerson(id: string) {
    return this.prisma.person.findUniqueOrThrow({ where: { id } });
  }
  updatePerson(id: string, input: any, context?: CommandContext) {
    input = allowInput("updatePerson", input);
    return this.mutate(
      "UpdatePerson",
      context,
      { id, input },
      {
        type: "Person",
        id,
        event: "kernel.person.updated.v1",
        // kernel-events-contract.md: names of the changed fields, not values.
        payload: { personId: id, changedFields: Object.keys(input) },
      },
      (tx) => tx.person.update({ where: { id }, data: input }),
    );
  }
  archivePerson(id: string, context?: CommandContext) {
    return this.mutate(
      "ArchivePerson",
      context,
      { id },
      {
        type: "Person",
        id,
        event: "kernel.person.archived.v1",
        payload: { personId: id },
      },
      (tx) =>
        tx.person.update({ where: { id }, data: { archivedAt: new Date() } }),
    );
  }
  async invitePerson(
    personId: string,
    input: { membershipId: string; email: string },
    context?: CommandContext,
  ) {
    let token = "";
    const invitation = await this.mutate(
      "InvitePersonToCreateAccount",
      context,
      { personId, input },
      { type: "AccountInvitation", id: "pending" },
      async (tx) => {
        const membership = await tx.organizationMembership.findFirst({
          where: { id: input.membershipId, personId },
        });
        if (!membership)
          throw new BadRequestException(
            "Invitation membership must belong to the person",
          );
        token = randomBytes(32).toString("base64url");
        return tx.accountInvitation.create({
          data: {
            personId,
            membershipId: input.membershipId,
            email: input.email.trim().toLowerCase(),
            tokenHash: await argon2.hash(token),
            expiresAt: new Date(Date.now() + 7 * 86_400_000),
            invitedById: this.context(context).actor.id,
          },
        });
      },
    );
    await this.notifications.sendEmail({
      to: invitation.email,
      subject: "Te invitaron a Mi Rotaract",
      html: `<p>Te invitaron a crear tu cuenta en Mi Rotaract. Aceptá la invitación haciendo clic en el siguiente enlace (vence en 7 días):</p><p><a href="${webUrl(`/accept-invitation?token=${token}`)}">Aceptar invitación</a></p>`,
      idempotencyKey: `invite:${invitation.id}`,
    });
    return invitation;
  }

  // Organizations and hierarchy
  async createOrganization(input: any, context?: CommandContext) {
    input = allowInput("createOrganization", input);
    return this.mutate(
      "CreateOrganization",
      context,
      input,
      { type: "Organization", id: "pending" },
      async (tx) => {
        await this.assertOrganizationParent(tx, input.type, input.parentId);
        const organization = await tx.organization.create({ data: input });
        await this.outbox.record(
          tx,
          "kernel.organization.created.v1",
          "Organization",
          organization.id,
          { organizationId: organization.id },
          this.context(context),
        );
        await this.bumpCacheVersion("kernel:org-tree-version:v1");
        return organization;
      },
    );
  }
  listOrganizations(query: any = {}): Promise<Page<any>> {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const where: any = {
      type: query.type,
      status: query.status,
      parentId: query.parentId,
      OR: query.query
        ? [
            { name: { contains: query.query, mode: "insensitive" } },
            { code: { contains: query.query, mode: "insensitive" } },
          ]
        : undefined,
    };
    return this.prisma.organization
      .findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        cursor: query.cursor ? { id: String(query.cursor) } : undefined,
        skip: query.cursor ? 1 : undefined,
        take: limit + 1,
      })
      .then((values) => this.page(values, limit));
  }
  getOrganization(id: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id } });
  }
  updateOrganization(id: string, input: any, context?: CommandContext) {
    input = allowInput("updateOrganization", input);
    return this.mutate(
      "UpdateOrganization",
      context,
      { id, input },
      {
        type: "Organization",
        id,
        event: "kernel.organization.updated.v1",
        payload: { organizationId: id, changedFields: Object.keys(input) },
      },
      async (tx) => {
        const updated = await tx.organization.update({
          where: { id },
          data: input,
        });
        await this.bumpCacheVersion("kernel:org-tree-version:v1");
        return updated;
      },
    );
  }
  transitionOrganization(
    id: string,
    target: OrganizationStatus,
    context?: CommandContext,
  ) {
    const event: Record<string, string> = {
      ACTIVE: "kernel.organization.activated.v1",
      INACTIVE: "kernel.organization.deactivated.v1",
      ARCHIVED: "kernel.organization.archived.v1",
    };
    return this.mutate(
      `${target}Organization`,
      context,
      { id, target },
      {
        type: "Organization",
        id,
        event: event[target],
        payload: { organizationId: id, status: target },
      },
      async (tx) => {
        const current = await tx.organization.findUniqueOrThrow({
          where: { id },
        });
        const allowed: Record<string, string[]> = {
          DRAFT: ["ACTIVE", "ARCHIVED"],
          ACTIVE: ["INACTIVE"],
          INACTIVE: ["ACTIVE", "ARCHIVED"],
          ARCHIVED: [],
        };
        if (!allowed[current.status].includes(target))
          throw new ConflictException("Invalid organization transition");
        const updated = await tx.organization.update({
          where: { id },
          data: {
            status: target,
            archivedAt: target === "ARCHIVED" ? new Date() : null,
          },
        });
        await this.bumpCacheVersion("kernel:org-tree-version:v1");
        return updated;
      },
    );
  }
  async moveOrganization(
    id: string,
    parentId: string,
    context?: CommandContext,
  ) {
    return this.mutate(
      "MoveOrganization",
      context,
      { id, parentId },
      {
        type: "Organization",
        id,
        event: "kernel.organization.moved.v1",
        payload: { organizationId: id, parentId },
      },
      async (tx) => {
        if (id === parentId)
          throw new BadRequestException(
            "Organization cannot be its own parent",
          );
        const descendants = await this.descendantsIn(tx, id);
        if (descendants.includes(parentId))
          throw new BadRequestException("Organization hierarchy cycle");
        const org = await tx.organization.findUniqueOrThrow({ where: { id } });
        await this.assertOrganizationParent(tx, org.type, parentId);
        const updated = await tx.organization.update({
          where: { id },
          data: { parentId },
        });
        await this.bumpCacheVersion("kernel:org-tree-version:v1");
        return updated;
      },
    );
  }
  children(id: string) {
    return this.prisma.organization.findMany({
      where: { parentId: id },
      orderBy: { name: "asc" },
    });
  }
  async ancestors(id: string) {
    const values: any[] = [];
    let current = await this.prisma.organization.findUnique({ where: { id } });
    while (current?.parentId) {
      const parent = await this.prisma.organization.findUnique({
        where: { id: current.parentId },
      });
      if (!parent) break;
      values.push(parent);
      current = parent;
    }
    return values;
  }
  async descendants(id: string) {
    const version = await this.cacheVersion("kernel:org-tree-version:v1");
    return this.cached(`kernel:org-tree:${id}:${version}`, 60, async () => {
      const ids = await this.descendantsIn(this.prisma, id);
      return this.prisma.organization.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
      });
    });
  }
  private async descendantsIn(tx: any, id: string): Promise<string[]> {
    const result: string[] = [];
    const walk = async (parentId: string): Promise<void> => {
      const children = await tx.organization.findMany({
        where: { parentId },
        select: { id: true },
      });
      for (const child of children) {
        result.push(child.id);
        await walk(child.id);
      }
    };
    await walk(id);
    return result;
  }
  private async assertOrganizationParent(
    tx: any,
    type: string,
    parentId?: string,
  ): Promise<void> {
    if (type === "CLUB" && !parentId)
      throw new BadRequestException("A club must belong to a district");
    if (!parentId) return;
    const parent = await tx.organization.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new NotFoundException("Parent organization not found");
    if (type === "CLUB" && parent.type !== "DISTRICT")
      throw new BadRequestException("A club must belong to a district");
  }

  // Memberships
  async createMembership(
    organizationId: string,
    input: any,
    context?: CommandContext,
  ) {
    input = allowInput("createMembership", input);
    return this.mutate(
      "CreateMembership",
      context,
      { organizationId, input },
      { type: "OrganizationMembership", id: "pending", organizationId },
      async (tx) => {
        const [organization, person] = await Promise.all([
          tx.organization.findUnique({ where: { id: organizationId } }),
          tx.person.findUnique({ where: { id: input.personId } }),
        ]);
        if (!organization || organization.status !== "ACTIVE")
          throw new BadRequestException(
            "Only active organizations accept memberships",
          );
        if (!person) throw new NotFoundException("Person not found");
        assertNonArchived(person.archivedAt);
        const membership = await tx.organizationMembership.create({
          data: { ...input, organizationId },
        });
        await tx.membershipTransition.create({
          data: {
            membershipId: membership.id,
            type: MembershipTransitionType.CREATED,
            toStatus: MembershipStatus.PENDING,
            effectiveAt: new Date(),
            commandId: this.context(context).commandId,
          },
        });
        await this.outbox.record(
          tx,
          "kernel.membership.created.v1",
          "OrganizationMembership",
          membership.id,
          {
            membershipId: membership.id,
            organizationId,
            personId: membership.personId,
          },
          this.context(context),
        );
        return membership;
      },
    );
  }
  listMemberships(organizationId: string, query: any = {}): Promise<Page<any>> {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const statuses = Array.isArray(query.status)
      ? query.status
      : query.status
        ? [query.status]
        : undefined;
    return this.prisma.organizationMembership
      .findMany({
        where: {
          organizationId,
          status: statuses ? { in: statuses } : undefined,
          personId: query.personId,
        },
        include: { person: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        cursor: query.cursor ? { id: String(query.cursor) } : undefined,
        skip: query.cursor ? 1 : undefined,
        take: limit + 1,
      })
      .then((values) => this.page(values, limit));
  }
  getMembership(id: string) {
    return this.prisma.organizationMembership.findUniqueOrThrow({
      where: { id },
      include: { person: true, organization: true },
    });
  }
  updateMembership(id: string, input: any, context?: CommandContext) {
    input = allowInput("updateMembership", input);
    return this.mutate(
      "UpdateMembership",
      context,
      { id, input },
      { type: "OrganizationMembership", id },
      (tx) => tx.organizationMembership.update({ where: { id }, data: input }),
    );
  }
  transitionMembership(
    id: string,
    target: MembershipStatus,
    type: MembershipTransitionType,
    input: any = {},
    context?: CommandContext,
  ) {
    return this.mutate(
      `${target}Membership`,
      context,
      { id, target, input },
      { type: "OrganizationMembership", id },
      async (tx) => {
        const previous = await tx.organizationMembership.findUniqueOrThrow({
          where: { id },
        });
        membershipStateMachine.assertTransition(previous.status, target);
        const now = new Date();
        const terminal = ["INACTIVE", "GRADUATED", "TRANSFERRED"].includes(
          target,
        );
        const membership = await tx.organizationMembership.update({
          where: { id },
          data: {
            status: target,
            statusChangedAt: now,
            joinedAt:
              target === "ACTIVE"
                ? (previous.joinedAt ?? now)
                : previous.joinedAt,
            endedAt: terminal ? now : null,
            internalNotes: input.internalNotes ?? previous.internalNotes,
          },
        });
        await this.syncMemberRole(tx, id, context);
        if (terminal) await this.closeAppointmentsOfMembership(tx, id, context);
        await tx.membershipTransition.create({
          data: {
            membershipId: id,
            type,
            fromStatus: previous.status,
            toStatus: target,
            reasonCode: input.reasonCode,
            reasonText: input.reasonText,
            effectiveAt: now,
            performedById: this.context(context).actor.id,
            commandId: this.context(context).commandId,
          },
        });
        await this.outbox.record(
          tx,
          target === "ACTIVE"
            ? "kernel.membership.activated.v1"
            : "kernel.membership.status-changed.v1",
          "OrganizationMembership",
          id,
          {
            membershipId: id,
            organizationId: previous.organizationId,
            personId: previous.personId,
            transitionType: type,
            fromStatus: previous.status,
            toStatus: target,
            effectiveAt: now.toISOString(),
          },
          this.context(context),
          previous.organizationId,
        );
        return membership;
      },
    );
  }
  /**
   * Keeps the MEMBER role in step with the membership (kernel-spec.md
   * §10.2): an ACTIVE or ON_LEAVE member holds MEMBER scoped to exactly
   * their organization; any other status holds none. Idempotent, so every
   * path that changes a membership's status can call it.
   */
  private async syncMemberRole(
    tx: any,
    membershipId: string,
    context?: CommandContext,
  ): Promise<void> {
    const [membership, role] = await Promise.all([
      tx.organizationMembership.findUniqueOrThrow({
        where: { id: membershipId },
        select: { personId: true, organizationId: true, status: true },
      }),
      tx.roleDefinition.findUnique({ where: { code: "MEMBER" } }),
    ]);
    if (!role) return;
    const where = {
      personId: membership.personId,
      roleDefinitionId: role.id,
      scopeType: ScopeType.ORGANIZATION,
      organizationId: membership.organizationId,
      revokedAt: null,
    };
    const shouldHold = ["ACTIVE", "ON_LEAVE"].includes(membership.status);
    const held = await tx.roleAssignment.count({ where });
    if (shouldHold && held === 0)
      await tx.roleAssignment.create({
        data: {
          personId: membership.personId,
          roleDefinitionId: role.id,
          scopeType: ScopeType.ORGANIZATION,
          organizationId: membership.organizationId,
          effect: AssignmentEffect.ALLOW,
          validFrom: new Date(),
          reason: `membership:${membershipId}`,
          grantedById: this.context(context).actor.id,
        },
      });
    else if (!shouldHold && held > 0)
      await tx.roleAssignment.updateMany({
        where,
        data: {
          revokedAt: new Date(),
          revokedById: this.context(context).actor.id,
        },
      });
    else return;
    await this.authorization.invalidate(membership.personId);
  }
  /**
   * A membership that ends (INACTIVE, GRADUATED, TRANSFERRED) can no longer
   * back an authority: an ACTIVE appointment is ENDED, a NOMINATED/ELECTED
   * one is REVOKED (it can never take office), and the roles they derived
   * are revoked — otherwise a former president would keep their
   * permissions. Emits the same events and cache invalidations as the
   * manual appointment transitions.
   */
  private async closeAppointmentsOfMembership(
    tx: any,
    membershipId: string,
    context?: CommandContext,
  ): Promise<void> {
    const open = await tx.appointment.findMany({
      where: {
        membershipId,
        status: { in: ["NOMINATED", "ELECTED", "ACTIVE"] },
      },
      include: { membership: { select: { personId: true } } },
    });
    if (!open.length) return;
    const now = new Date();
    const actorId = this.context(context).actor.id;
    for (const appointment of open) {
      const target = appointment.status === "ACTIVE" ? "ENDED" : "REVOKED";
      appointmentStateMachine.assertTransition(appointment.status, target);
      await tx.appointment.update({
        where: { id: appointment.id },
        data:
          target === "ENDED"
            ? { status: target, endedAt: now }
            : {
                status: target,
                revokedAt: now,
                revokedById: actorId,
                revokeReason: "La membresía que respaldaba el cargo finalizó",
              },
      });
      await tx.roleAssignment.updateMany({
        where: { sourceAppointmentId: appointment.id, revokedAt: null },
        data: { revokedAt: now, revokedById: actorId },
      });
      await this.outbox.record(
        tx,
        target === "ENDED"
          ? "kernel.appointment.ended.v1"
          : "kernel.appointment.revoked.v1",
        "Appointment",
        appointment.id,
        { appointmentId: appointment.id, status: target },
        this.context(context),
      );
      await this.bumpCacheVersion(
        `kernel:authorities-version:${appointment.organizationId}:v1`,
      );
    }
    await this.authorization.invalidate(open[0].membership.personId);
  }
  membershipHistory(id: string) {
    return this.prisma.membershipTransition.findMany({
      where: { membershipId: id },
      orderBy: { effectiveAt: "asc" },
    });
  }
  personMemberships(personId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { personId },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // Periods
  async createPeriod(
    organizationId: string,
    input: any,
    context?: CommandContext,
  ) {
    input = allowInput("createPeriod", input);
    const start = this.date(input.startDate)!;
    const end = this.date(input.endDate)!;
    assertRotaryPeriod(start, end);
    return this.mutate(
      "CreatePeriod",
      context,
      { organizationId, input },
      { type: "InstitutionalPeriod", id: "pending", organizationId },
      async (tx) => {
        const period = await tx.institutionalPeriod.create({
          data: { ...input, organizationId, startDate: start, endDate: end },
        });
        await this.outbox.record(
          tx,
          "kernel.period.created.v1",
          "InstitutionalPeriod",
          period.id,
          { periodId: period.id, organizationId },
          this.context(context),
        );
        return period;
      },
    );
  }
  listPeriods(organizationId: string) {
    return this.prisma.institutionalPeriod.findMany({
      where: { organizationId },
      orderBy: { sequence: "desc" },
    });
  }
  async currentPeriod(organizationId: string) {
    const version = await this.cacheVersion(
      `kernel:current-period-version:${organizationId}:v1`,
    );
    return this.cached(
      `kernel:current-period:${organizationId}:${version}`,
      30,
      () =>
        this.prisma.institutionalPeriod.findFirst({
          where: { organizationId, status: "ACTIVE" },
          orderBy: { sequence: "desc" },
        }),
    );
  }
  getPeriod(id: string) {
    return this.prisma.institutionalPeriod.findUniqueOrThrow({ where: { id } });
  }
  async updatePeriod(id: string, input: any, context?: CommandContext) {
    input = allowInput("updatePeriod", input);
    return this.mutate(
      "UpdateDraftPeriod",
      context,
      { id, input },
      { type: "InstitutionalPeriod", id },
      async (tx) => {
        const period = await tx.institutionalPeriod.findUniqueOrThrow({
          where: { id },
        });
        if (period.status !== "DRAFT")
          throw new ConflictException("Only draft periods can be updated");
        const start = input.startDate
          ? this.date(input.startDate)!
          : period.startDate;
        const end = input.endDate ? this.date(input.endDate)! : period.endDate;
        assertRotaryPeriod(start, end);
        return tx.institutionalPeriod.update({
          where: { id },
          data: { ...input, startDate: start, endDate: end },
        });
      },
    );
  }
  transitionPeriod(id: string, target: PeriodStatus, context?: CommandContext) {
    const events: Record<string, string> = {
      SCHEDULED: "kernel.period.scheduled.v1",
      ACTIVE: "kernel.period.activated.v1",
      CLOSED: "kernel.period.closed.v1",
      CANCELLED: "kernel.period.cancelled.v1",
    };
    return this.mutate(
      `${target}Period`,
      context,
      { id, target },
      {
        type: "InstitutionalPeriod",
        id,
        event: events[target],
        payload: { periodId: id, status: target },
      },
      async (tx) => {
        const period = await tx.institutionalPeriod.findUniqueOrThrow({
          where: { id },
        });
        periodStateMachine.assertTransition(period.status, target);
        if (target === "ACTIVE") {
          const active = await tx.institutionalPeriod.findFirst({
            where: {
              organizationId: period.organizationId,
              status: "ACTIVE",
              id: { not: id },
            },
          });
          if (active)
            throw new ConflictException(
              "Only one active period is allowed per organization",
            );
        }
        if (target === "CLOSED") {
          await tx.appointment.updateMany({
            where: { periodId: id, status: "ACTIVE" },
            data: { status: "ENDED", endedAt: new Date() },
          });
          const revoked = await tx.roleAssignment.findMany({
            where: { sourceAppointment: { periodId: id }, revokedAt: null },
            select: { personId: true },
          });
          await tx.roleAssignment.updateMany({
            where: { sourceAppointment: { periodId: id }, revokedAt: null },
            data: {
              revokedAt: new Date(),
              revokedById: this.context(context).actor.id,
            },
          });
          // 15.3: closing a period bulk-revokes RoleAssignments; every
          // affected person's cached authorization must be invalidated too.
          for (const personId of new Set(revoked.map((r) => r.personId)))
            await this.authorization.invalidate(personId);
        }
        const updated = await tx.institutionalPeriod.update({
          where: { id },
          data: {
            status: target,
            closedAt: target === "CLOSED" ? new Date() : null,
          },
        });
        if (target === "ACTIVE" || target === "CLOSED") {
          await this.bumpCacheVersion(
            `kernel:current-period-version:${period.organizationId}:v1`,
          );
          await this.bumpCacheVersion(
            `kernel:authorities-version:${period.organizationId}:v1`,
          );
        }
        return updated;
      },
    );
  }

  // Position definitions and appointments
  createPosition(input: any, context?: CommandContext) {
    input = allowInput("createPosition", input);
    // `grantsPermissions` is not a column: it asks for a technical role of
    // the position's own, created here, so a district (or a club) can build
    // a position that grants permissions without a platform-wide
    // `kernel.role.manage` grant.
    const { grantsPermissions, ...data } = input;
    return this.mutate(
      "CreatePositionDefinition",
      context,
      input,
      { type: "PositionDefinition", id: "pending" },
      async (tx) => {
        let ownerType: string | undefined;
        if (data.ownerOrganizationId) {
          const owner = await tx.organization.findUniqueOrThrow({
            where: { id: data.ownerOrganizationId },
          });
          ownerType = owner.type;
          if (data.organizationType === "DISTRICT" && owner.type !== "DISTRICT")
            throw new BadRequestException(
              "District catalogs must be owned by districts",
            );
          // A club can only define positions for itself, never district or
          // other-type positions.
          if (owner.type === "CLUB" && data.organizationType !== "CLUB")
            throw new BadRequestException(
              "A club can only define club positions",
            );
        }
        if (grantsPermissions === true) {
          if (!data.ownerOrganizationId)
            throw new BadRequestException(
              "grantsPermissions needs an owner organization",
            );
          if (data.defaultRoleCode && data.defaultRoleCode !== data.code)
            throw new BadRequestException(
              "grantsPermissions creates the position's own role: leave defaultRoleCode empty",
            );
          data.defaultRoleCode = await this.createPositionRole(
            tx,
            data.code,
            data.name,
            data.description,
          );
        } else {
          await this.assertPositionRole(tx, ownerType, data.defaultRoleCode);
        }
        const position = await tx.positionDefinition.create({ data });
        await this.outbox.record(
          tx,
          "kernel.position.created.v1",
          "PositionDefinition",
          position.id,
          { positionDefinitionId: position.id },
          this.context(context),
        );
        return position;
      },
    );
  }
  listPositions(query: any = {}) {
    return this.prisma.positionDefinition.findMany({
      where: {
        organizationType: query.organizationType,
        ownerOrganizationId: query.ownerOrganizationId,
      },
      orderBy: { code: "asc" },
    });
  }
  updatePosition(id: string, input: any, context?: CommandContext) {
    input = allowInput("updatePosition", input);
    const { grantsPermissions, ...data } = input;
    return this.mutate(
      "UpdatePositionDefinition",
      context,
      { id, input },
      {
        type: "PositionDefinition",
        id,
        event: "kernel.position.updated.v1",
        payload: { positionDefinitionId: id },
      },
      async (tx) => {
        const position = await tx.positionDefinition.findUniqueOrThrow({
          where: { id },
          include: { ownerOrganization: { select: { type: true } } },
        });
        if (grantsPermissions === true) {
          // Turn an informational position into one that grants
          // permissions: it gets a role of its own (never a shared one).
          if (position.defaultRoleCode)
            throw new ConflictException(
              "This position already derives a technical role",
            );
          if (!position.ownerOrganizationId)
            throw new BadRequestException(
              "grantsPermissions needs an owner organization",
            );
          if (data.defaultRoleCode !== undefined)
            throw new BadRequestException(
              "grantsPermissions creates the position's own role: leave defaultRoleCode empty",
            );
          data.defaultRoleCode = await this.createPositionRole(
            tx,
            position.code,
            data.name ?? position.name,
            data.description ?? position.description,
          );
        } else if (data.defaultRoleCode !== undefined) {
          await this.assertPositionRole(
            tx,
            position.ownerOrganization?.type,
            data.defaultRoleCode,
          );
        }
        const updated = await tx.positionDefinition.update({
          where: { id },
          data,
        });
        if (
          data.defaultRoleCode !== undefined &&
          data.defaultRoleCode !== position.defaultRoleCode
        )
          await this.resyncPositionRoleAssignments(
            tx,
            updated.id,
            updated.defaultRoleCode,
            context,
          );
        return updated;
      },
    );
  }
  /**
   * The role of a permission-granting position: same code as the position,
   * never a system role, so editing its permissions only affects this
   * position. A taken code is a conflict (it would be shared).
   */
  private async createPositionRole(
    tx: any,
    code: string,
    name: string,
    description?: string | null,
  ): Promise<string> {
    const taken = await tx.roleDefinition.findUnique({ where: { code } });
    if (taken)
      throw new ConflictException(
        "A role with this position's code already exists",
      );
    await tx.roleDefinition.create({
      data: { code, name, description: description ?? null, isSystem: false },
    });
    return code;
  }
  /**
   * The derived roles of a position's ACTIVE appointments follow its
   * defaultRoleCode: when the role changes after people were appointed, the
   * old derived assignments are revoked and the new role is granted with
   * the same scope activation would have used. Without this, a role added
   * later would never reach the people already in the position.
   */
  private async resyncPositionRoleAssignments(
    tx: any,
    positionDefinitionId: string,
    roleCode: string | null,
    context?: CommandContext,
  ): Promise<void> {
    const appointments = await tx.appointment.findMany({
      where: { positionDefinitionId, status: "ACTIVE" },
      include: {
        membership: { select: { personId: true } },
        positionDefinition: { select: { organizationType: true } },
      },
    });
    if (!appointments.length) return;
    const role = roleCode
      ? await tx.roleDefinition.findUnique({ where: { code: roleCode } })
      : null;
    const now = new Date();
    const actorId = this.context(context).actor.id;
    for (const appointment of appointments) {
      await tx.roleAssignment.updateMany({
        where: {
          sourceAppointmentId: appointment.id,
          revokedAt: null,
          ...(role ? { roleDefinitionId: { not: role.id } } : {}),
        },
        data: { revokedAt: now, revokedById: actorId },
      });
      if (role) {
        const existing = await tx.roleAssignment.findFirst({
          where: {
            sourceAppointmentId: appointment.id,
            roleDefinitionId: role.id,
            revokedAt: null,
          },
        });
        if (!existing)
          await tx.roleAssignment.create({
            data: {
              personId: appointment.membership.personId,
              roleDefinitionId: role.id,
              scopeType:
                appointment.positionDefinition.organizationType === "DISTRICT"
                  ? "ORGANIZATION_TREE"
                  : "ORGANIZATION",
              organizationId: appointment.organizationId,
              periodId: appointment.periodId,
              sourceAppointmentId: appointment.id,
              grantedById: actorId,
            },
          });
      }
      await this.authorization.invalidate(appointment.membership.personId);
    }
  }
  /**
   * A position owned by a club may only derive a role of its own: binding
   * it to a system role (CLUB_PRESIDENT, DISTRICT_RDR…) would let the club
   * hand out — or, via position permissions, rewrite — a role every other
   * club and the district also rely on.
   */
  private async assertPositionRole(
    tx: any,
    ownerType: string | undefined,
    roleCode?: string | null,
  ): Promise<void> {
    if (!roleCode) return;
    // Any owner: a position must never point at a role that doesn't exist
    // (permissions could not be attached and appointments would grant
    // nothing, silently).
    const role = await tx.roleDefinition.findUnique({
      where: { code: roleCode },
      select: { isSystem: true },
    });
    if (!role) throw new BadRequestException("Unknown role");
    if (ownerType === "CLUB" && role.isSystem)
      throw new ForbiddenException(
        "Club positions cannot derive a system role",
      );
  }
  /** What a position currently allows: the permissions of its derived role. */
  async positionPermissions(id: string) {
    const position = await this.prisma.positionDefinition.findUniqueOrThrow({
      where: { id },
      select: { defaultRoleCode: true },
    });
    if (!position.defaultRoleCode) return [];
    const links = await this.prisma.rolePermission.findMany({
      where: { roleDefinition: { code: position.defaultRoleCode } },
      include: { permissionDefinition: true },
    });
    return links
      .map((link) => link.permissionDefinition)
      .sort((a, b) => a.code.localeCompare(b.code));
  }
  async positionPermission(
    id: string,
    permissionId: string,
    attach: boolean,
    context?: CommandContext,
  ) {
    return this.mutate(
      attach ? "AttachPermissionToPosition" : "DetachPermissionFromPosition",
      context,
      { id, permissionId },
      {
        type: "PositionDefinition",
        id,
        event: "kernel.position.permissions-changed.v1",
        payload: { positionDefinitionId: id, permissionId, attached: attach },
      },
      async (tx) => {
        const position = await tx.positionDefinition.findUniqueOrThrow({
          where: { id },
        });
        if (!position.defaultRoleCode)
          // 6.6.1.5: no technical role to modify is a conflict, not a
          // malformed request.
          throw new ConflictException(
            "Position does not derive a technical role",
          );
        const role = await tx.roleDefinition.findUniqueOrThrow({
          where: { code: position.defaultRoleCode },
        });
        // Editing a position's permissions edits its role for everyone who
        // holds it. That is only coherent when every position deriving the
        // role has the same owner (e.g. the district catalog defining what
        // every club president can do), never across owners.
        const otherOwners = await tx.positionDefinition.count({
          where: {
            id: { not: position.id },
            defaultRoleCode: position.defaultRoleCode,
            // Explicit OR: `NOT { owner: X }` alone would skip NULL owners.
            OR: position.ownerOrganizationId
              ? [
                  { ownerOrganizationId: null },
                  {
                    ownerOrganizationId: { not: position.ownerOrganizationId },
                  },
                ]
              : [{ ownerOrganizationId: { not: null } }],
          },
        });
        if (otherOwners > 0)
          throw new ConflictException(
            "This role is shared with positions of another organization",
          );
        if (attach && position.ownerOrganizationId) {
          const [owner, permission] = await Promise.all([
            tx.organization.findUniqueOrThrow({
              where: { id: position.ownerOrganizationId },
              select: { type: true },
            }),
            tx.permissionDefinition.findUniqueOrThrow({
              where: { id: permissionId },
              select: { code: true },
            }),
          ]);
          if (
            owner.type === "CLUB" &&
            DISTRICT_ONLY_PERMISSIONS.has(permission.code)
          )
            throw new ForbiddenException(
              "This permission can only be granted by the district",
            );
        }
        const result = attach
          ? await tx.rolePermission.upsert({
              where: {
                roleDefinitionId_permissionDefinitionId: {
                  roleDefinitionId: role.id,
                  permissionDefinitionId: permissionId,
                },
              },
              create: {
                roleDefinitionId: role.id,
                permissionDefinitionId: permissionId,
              },
              update: {},
            })
          : await tx.rolePermission
              .delete({
                where: {
                  roleDefinitionId_permissionDefinitionId: {
                    roleDefinitionId: role.id,
                    permissionDefinitionId: permissionId,
                  },
                },
              })
              .then(() => ({ detached: true }));
        await this.invalidateRoleHolders(tx, role.id);
        return result;
      },
    );
  }
  async createAppointment(
    organizationId: string,
    input: any,
    context?: CommandContext,
  ) {
    return this.mutate(
      "CreateAppointment",
      context,
      { organizationId, input },
      { type: "Appointment", id: "pending", organizationId },
      async (tx) => {
        const [membership, period, position] = await Promise.all([
          tx.organizationMembership.findUnique({
            where: { id: input.membershipId },
            include: { organization: true, person: true },
          }),
          tx.institutionalPeriod.findUnique({ where: { id: input.periodId } }),
          tx.positionDefinition.findUnique({
            where: { id: input.positionDefinitionId },
          }),
        ]);
        if (
          !membership ||
          !period ||
          !position ||
          period.organizationId !== organizationId
        )
          throw new BadRequestException("Invalid appointment references");
        assertActiveMembership(membership.status);
        assertNonArchived(membership.person.archivedAt);
        const descendants = await this.descendantsIn(tx, organizationId);
        assertDistrictMembership(
          position.organizationType,
          organizationId,
          membership.organizationId,
          membership.organization.type,
          descendants.includes(membership.organizationId),
        );
        // 6.6.12: startsAt/endsAt materialize to the period's own bounds
        // when the caller omits them, so the appointment always has a
        // concrete lifetime to validate at activation time.
        const startsAt = this.date(input.startsAt) ?? period.startDate;
        const endsAt = this.date(input.endsAt) ?? period.endDate;
        assertDateRange(startsAt, endsAt);
        const appointment = await tx.appointment.create({
          data: {
            organizationId,
            membershipId: input.membershipId,
            periodId: input.periodId,
            positionDefinitionId: input.positionDefinitionId,
            startsAt,
            endsAt,
            createdById: this.context(context).actor.id,
          },
        });
        await this.outbox.record(
          tx,
          "kernel.appointment.created.v1",
          "Appointment",
          appointment.id,
          {
            appointmentId: appointment.id,
            organizationId,
            periodId: period.id,
          },
          this.context(context),
        );
        return appointment;
      },
    );
  }
  listAppointments(organizationId: string, query: any = {}) {
    return this.prisma.appointment.findMany({
      where: {
        organizationId,
        periodId: query.periodId,
        membershipId: query.membershipId,
        status: query.status,
        positionDefinition: query.positionCode
          ? { code: query.positionCode }
          : undefined,
      },
      include: {
        membership: { include: { person: true } },
        positionDefinition: true,
        period: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }
  getAppointment(id: string) {
    return this.prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: {
        membership: { include: { person: true } },
        positionDefinition: true,
        period: true,
      },
    });
  }
  async currentAuthorities(organizationId: string) {
    const version = await this.cacheVersion(
      `kernel:authorities-version:${organizationId}:v1`,
    );
    return this.cached(
      `kernel:authorities:${organizationId}:current:${version}`,
      30,
      () =>
        this.prisma.appointment.findMany({
          where: { organizationId, status: "ACTIVE" },
          include: {
            membership: { include: { person: true } },
            positionDefinition: true,
            period: true,
          },
        }),
    );
  }
  transitionAppointment(
    id: string,
    target: AppointmentStatus,
    input: any = {},
    context?: CommandContext,
  ) {
    const events: Record<string, string> = {
      ELECTED: "kernel.appointment.elected.v1",
      ACTIVE: "kernel.appointment.activated.v1",
      ENDED: "kernel.appointment.ended.v1",
      REVOKED: "kernel.appointment.revoked.v1",
    };
    return this.mutate(
      `${target}Appointment`,
      context,
      { id, target, input },
      {
        type: "Appointment",
        id,
        event: events[target],
        payload: { appointmentId: id, status: target },
      },
      async (tx) => {
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id },
          include: { period: true, positionDefinition: true, membership: true },
        });
        appointmentStateMachine.assertTransition(appointment.status, target);
        if (target === "ACTIVE") {
          // 6.6.1: the enabling membership must still be ACTIVE at
          // activation time, not only when the appointment was created.
          assertActiveMembership(appointment.membership.status);
          if (appointment.period.status !== "ACTIVE")
            throw new ConflictException("Appointment period is not active");
          if (appointment.startsAt && appointment.startsAt > new Date())
            throw new ConflictException("Appointment has not started");
          // 6.6.12: the effective lifetime must stay within the period's
          // own bounds even if the period was edited after the appointment
          // was created.
          if (
            appointment.startsAt &&
            (appointment.startsAt < appointment.period.startDate ||
              appointment.startsAt > appointment.period.endDate)
          )
            throw new ConflictException(
              "Appointment start date is outside the period bounds",
            );
          if (
            appointment.endsAt &&
            (appointment.endsAt < appointment.period.startDate ||
              appointment.endsAt > appointment.period.endDate)
          )
            throw new ConflictException(
              "Appointment end date is outside the period bounds",
            );
          if (appointment.positionDefinition.isSingletonPerPeriod) {
            const existing = await tx.appointment.findFirst({
              where: {
                organizationId: appointment.organizationId,
                periodId: appointment.periodId,
                positionDefinitionId: appointment.positionDefinitionId,
                status: "ACTIVE",
                id: { not: id },
              },
            });
            if (existing)
              throw new ConflictException(
                "Singleton position already occupied",
              );
          }
        }
        const now = new Date();
        const updated = await tx.appointment.update({
          where: { id },
          data: {
            status: target,
            activatedAt: target === "ACTIVE" ? now : appointment.activatedAt,
            endedAt: target === "ENDED" ? now : appointment.endedAt,
            revokedAt: target === "REVOKED" ? now : appointment.revokedAt,
            revokedById:
              target === "REVOKED"
                ? this.context(context).actor.id
                : appointment.revokedById,
            revokeReason:
              target === "REVOKED" ? input.reason : appointment.revokeReason,
          },
        });
        if (
          target === "ACTIVE" &&
          appointment.positionDefinition.defaultRoleCode
        ) {
          const role = await tx.roleDefinition.findUnique({
            where: { code: appointment.positionDefinition.defaultRoleCode },
          });
          if (role)
            await tx.roleAssignment.create({
              data: {
                personId: appointment.membership.personId,
                roleDefinitionId: role.id,
                scopeType:
                  appointment.positionDefinition.organizationType === "DISTRICT"
                    ? "ORGANIZATION_TREE"
                    : "ORGANIZATION",
                organizationId: appointment.organizationId,
                periodId: appointment.periodId,
                sourceAppointmentId: id,
                grantedById: this.context(context).actor.id,
              },
            });
        }
        if (["ENDED", "REVOKED"].includes(target))
          await tx.roleAssignment.updateMany({
            where: { sourceAppointmentId: id, revokedAt: null },
            data: {
              revokedAt: now,
              revokedById: this.context(context).actor.id,
            },
          });
        // 15.3: any RoleAssignment created or revoked by this transition
        // must invalidate the actor's cached authorization decisions, and
        // activating/ending/revoking an appointment changes the cached
        // "current authorities" for its organization.
        await this.authorization.invalidate(appointment.membership.personId);
        await this.bumpCacheVersion(
          `kernel:authorities-version:${appointment.organizationId}:v1`,
        );
        return updated;
      },
    );
  }

  // Authorization catalog and assignments
  listPermissions() {
    return this.prisma.permissionDefinition.findMany({
      orderBy: { code: "asc" },
    });
  }
  createPermission(input: any, context?: CommandContext) {
    input = allowInput("createPermission", input);
    return this.mutate(
      "RegisterPermission",
      context,
      input,
      {
        type: "PermissionDefinition",
        id: "pending",
        event: "kernel.permissions.changed.v1",
        payload: {
          permissionCode: input.code,
          namespace: input.namespace,
          moduleId: input.moduleId ?? null,
        },
      },
      (tx) => {
        this.assertPermissionCode(input.code, input.namespace, input.moduleId);
        return tx.permissionDefinition.create({ data: input });
      },
    );
  }
  private assertPermissionCode(
    code: string,
    namespace: string,
    moduleId?: string | null,
  ): void {
    // 6.7.1: permissions use <namespace>.<resource>.<action>, optionally
    // with further qualifiers (e.g. "kernel.application.create.self").
    if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2,}$/.test(code ?? ""))
      throw new BadRequestException(
        "Permission code must use <namespace>.<resource>.<action>",
      );
    if (!code.startsWith(`${namespace}.`))
      throw new BadRequestException(
        "Permission code must start with its own namespace",
      );
    // 6.7.9: a module can only register permissions within its own
    // namespace — the namespace must be the module's own id.
    if (moduleId && namespace !== moduleId)
      throw new BadRequestException(
        "A module can only register permissions within its own namespace",
      );
  }
  listRoles() {
    return this.prisma.roleDefinition.findMany({
      include: { permissions: { include: { permissionDefinition: true } } },
      orderBy: { code: "asc" },
    });
  }
  createRole(input: any, context?: CommandContext) {
    input = allowInput("createRole", input);
    return this.mutate(
      "CreateRole",
      context,
      input,
      { type: "RoleDefinition", id: "pending" },
      async (tx) => {
        const role = await tx.roleDefinition.create({ data: input });
        await this.outbox.record(
          tx,
          "kernel.role.created.v1",
          "RoleDefinition",
          role.id,
          { roleId: role.id },
          this.context(context),
        );
        return role;
      },
    );
  }
  async rolePermission(
    roleId: string,
    permissionId: string,
    attach: boolean,
    context?: CommandContext,
  ) {
    const role = await this.prisma.roleDefinition.findUniqueOrThrow({
      where: { id: roleId },
      select: { code: true },
    });
    return this.mutate(
      attach ? "AttachPermissionToRole" : "DetachPermissionFromRole",
      context,
      { roleId, permissionId },
      {
        type: "RoleDefinition",
        id: roleId,
        event: "kernel.role.updated.v1",
        payload: {
          roleDefinitionId: roleId,
          code: role.code,
          permissionId,
          attached: attach,
        },
      },
      async (tx) => {
        const result = attach
          ? await tx.rolePermission.upsert({
              where: {
                roleDefinitionId_permissionDefinitionId: {
                  roleDefinitionId: roleId,
                  permissionDefinitionId: permissionId,
                },
              },
              create: {
                roleDefinitionId: roleId,
                permissionDefinitionId: permissionId,
              },
              update: {},
            })
          : await tx.rolePermission.delete({
              where: {
                roleDefinitionId_permissionDefinitionId: {
                  roleDefinitionId: roleId,
                  permissionDefinitionId: permissionId,
                },
              },
            });
        // 15.3: every person currently holding this role is affected by
        // its permission set changing.
        await this.invalidateRoleHolders(tx, roleId);
        return result;
      },
    );
  }
  private async invalidateRoleHolders(
    tx: Prisma.TransactionClient,
    roleDefinitionId: string,
  ): Promise<void> {
    const holders = await tx.roleAssignment.findMany({
      where: { roleDefinitionId, revokedAt: null },
      select: { personId: true },
    });
    for (const personId of new Set(holders.map((holder) => holder.personId)))
      await this.authorization.invalidate(personId);
  }
  async grantRole(input: any, context?: CommandContext) {
    input = allowInput("grantRole", input);
    return this.mutate(
      "GrantRole",
      context,
      input,
      {
        type: "RoleAssignment",
        id: "pending",
        organizationId: input.organizationId,
      },
      async (tx) => {
        assertScope(input.scopeType, input.organizationId);
        if (input.scopeType === "PLATFORM") {
          // 6.7.7: PLATFORM scope is reserved for roles the platform has
          // expressly authorized for it (its own system-seeded roles), not
          // arbitrary or module-registered roles.
          const role = await tx.roleDefinition.findUniqueOrThrow({
            where: { id: input.roleDefinitionId },
            select: { isSystem: true },
          });
          if (!role.isSystem)
            throw new ForbiddenException(
              "Only platform-authorized roles can be granted PLATFORM scope",
            );
        }
        if (input.validUntil)
          assertDateRange(
            new Date(input.validFrom ?? new Date()),
            new Date(input.validUntil),
          );
        const assignment = await tx.roleAssignment.create({
          data: {
            ...input,
            effect: input.effect ?? AssignmentEffect.ALLOW,
            validFrom: this.date(input.validFrom) ?? new Date(),
            validUntil: this.date(input.validUntil),
            grantedById: this.context(context).actor.id,
          },
        });
        await this.outbox.record(
          tx,
          "kernel.role-assignment.granted.v1",
          "RoleAssignment",
          assignment.id,
          { assignmentId: assignment.id, personId: assignment.personId },
          this.context(context),
        );
        await this.authorization.invalidate(assignment.personId);
        return assignment;
      },
    );
  }
  revokeRole(id: string, context?: CommandContext) {
    return this.mutate(
      "RevokeRole",
      context,
      { id },
      {
        type: "RoleAssignment",
        id,
        event: "kernel.role-assignment.revoked.v1",
        payload: { assignmentId: id },
      },
      async (tx) => {
        const assignment = await tx.roleAssignment.update({
          where: { id },
          data: {
            revokedAt: new Date(),
            revokedById: this.context(context).actor.id,
          },
        });
        await this.authorization.invalidate(assignment.personId);
        return assignment;
      },
    );
  }
  listRoleAssignments(query: any = {}) {
    return this.prisma.roleAssignment.findMany({
      where: {
        personId: query.personId,
        organizationId: query.organizationId,
        roleDefinitionId: query.roleId,
        revokedAt: query.includeRevoked ? undefined : null,
      },
      include: { roleDefinition: true, person: true },
      orderBy: { createdAt: "desc" },
    });
  }
  checkAuthorization(input: any) {
    return this.authorization.check({
      personId: input.subjectId ?? input.personId,
      permissionCode: input.permission ?? input.permissionCode,
      organizationId: input.scope?.organizationId ?? input.organizationId,
      periodId: input.periodId,
    });
  }
  batchCheckAuthorization(input: any) {
    const checks = (input.checks ?? []).slice(0, 100);
    return Promise.all(
      checks.map((item: any) => this.checkAuthorization(item)),
    );
  }
  effectivePermissions(personId: string, query: any = {}) {
    return this.authorization.effectivePermissions(
      personId,
      query.organizationId,
      query.periodId,
    );
  }

  // Membership applications and transfers
  async createApplication(input: any, context?: CommandContext) {
    // `CreateMembershipApplicationRequest` deliberately has no personId:
    // a self-service request always belongs to the authenticated person.
    // Keeping this binding here (rather than trusting HTTP input) also makes
    // the invariant hold for any future adapter.
    const requesterPersonId =
      context?.actor.type === "USER"
        ? context.actor.id
        : input.requesterPersonId;
    if (!requesterPersonId)
      throw new BadRequestException(
        "A membership application requires an authenticated requester",
      );
    return this.mutate(
      "CreateMembershipApplication",
      context,
      { organizationId: input.organizationId, message: input.message },
      {
        type: "MembershipApplication",
        id: "pending",
        organizationId: input.organizationId,
      },
      async (tx) => {
        // Self-service onboarding is intentionally club-only. District
        // authority is granted through an appointment, never through an
        // artificial district membership (§6.6.3).
        const organization = await tx.organization.findUnique({
          where: { id: input.organizationId },
          select: { id: true, type: true, status: true },
        });
        if (!organization || organization.status !== "ACTIVE")
          throw new BadRequestException("Only active clubs accept requests");
        if (organization.type !== "CLUB")
          throw new BadRequestException(
            "Membership applications are submitted to a club",
          );
        // 6.8.2: a person already ACTIVE in the organization cannot open a
        // new application for it.
        const activeMembership = await tx.organizationMembership.findUnique({
          where: {
            organizationId_personId: {
              organizationId: input.organizationId,
              personId: requesterPersonId,
            },
          },
        });
        if (activeMembership?.status === "ACTIVE")
          throw new ConflictException(
            "Person already has an active membership in this organization",
          );
        const openApplication = await tx.membershipApplication.findFirst({
          where: {
            organizationId: input.organizationId,
            requesterPersonId,
            status: { in: ["DRAFT", "SUBMITTED"] },
          },
          select: { id: true },
        });
        if (openApplication)
          throw new ConflictException(
            "Person already has an open membership application for this club",
          );
        return tx.membershipApplication.create({
          data: {
            organizationId: input.organizationId,
            requesterPersonId,
            message: input.message?.trim() || null,
            expiresAt: this.date(input.expiresAt),
          },
        });
      },
    );
  }
  listApplications(query: any = {}) {
    return this.prisma.membershipApplication.findMany({
      where: {
        organizationId: query.organizationId,
        requesterPersonId: query.personId,
        status: query.status,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  getApplication(id: string) {
    return this.prisma.membershipApplication.findUniqueOrThrow({
      where: { id },
    });
  }
  transitionApplication(
    id: string,
    target: any,
    input: any = {},
    context?: CommandContext,
  ) {
    const events: Record<string, string> = {
      SUBMITTED: "kernel.membership-application.submitted.v1",
      APPROVED: "kernel.membership-application.approved.v1",
      REJECTED: "kernel.membership-application.rejected.v1",
      CANCELLED: "kernel.membership-application.cancelled.v1",
    };
    return this.mutate(
      `${target}MembershipApplication`,
      context,
      { id, target, input },
      { type: "MembershipApplication", id },
      async (tx) => {
        const application = await tx.membershipApplication.findUniqueOrThrow({
          where: { id },
        });
        applicationStateMachine.assertTransition(application.status, target);
        if (target === "REJECTED" && !input.rejectionReason && !input.reason)
          throw new BadRequestException("A rejection reason is required");
        let membershipId = application.membershipId;
        const now = new Date();
        if (target === "APPROVED") {
          const existingMembership = await tx.organizationMembership.findUnique(
            {
              where: {
                organizationId_personId: {
                  organizationId: application.organizationId,
                  personId: application.requesterPersonId,
                },
              },
            },
          );
          if (existingMembership?.status === "ACTIVE")
            throw new ConflictException(
              "Person already has an active membership in this club",
            );

          const membership = existingMembership
            ? await tx.organizationMembership.update({
                where: { id: existingMembership.id },
                data: {
                  status: "ACTIVE",
                  statusChangedAt: now,
                  joinedAt: existingMembership.joinedAt ?? now,
                  endedAt: null,
                },
              })
            : await tx.organizationMembership.create({
                data: {
                  organizationId: application.organizationId,
                  personId: application.requesterPersonId,
                  status: "ACTIVE",
                  joinedAt: now,
                },
              });
          await this.syncMemberRole(tx, membership.id, context);
          await tx.membershipTransition.create({
            data: {
              membershipId: membership.id,
              type: existingMembership
                ? existingMembership.status === "PENDING"
                  ? MembershipTransitionType.ACTIVATED
                  : MembershipTransitionType.REACTIVATED
                : MembershipTransitionType.CREATED,
              fromStatus: existingMembership?.status,
              toStatus: MembershipStatus.ACTIVE,
              effectiveAt: now,
              performedById: this.context(context).actor.id,
              commandId: this.context(context).commandId,
              reasonCode: "MEMBERSHIP_APPLICATION_APPROVED",
            },
          });
          membershipId = membership.id;
        }
        const updated = await tx.membershipApplication.update({
          where: { id },
          data: {
            status: target,
            submittedAt: target === "SUBMITTED" ? now : application.submittedAt,
            reviewedAt: ["APPROVED", "REJECTED"].includes(target)
              ? now
              : application.reviewedAt,
            reviewedById: ["APPROVED", "REJECTED"].includes(target)
              ? this.context(context).actor.id
              : application.reviewedById,
            rejectionReason:
              target === "REJECTED"
                ? (input.rejectionReason ?? input.reason)
                : application.rejectionReason,
            membershipId,
          },
        });
        // The Notifications module consumes exactly these contractual events.
        // Kernel deliberately records them in the transactional Outbox instead
        // of sending mail from this command, so an approved request can never
        // be persisted without a durable notification intent.
        const payload: Record<string, string> = {
          applicationId: id,
          organizationId: application.organizationId,
          requesterPersonId: application.requesterPersonId,
        };
        if (target === "APPROVED") {
          payload.membershipId = membershipId!;
          payload.reviewedById = this.context(context).actor.id ?? "system";
        }
        if (target === "REJECTED") {
          payload.reviewedById = this.context(context).actor.id ?? "system";
          payload.rejectionReason = input.rejectionReason ?? input.reason;
        }
        const event = events[target];
        if (event)
          await this.outbox.record(
            tx,
            event,
            "MembershipApplication",
            id,
            payload,
            this.context(context),
            application.organizationId,
          );
        return updated;
      },
    );
  }
  async requestTransfer(input: any, context?: CommandContext) {
    return this.mutate(
      "RequestMembershipTransfer",
      context,
      input,
      { type: "MembershipTransfer", id: "pending" },
      async (tx) => {
        const membership = await tx.organizationMembership.findUniqueOrThrow({
          where: { id: input.membershipId },
        });
        assertActiveMembership(membership.status);
        if (membership.organizationId === input.toOrganizationId)
          throw new BadRequestException(
            "Transfer destination must differ from origin",
          );
        const transfer = await tx.membershipTransfer.create({
          data: {
            membershipId: membership.id,
            fromOrganizationId: membership.organizationId,
            toOrganizationId: input.toOrganizationId,
            requestedById:
              input.requestedById ?? this.context(context).actor.id!,
            reason: input.reason,
            expiresAt: this.date(input.expiresAt),
          },
        });
        await this.outbox.record(
          tx,
          "kernel.membership-transfer.requested.v1",
          "MembershipTransfer",
          transfer.id,
          { transferId: transfer.id, membershipId: membership.id },
          this.context(context),
        );
        return transfer;
      },
    );
  }
  listTransfers(query: any = {}) {
    return this.prisma.membershipTransfer.findMany({
      where: {
        membershipId: query.membershipId,
        fromOrganizationId: query.fromOrganizationId,
        toOrganizationId: query.toOrganizationId,
        status: query.status,
        requestedById: query.requestedById,
      },
      orderBy: { requestedAt: "desc" },
    });
  }
  getTransfer(id: string) {
    return this.prisma.membershipTransfer.findUniqueOrThrow({ where: { id } });
  }
  transitionTransfer(
    id: string,
    target: TransferStatus,
    input: any = {},
    context?: CommandContext,
  ) {
    const events: Record<string, string> = {
      ACCEPTED_BY_DESTINATION: "kernel.membership-transfer.accepted.v1",
      CONFIRMED_BY_ORIGIN: "kernel.membership-transfer.confirmed.v1",
      REJECTED: "kernel.membership-transfer.rejected.v1",
      CANCELLED: "kernel.membership-transfer.cancelled.v1",
    };
    return this.mutate(
      `${target}MembershipTransfer`,
      context,
      { id, target, input },
      {
        type: "MembershipTransfer",
        id,
        event: events[target],
        payload: { transferId: id, status: target },
      },
      async (tx) => {
        const transfer = await tx.membershipTransfer.findUniqueOrThrow({
          where: { id },
        });
        transferStateMachine.assertTransition(transfer.status, target);
        if (target === "COMPLETED")
          return this.completeTransferTx(tx, transfer, context);
        if (target === "REJECTED" && !input.reason && !input.rejectionReason)
          throw new BadRequestException("A rejection reason is required");
        const now = new Date();
        return tx.membershipTransfer.update({
          where: { id },
          data: {
            status: target,
            acceptedAt:
              target === "ACCEPTED_BY_DESTINATION" ? now : transfer.acceptedAt,
            acceptedById:
              target === "ACCEPTED_BY_DESTINATION"
                ? this.context(context).actor.id
                : transfer.acceptedById,
            confirmedAt:
              target === "CONFIRMED_BY_ORIGIN" ? now : transfer.confirmedAt,
            confirmedById:
              target === "CONFIRMED_BY_ORIGIN"
                ? this.context(context).actor.id
                : transfer.confirmedById,
            rejectedAt: target === "REJECTED" ? now : transfer.rejectedAt,
            rejectedById:
              target === "REJECTED"
                ? this.context(context).actor.id
                : transfer.rejectedById,
            rejectionReason:
              target === "REJECTED"
                ? (input.reason ?? input.rejectionReason)
                : transfer.rejectionReason,
            cancelledAt: target === "CANCELLED" ? now : transfer.cancelledAt,
            cancelledById:
              target === "CANCELLED"
                ? this.context(context).actor.id
                : transfer.cancelledById,
          },
        });
      },
    );
  }
  private async completeTransferTx(
    tx: Prisma.TransactionClient,
    transfer: any,
    context?: CommandContext,
  ): Promise<any> {
    const source = await tx.organizationMembership.findUniqueOrThrow({
      where: { id: transfer.membershipId },
    });
    const now = new Date();
    await tx.organizationMembership.update({
      where: { id: source.id },
      data: { status: "TRANSFERRED", statusChangedAt: now, endedAt: now },
    });
    await this.syncMemberRole(tx, source.id, context);
    await tx.membershipTransition.create({
      data: {
        membershipId: source.id,
        type: "TRANSFERRED_OUT",
        fromStatus: source.status,
        toStatus: "TRANSFERRED",
        effectiveAt: now,
        commandId: this.context(context).commandId,
      },
    });
    await this.closeAppointmentsOfMembership(tx, source.id, context);
    const destination = await tx.organizationMembership.upsert({
      where: {
        organizationId_personId: {
          organizationId: transfer.toOrganizationId,
          personId: source.personId,
        },
      },
      create: {
        organizationId: transfer.toOrganizationId,
        personId: source.personId,
        status: "ACTIVE",
        joinedAt: now,
      },
      update: {
        status: "ACTIVE",
        joinedAt: now,
        endedAt: null,
        statusChangedAt: now,
      },
    });
    await this.syncMemberRole(tx, destination.id, context);
    await tx.membershipTransition.create({
      data: {
        membershipId: destination.id,
        type: "TRANSFERRED_IN",
        toStatus: "ACTIVE",
        effectiveAt: now,
        commandId: this.context(context).commandId,
      },
    });
    const completed = await tx.membershipTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        destinationMembershipId: destination.id,
      },
    });
    await this.outbox.record(
      tx,
      "kernel.membership.transferred.v1",
      "MembershipTransfer",
      transfer.id,
      {
        transferId: transfer.id,
        membershipId: source.id,
        destinationMembershipId: destination.id,
      },
      this.context(context),
    );
    return completed;
  }

  // Modules (E8, docs/15-modules.md). A module is registered from its
  // manifest (mirotaract.module.json, contract v1) by the district (RDR)
  // or the platform, linked to the developer app that owns it. Its
  // permissions become PermissionDefinitions in its own namespace, which the
  // RDR assigns to positions like any other permission.
  private moduleError(
    code: string,
    message: string,
    errors: ValidationError[] = [],
  ): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, message, errors });
  }
  private assertValidManifest(manifest: unknown): ModuleManifest {
    const result = validateManifest(manifest, {
      knownEventTypes: SUBSCRIBABLE_EVENT_TYPES,
    });
    if (!result.ok)
      throw this.moduleError(
        "KERNEL_MODULE_MANIFEST_INVALID",
        `El manifiesto no es válido. ${summarizeErrors(result.errors)}`,
        result.errors,
      );
    return result.manifest;
  }
  private async modulePermissions(
    db: Prisma.TransactionClient | PrismaService,
    moduleIds: string[],
  ) {
    if (!moduleIds.length) return new Map<string, any[]>();
    const permissions = await db.permissionDefinition.findMany({
      where: { moduleId: { in: moduleIds } },
      orderBy: { code: "asc" },
    });
    const byModule = new Map<string, any[]>();
    for (const permission of permissions) {
      const list = byModule.get(permission.moduleId as string) ?? [];
      list.push(permission);
      byModule.set(permission.moduleId as string, list);
    }
    return byModule;
  }
  private async presentModules(
    db: Prisma.TransactionClient | PrismaService,
    modules: Array<{ id: string } & Record<string, any>>,
  ) {
    const permissions = await this.modulePermissions(
      db,
      modules.map((module) => module.id),
    );
    return modules.map((module) => ({
      ...module,
      permissions: permissions.get(module.id) ?? [],
    }));
  }
  /**
   * Creates, updates and removes the module's PermissionDefinitions so they
   * match its manifest. Removing a permission also removes it from every
   * position/role that had it; those people's cached decisions are
   * invalidated.
   */
  private async syncModulePermissions(
    tx: Prisma.TransactionClient,
    manifest: ModuleManifest,
  ): Promise<{ added: string[]; removed: string[] }> {
    const moduleId = manifest.id;
    const declared = new Map(
      manifest.permissions.map((permission) => [permission.code, permission]),
    );
    const existing = await tx.permissionDefinition.findMany({
      where: { code: { in: [...declared.keys()] } },
    });
    const foreign = existing.filter(
      (permission) => permission.moduleId !== moduleId,
    );
    if (foreign.length)
      throw new ConflictException({
        code: "KERNEL_MODULE_PERMISSION_TAKEN",
        message: `Ya existe un permiso con el código ${foreign
          .map((permission) => `«${permission.code}»`)
          .join(", ")} que no pertenece al módulo «${moduleId}».`,
      });
    const current = await tx.permissionDefinition.findMany({
      where: { moduleId },
    });
    const added: string[] = [];
    for (const permission of declared.values()) {
      const data = {
        namespace: moduleId,
        name: permission.name,
        description: permission.description ?? null,
        resourceType: permission.code.split(".")[1] ?? null,
        moduleId,
        isSystem: false,
      };
      const found = current.find((item) => item.code === permission.code);
      if (found)
        await tx.permissionDefinition.update({
          where: { id: found.id },
          data,
        });
      else {
        // Same invariant 6.7.1/6.7.9 checks as POST /permissions.
        this.assertPermissionCode(permission.code, moduleId, moduleId);
        await tx.permissionDefinition.create({
          data: { code: permission.code, ...data },
        });
        added.push(permission.code);
      }
    }
    const stale = current.filter((item) => !declared.has(item.code));
    const removed = stale.map((item) => item.code);
    if (stale.length) {
      const links = await tx.rolePermission.findMany({
        where: { permissionDefinitionId: { in: stale.map((item) => item.id) } },
        select: { roleDefinitionId: true },
      });
      await tx.permissionDefinition.deleteMany({
        where: { id: { in: stale.map((item) => item.id) } },
      });
      for (const roleId of new Set(links.map((link) => link.roleDefinitionId)))
        await this.invalidateRoleHolders(tx, roleId);
    }
    if (added.length || removed.length)
      await this.outbox.record(
        tx,
        "kernel.permissions.changed.v1",
        "ModuleDefinition",
        moduleId,
        { moduleId, added, removed },
        this.commands.systemContext("SyncModulePermissions"),
      );
    return { added, removed };
  }
  private assertOAuthClient(
    manifest: ModuleManifest,
    app: { clientId: string; name: string },
  ): void {
    const clientId = manifest.oauth?.clientId;
    if (clientId && clientId !== app.clientId)
      throw this.moduleError(
        "KERNEL_MODULE_APP_MISMATCH",
        `El manifiesto dice oauth.clientId «${clientId}», pero el módulo pertenece a la app «${app.name}» (${app.clientId}).`,
        [
          {
            path: "oauth.clientId",
            message: `Tiene que ser el clientId de la app dueña del módulo (${app.clientId}).`,
            keyword: "app",
          },
        ],
      );
  }
  async registerModule(input: any, context?: CommandContext) {
    input = allowInput("registerModule", input);
    const manifest = this.assertValidManifest(input.manifest);
    return this.mutate(
      "RegisterModule",
      context,
      input,
      {
        type: "ModuleDefinition",
        id: manifest.id,
        event: "kernel.module.registered.v1",
        payload: { moduleId: manifest.id, version: manifest.version },
      },
      async (tx) => {
        if (!input.appId)
          throw this.moduleError(
            "KERNEL_MODULE_APP_REQUIRED",
            "Indicá la app dueña del módulo (appId).",
          );
        const app = await tx.developerApp.findUnique({
          where: { id: String(input.appId) },
        });
        if (!app)
          throw new NotFoundException({
            code: "KERNEL_NOT_FOUND",
            message: "No existe la app indicada.",
          });
        if (app.status !== "ACTIVE")
          throw new ConflictException({
            code: "KERNEL_MODULE_APP_INACTIVE",
            message: `La app «${app.name}» no está activa: reactivala antes de registrar su módulo.`,
          });
        this.assertOAuthClient(manifest, app);
        const exists = await tx.moduleDefinition.findUnique({
          where: { id: manifest.id },
        });
        if (exists)
          throw new ConflictException({
            code: "KERNEL_MODULE_EXISTS",
            message: `Ya existe un módulo con el id «${manifest.id}». Para publicar una versión nueva usá PUT /modules/${manifest.id}/manifest.`,
          });
        const module = await tx.moduleDefinition.create({
          data: {
            id: manifest.id,
            name: manifest.name,
            description: manifest.description ?? null,
            version: manifest.version,
            contractVersion: manifest.contractVersion,
            status: "ACTIVE",
            manifest: manifest as unknown as Json,
            configurationSchema:
              (manifest.configurationSchema as Json | undefined) ??
              Prisma.DbNull,
            developerAppId: app.id,
            ownerOrganizationId: app.organizationId,
          },
        });
        await this.syncModulePermissions(tx, manifest);
        const [presented] = await this.presentModules(tx, [module]);
        return presented;
      },
    );
  }
  async listModules(query: any = {}) {
    const modules = await this.prisma.moduleDefinition.findMany({
      where: { status: query.status || undefined },
      orderBy: { id: "asc" },
    });
    return this.presentModules(this.prisma, modules);
  }
  async getModule(id: string) {
    const module = await this.prisma.moduleDefinition.findUnique({
      where: { id },
    });
    if (!module)
      throw new NotFoundException({
        code: "KERNEL_NOT_FOUND",
        message: `No existe el módulo «${id}».`,
      });
    const [presented] = await this.presentModules(this.prisma, [module]);
    return presented;
  }
  async updateModuleManifest(id: string, input: any, context?: CommandContext) {
    const manifest = this.assertValidManifest(input?.manifest);
    return this.mutate(
      "UpdateModuleManifest",
      context,
      { id, input },
      {
        type: "ModuleDefinition",
        id,
        event: "kernel.module.updated.v1",
        payload: { moduleId: id, version: manifest.version },
      },
      async (tx) => {
        if (manifest.id !== id)
          throw this.moduleError(
            "KERNEL_MODULE_MANIFEST_INVALID",
            `El manifiesto es del módulo «${manifest.id}», no de «${id}». El id de un módulo no cambia.`,
            [
              {
                path: "id",
                message: `Tiene que ser «${id}».`,
                keyword: "const",
              },
            ],
          );
        const module = await tx.moduleDefinition.findUnique({ where: { id } });
        if (!module)
          throw new NotFoundException({
            code: "KERNEL_NOT_FOUND",
            message: `No existe el módulo «${id}».`,
          });
        if (compareSemver(manifest.version, module.version) < 0)
          throw this.moduleError(
            "KERNEL_MODULE_VERSION_DOWNGRADE",
            `La versión ${manifest.version} es anterior a la publicada (${module.version}).`,
            [
              {
                path: "version",
                message: `Tiene que ser ${module.version} o posterior.`,
                keyword: "version",
              },
            ],
          );
        if (module.developerAppId) {
          const app = await tx.developerApp.findUnique({
            where: { id: module.developerAppId },
          });
          if (app) this.assertOAuthClient(manifest, app);
        }
        const updated = await tx.moduleDefinition.update({
          where: { id },
          data: {
            name: manifest.name,
            description: manifest.description ?? null,
            version: manifest.version,
            contractVersion: manifest.contractVersion,
            manifest: manifest as unknown as Json,
            configurationSchema:
              (manifest.configurationSchema as Json | undefined) ??
              Prisma.DbNull,
          },
        });
        await this.syncModulePermissions(tx, manifest);
        const [presented] = await this.presentModules(tx, [updated]);
        return presented;
      },
    );
  }
  deprecateModule(id: string, context?: CommandContext) {
    return this.mutate(
      "DeprecateModule",
      context,
      { id },
      {
        type: "ModuleDefinition",
        id,
        event: "kernel.module.deprecated.v1",
        payload: { moduleId: id },
      },
      async (tx) => {
        const updated = await tx.moduleDefinition.update({
          where: { id },
          data: { status: "DEPRECATED" },
        });
        const [presented] = await this.presentModules(tx, [updated]);
        return presented;
      },
    );
  }
  /** Validates a configuration against the module's schema (422 in Spanish). */
  private assertModuleConfiguration(
    module: { name: string; configurationSchema: unknown },
    configuration: unknown,
    prefix = "La configuración no es válida.",
  ): Record<string, unknown> {
    const result = validateConfiguration(
      module.configurationSchema ?? null,
      configuration,
    );
    if (!result.ok)
      throw this.moduleError(
        "KERNEL_MODULE_CONFIGURATION_INVALID",
        `${prefix} ${summarizeErrors(result.errors)}`,
        result.errors,
      );
    return result.value;
  }
  installModule(
    organizationId: string,
    moduleId: string,
    input: any = {},
    context?: CommandContext,
  ) {
    const configuration = input?.configuration;
    return this.mutate(
      "InstallModule",
      context,
      { organizationId, moduleId, configuration },
      {
        type: "ModuleInstallation",
        id: `${moduleId}:${organizationId}`,
        organizationId,
        event: "kernel.module-installed.v1",
        payload: { moduleId, organizationId },
      },
      async (tx) => {
        const module = await tx.moduleDefinition.findUnique({
          where: { id: moduleId },
        });
        if (!module)
          throw new NotFoundException({
            code: "KERNEL_NOT_FOUND",
            message: `No existe el módulo «${moduleId}».`,
          });
        // 6.10.3: deprecated (or retired) modules admit no new installations.
        if (module.status !== "ACTIVE")
          throw new ConflictException({
            code: "KERNEL_MODULE_NOT_INSTALLABLE",
            message:
              module.status === "DEPRECATED"
                ? `El módulo «${module.name}» está discontinuado y no admite instalaciones nuevas.`
                : `El módulo «${module.name}» no está disponible para instalar.`,
          });
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { status: true },
        });
        if (organization.status === "ARCHIVED")
          throw new ConflictException({
            code: "KERNEL_ORGANIZATION_ARCHIVED",
            message:
              "No se pueden instalar módulos en una organización archivada.",
          });
        const value =
          configuration === undefined || configuration === null
            ? undefined
            : this.assertModuleConfiguration(module, configuration);
        const existing = await tx.moduleInstallation.findUnique({
          where: { moduleId_organizationId: { moduleId, organizationId } },
        });
        if (existing && existing.status !== "DISABLED")
          throw new ConflictException({
            code: "KERNEL_MODULE_ALREADY_INSTALLED",
            message: `El módulo «${module.name}» ya está instalado.`,
          });
        const actorId = this.context(context).actor.id;
        // A disabled installation is reinstalled in place (6.10.2: one per
        // module/organization); its previous configuration is kept unless a
        // new one is sent.
        const installation = existing
          ? await tx.moduleInstallation.update({
              where: { id: existing.id },
              data: {
                status: "PENDING",
                installedById: actorId,
                installedAt: new Date(),
                activatedAt: null,
                ...(value !== undefined
                  ? { configuration: value as Json }
                  : {}),
              },
            })
          : await tx.moduleInstallation.create({
              data: {
                moduleId,
                organizationId,
                installedById: actorId,
                ...(value !== undefined
                  ? { configuration: value as Json }
                  : {}),
              },
            });
        await this.bumpCacheVersion(
          `kernel:module-version:${organizationId}:${moduleId}:v1`,
        );
        return installation;
      },
    );
  }
  transitionInstallation(
    organizationId: string,
    moduleId: string,
    target: any,
    context?: CommandContext,
  ) {
    const events: Record<string, string> = {
      ACTIVE: "kernel.module-activated.v1",
      SUSPENDED: "kernel.module-suspended.v1",
      DISABLED: "kernel.module-disabled.v1",
    };
    return this.mutate(
      `${target}ModuleInstallation`,
      context,
      { organizationId, moduleId, target },
      {
        type: "ModuleInstallation",
        id: `${moduleId}:${organizationId}`,
        organizationId,
        event: events[target],
        payload: { moduleId, organizationId, status: target },
      },
      async (tx) => {
        const installation = await tx.moduleInstallation.findUnique({
          where: { moduleId_organizationId: { moduleId, organizationId } },
        });
        if (!installation)
          throw new NotFoundException({
            code: "KERNEL_NOT_FOUND",
            message: "El módulo no está instalado en esta organización.",
          });
        installationStateMachine.assertTransition(installation.status, target);
        let configuration = installation.configuration;
        if (target === "ACTIVE") {
          // 6.10.4: activation validates the configuration against the
          // module's declared schema, not only explicit config updates.
          const module = await tx.moduleDefinition.findUniqueOrThrow({
            where: { id: moduleId },
          });
          if (module.status === "DISABLED")
            throw new ConflictException({
              code: "KERNEL_MODULE_NOT_INSTALLABLE",
              message: `El módulo «${module.name}» no está disponible.`,
            });
          configuration = this.assertModuleConfiguration(
            module,
            installation.configuration ?? undefined,
            "Antes de activar el módulo, completá su configuración.",
          ) as Prisma.JsonValue;
        }
        const updated = await tx.moduleInstallation.update({
          where: { moduleId_organizationId: { moduleId, organizationId } },
          data: {
            status: target,
            ...(target === "ACTIVE"
              ? { configuration: configuration as Json }
              : {}),
            activatedAt:
              target === "ACTIVE" ? new Date() : installation.activatedAt,
            disabledAt:
              target === "DISABLED" ? new Date() : installation.disabledAt,
          },
        });
        await this.bumpCacheVersion(
          `kernel:module-version:${organizationId}:${moduleId}:v1`,
        );
        return updated;
      },
    );
  }
  updateInstallationConfiguration(
    organizationId: string,
    moduleId: string,
    configuration: any,
    context?: CommandContext,
  ) {
    return this.mutate(
      "UpdateModuleConfiguration",
      context,
      { organizationId, moduleId, configuration },
      {
        type: "ModuleInstallation",
        id: `${moduleId}:${organizationId}`,
        organizationId,
        event: "kernel.module-configuration-updated.v1",
        payload: { moduleId, organizationId },
      },
      async (tx) => {
        const installation = await tx.moduleInstallation.findUnique({
          where: { moduleId_organizationId: { moduleId, organizationId } },
          include: { module: true },
        });
        if (!installation)
          throw new NotFoundException({
            code: "KERNEL_NOT_FOUND",
            message: "El módulo no está instalado en esta organización.",
          });
        if (installation.status === "DISABLED")
          throw new ConflictException({
            code: "KERNEL_MODULE_DISABLED",
            message:
              "El módulo está desinstalado: volvé a instalarlo para configurarlo.",
          });
        const value = this.assertModuleConfiguration(
          installation.module,
          configuration,
        );
        const updated = await tx.moduleInstallation.update({
          where: { moduleId_organizationId: { moduleId, organizationId } },
          data: { configuration: value as Json },
        });
        await this.bumpCacheVersion(
          `kernel:module-version:${organizationId}:${moduleId}:v1`,
        );
        return updated;
      },
    );
  }
  listInstallations(organizationId: string) {
    return this.prisma.moduleInstallation.findMany({
      where: { organizationId },
      include: { module: true },
      orderBy: { moduleId: "asc" },
    });
  }
  /**
   * District view: installations in an organization and (by default) every
   * organization below it, with the organization's name.
   */
  async listInstallationsInTree(organizationId: string, query: any = {}) {
    const includeDescendants =
      query.includeDescendants === undefined ||
      query.includeDescendants === true ||
      query.includeDescendants === "true";
    const organizationIds = [organizationId];
    if (includeDescendants) {
      let frontier = [organizationId];
      while (frontier.length) {
        const children = await this.prisma.organization.findMany({
          where: { parentId: { in: frontier } },
          select: { id: true },
        });
        frontier = children
          .map((child) => child.id)
          .filter((id) => !organizationIds.includes(id));
        organizationIds.push(...frontier);
      }
    }
    const installations = await this.prisma.moduleInstallation.findMany({
      where: {
        organizationId: { in: organizationIds },
        moduleId: query.moduleId || undefined,
        status: query.status || undefined,
      },
      include: {
        organization: {
          select: { id: true, name: true, type: true, status: true },
        },
      },
      orderBy: [{ moduleId: "asc" }, { organizationId: "asc" }],
    });
    return installations.map(({ organization, ...installation }) => ({
      ...installation,
      organizationName: organization.name,
      organizationType: organization.type,
    }));
  }
  async capabilities(organizationId: string) {
    const installations = await this.prisma.moduleInstallation.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { module: true },
    });
    return {
      organizationId,
      modules: installations.map((item) => ({
        moduleId: item.moduleId,
        status: item.status,
      })),
      capabilities: installations.flatMap((item) =>
        ((item.module.manifest as any)?.capabilities ?? []).map(
          (capability: any) => ({ moduleId: item.moduleId, capability }),
        ),
      ),
    };
  }

  // Service SDK read model
  // §12.2: shape consumed by KernelClient.getUserContext().
  async userContext(accountId: string) {
    const now = new Date();
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: {
        person: {
          include: {
            memberships: { include: { organization: true } },
            roleAssignments: {
              where: {
                effect: AssignmentEffect.ALLOW,
                revokedAt: null,
                validFrom: { lte: now },
                OR: [{ validUntil: null }, { validUntil: { gt: now } }],
                organizationId: { not: null },
              },
              include: {
                organization: true,
                roleDefinition: {
                  include: {
                    // E8: module permissions travel in the user context.
                    permissions: {
                      where: {
                        permissionDefinition: { moduleId: { not: null } },
                      },
                      include: { permissionDefinition: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const workspaceMap = new Map<
      string,
      {
        organizationId: string;
        name: string;
        organizationType: string;
        sources: Set<"MEMBERSHIP" | "ROLE_ASSIGNMENT">;
        roleCodes: Set<string>;
      }
    >();
    const addWorkspace = (
      organization: { id: string; name: string; type: string },
      source: "MEMBERSHIP" | "ROLE_ASSIGNMENT",
      roleCode?: string,
    ) => {
      const workspace = workspaceMap.get(organization.id) ?? {
        organizationId: organization.id,
        name: organization.name,
        organizationType: organization.type,
        sources: new Set<"MEMBERSHIP" | "ROLE_ASSIGNMENT">(),
        roleCodes: new Set<string>(),
      };
      workspace.sources.add(source);
      if (roleCode) workspace.roleCodes.add(roleCode);
      workspaceMap.set(organization.id, workspace);
    };
    for (const membership of account.person.memberships) {
      if (membership.status === "ACTIVE")
        addWorkspace(membership.organization, "MEMBERSHIP");
    }
    for (const assignment of account.person.roleAssignments) {
      if (assignment.organization?.status === "ACTIVE")
        addWorkspace(
          assignment.organization,
          "ROLE_ASSIGNMENT",
          assignment.roleDefinition.code,
        );
    }
    const districtTreeAssignments = account.person.roleAssignments.filter(
      (assignment) =>
        assignment.scopeType === ScopeType.ORGANIZATION_TREE &&
        assignment.organization?.type === "DISTRICT",
    );
    const districtIds = districtTreeAssignments
      .map((assignment) => assignment.organizationId)
      .filter((id): id is string => Boolean(id));
    if (districtIds.length) {
      const clubs = await this.prisma.organization.findMany({
        where: { parentId: { in: districtIds }, status: "ACTIVE" },
        select: { id: true, name: true, type: true, parentId: true },
      });
      for (const club of clubs) {
        const roleCodes = districtTreeAssignments
          .filter((assignment) => assignment.organizationId === club.parentId)
          .map((assignment) => assignment.roleDefinition.code);
        for (const roleCode of roleCodes)
          addWorkspace(club, "ROLE_ASSIGNMENT", roleCode);
      }
    }
    // E8 (docs/15-modules.md): per workspace, the module permissions the
    // person holds there (only modules turned on in that organization; the
    // same decision POST /authorization/check would give).
    const moduleCodesByRole = new Map<string, string[]>();
    for (const assignment of account.person.roleAssignments)
      moduleCodesByRole.set(
        assignment.roleDefinition.code,
        assignment.roleDefinition.permissions.map(
          (link) => link.permissionDefinition.code,
        ),
      );
    const modulePermissions = new Map<string, string[]>();
    for (const workspace of workspaceMap.values()) {
      const candidates = new Set(
        [...workspace.roleCodes].flatMap(
          (roleCode) => moduleCodesByRole.get(roleCode) ?? [],
        ),
      );
      const granted: string[] = [];
      for (const code of candidates) {
        const decision = await this.authorization.check({
          personId: account.personId,
          permissionCode: code,
          organizationId: workspace.organizationId,
        });
        if (decision.allowed) granted.push(code);
      }
      modulePermissions.set(workspace.organizationId, granted.sort());
    }
    return {
      accountId: account.id,
      personId: account.personId,
      accountStatus: account.status,
      platformRole: account.platformRole,
      displayName:
        account.person.displayName ??
        `${account.person.firstName} ${account.person.lastName}`,
      memberships: account.person.memberships.map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organizationId,
        organizationType: membership.organization.type,
        status: membership.status,
      })),
      workspaces: [...workspaceMap.values()]
        .map((workspace) => ({
          ...workspace,
          sources: [...workspace.sources],
          roleCodes: [...workspace.roleCodes],
          modulePermissions:
            modulePermissions.get(workspace.organizationId) ?? [],
        }))
        .sort(
          (left, right) =>
            Number(right.organizationType === "DISTRICT") -
              Number(left.organizationType === "DISTRICT") ||
            left.name.localeCompare(right.name),
        ),
      // Monotonic snapshot marker; not tied to a per-mutation counter.
      contextVersion: Date.now(),
    };
  }
  // §12.3: shape consumed by KernelClient.getMembershipSnapshot().
  async serviceMembershipSnapshot(organizationId: string) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { person: { include: { account: true } } },
    });
    return {
      snapshotId: randomUUID(),
      organizationId,
      capturedAt: new Date().toISOString(),
      sourceVersion: Date.now(),
      members: memberships.map((membership) => ({
        membershipId: membership.id,
        personId: membership.personId,
        accountId: membership.person.account?.id,
        status: membership.status,
      })),
    };
  }
  // §12.4: shape consumed by KernelClient.getAuthoritySnapshot().
  async serviceAuthoritySnapshot(organizationId: string) {
    const period = await this.currentPeriod(organizationId);
    const appointments = period
      ? await this.currentAuthorities(organizationId)
      : [];
    return {
      snapshotId: randomUUID(),
      organizationId,
      periodId: period?.id ?? null,
      capturedAt: new Date().toISOString(),
      appointments: appointments
        .filter((appointment) => appointment.periodId === period?.id)
        .map((appointment) => ({
          appointmentId: appointment.id,
          positionCode: appointment.positionDefinition.code,
          membershipId: appointment.membershipId,
          membershipOrganizationId: appointment.membership.organizationId,
          personId: appointment.membership.personId,
          status: appointment.status,
          // Redis serializes Prisma Date values as ISO strings; construct a
          // Date at the service boundary so cache hits and PostgreSQL reads
          // have identical SDK output.
          startsAt: appointment.startsAt
            ? new Date(appointment.startsAt).toISOString()
            : undefined,
          endsAt: appointment.endsAt
            ? new Date(appointment.endsAt).toISOString()
            : undefined,
        })),
    };
  }
  // §12.4.1: shape consumed by KernelClient.getPeriodSnapshot().
  async servicePeriodSnapshot(organizationId: string) {
    await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const period = await this.currentPeriod(organizationId);
    return {
      snapshotId: randomUUID(),
      organizationId,
      capturedAt: new Date().toISOString(),
      currentPeriod: period
        ? {
            periodId: period.id,
            code: period.code,
            name: period.name,
            sequence: period.sequence,
            startDate: new Date(period.startDate).toISOString(),
            endDate: new Date(period.endDate).toISOString(),
            status: period.status,
          }
        : null,
    };
  }
  async serviceInstallation(moduleId: string, organizationId: string) {
    const version = await this.cacheVersion(
      `kernel:module-version:${organizationId}:${moduleId}:v1`,
    );
    return this.cached(
      `kernel:module:${organizationId}:${moduleId}:${version}`,
      30,
      () =>
        this.prisma.moduleInstallation.findUniqueOrThrow({
          where: { moduleId_organizationId: { moduleId, organizationId } },
          include: { module: true },
        }),
    );
  }
}
