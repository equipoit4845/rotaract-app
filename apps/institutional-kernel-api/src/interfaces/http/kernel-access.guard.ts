import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

import { AuthorizationService } from "../../application/authorization/authorization.service";
import {
  JwtSessionGuard,
  AuthenticatedRequest,
} from "../../application/auth/jwt-session.guard";
import { ServiceApiGuard } from "../../application/auth/service-api.guard";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// Express 5's `req.query` is a getter that re-parses `req.url` on every
// access (no setter, see express/lib/request.js) — a plain
// `request.query.x = y` mutates a throwaway object and is silently lost
// before Nest's @Query() decorator reads it again. Redefining the
// property on this request instance shadows the prototype getter so the
// override actually reaches the controller.
function overrideQueryParam(
  request: Request,
  field: string,
  value: string,
): void {
  Object.defineProperty(request, "query", {
    value: { ...request.query, [field]: value },
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

const publicOperations = new Set([
  "register",
  "login",
  "refresh",
  "verify",
  "forgotPassword",
  "resetPassword",
  "acceptInvitation",
  "live",
  "ready",
  "version",
]);
const accountOperations = new Set([
  "logout",
  "logoutAll",
  "me",
  "updateMe",
  "changePassword",
  "sessions",
  "revoke",
]);
const idempotentMutations = new Set([
  "createPerson",
  "updatePerson",
  "archivePerson",
  "invitePerson",
  "create",
  "update",
  "activate",
  "deactivate",
  "archive",
  "move",
  "createMembership",
  "updateMembership",
  "membershipActivate",
  "membershipLeave",
  "membershipResume",
  "membershipDeactivate",
  "membershipGraduate",
  "membershipReactivate",
  "createPeriod",
  "updatePeriod",
  "schedule",
  "activatePeriod",
  "closePeriod",
  "cancelPeriod",
  "createPosition",
  "updatePosition",
  "attachPositionPermission",
  "detachPositionPermission",
  "createAppointment",
  "elect",
  "activateAppointment",
  "endAppointment",
  "revokeAppointment",
  "createPermission",
  "createRole",
  "attachPermission",
  "detachPermission",
  "grantRole",
  "revokeRole",
  "createApplication",
  "submit",
  "approve",
  "reject",
  "cancelApplication",
  "requestTransfer",
  "accept",
  "confirm",
  "complete",
  "rejectTransfer",
  "cancelTransfer",
  "createModule",
  "manifest",
  "deprecate",
  "install",
  "activateInstall",
  "config",
  "suspend",
  "disable",
  "suspendAccount",
  "reactivateAccount",
  "disableAccount",
]);
// Permission codes per kernel-spec.md §10.1. The catalog doesn't provide a
// distinct code for every transition (e.g. no organization.deactivate,
// period.cancel, appointment.elect, or transfer.complete) — those map to
// the closest listed bucket, noted inline. ScopeType has no SELF variant,
// so the codes below are just the *base* permission per handler; actual
// actor-is-owner enforcement for application/transfer resources happens
// separately via selfScopeResourceHandlers/selfScopeListHandlers further
// down, which override these defaults with ownership + escalation checks.
const permissionByHandler: Record<string, string> = {
  createPerson: "kernel.person.manage",
  listPersons: "kernel.person.read",
  person: "kernel.person.read",
  updatePerson: "kernel.person.manage",
  archivePerson: "kernel.person.manage",
  invitePerson: "kernel.person.manage",
  suspendAccount: "kernel.account.manage",
  reactivateAccount: "kernel.account.manage",
  disableAccount: "kernel.account.manage",
  create: "kernel.organization.create",
  list: "kernel.organization.read",
  get: "kernel.organization.read",
  update: "kernel.organization.update",
  activate: "kernel.organization.activate",
  // kernel-openapi.yaml's documented assumption for deactivateOrganization:
  // reuses .activate since §10.1 has no dedicated deactivate code and it's
  // the same reversible administrative transition as activate/reactivate.
  deactivate: "kernel.organization.activate",
  archive: "kernel.organization.archive",
  move: "kernel.organization.move",
  children: "kernel.organization.read",
  ancestors: "kernel.organization.read",
  descendants: "kernel.organization.read",
  createMembership: "kernel.membership.create",
  listMemberships: "kernel.membership.read",
  membership: "kernel.membership.read",
  updateMembership: "kernel.membership.update",
  membershipActivate: "kernel.membership.activate",
  membershipLeave: "kernel.membership.deactivate",
  membershipResume: "kernel.membership.activate",
  membershipDeactivate: "kernel.membership.deactivate",
  membershipGraduate: "kernel.membership.update", // no dedicated graduate code
  membershipReactivate: "kernel.membership.activate",
  history: "kernel.membership.read",
  membershipsForPerson: "kernel.membership.read",
  createPeriod: "kernel.period.create",
  listPeriods: "kernel.period.read",
  currentPeriod: "kernel.period.read",
  period: "kernel.period.read",
  updatePeriod: "kernel.period.update",
  schedule: "kernel.period.update", // no dedicated schedule code
  activatePeriod: "kernel.period.activate",
  closePeriod: "kernel.period.close",
  cancelPeriod: "kernel.period.update", // no dedicated cancel code
  createPosition: "kernel.position.create",
  listPositions: "kernel.position.read",
  // Fallback defaults only: canActivate() overrides these with the
  // position's own editPermissionCode when the position can be resolved —
  // see the positionHandlers special-case.
  updatePosition: "kernel.position.manage",
  attachPositionPermission: "kernel.position.manage",
  detachPositionPermission: "kernel.position.manage",
  createAppointment: "kernel.appointment.create",
  listAppointments: "kernel.appointment.read",
  currentAuthorities: "kernel.appointment.read",
  appointment: "kernel.appointment.read",
  elect: "kernel.appointment.create", // no dedicated elect code
  activateAppointment: "kernel.appointment.activate",
  endAppointment: "kernel.appointment.end",
  revokeAppointment: "kernel.appointment.revoke",
  permissions: "kernel.role.read",
  createPermission: "kernel.role.manage", // no dedicated permission-catalog code
  roles: "kernel.role.read",
  createRole: "kernel.role.manage",
  attachPermission: "kernel.role.manage",
  detachPermission: "kernel.role.manage",
  grantRole: "kernel.role.assign",
  listAssignments: "kernel.role.read",
  revokeRole: "kernel.role.revoke",
  check: "kernel.role.read", // no dedicated authorization.check code
  batch: "kernel.role.read",
  effective: "kernel.role.read",
  createApplication: "kernel.application.create.self",
  listApplications: "kernel.application.read.self",
  application: "kernel.application.read.self",
  submit: "kernel.application.create.self",
  approve: "kernel.application.review",
  reject: "kernel.application.review",
  cancelApplication: "kernel.application.cancel.self",
  requestTransfer: "kernel.transfer.create.self",
  listTransfers: "kernel.transfer.read.self",
  transfer: "kernel.transfer.read.self",
  accept: "kernel.transfer.accept",
  confirm: "kernel.transfer.confirm",
  complete: "kernel.transfer.confirm", // no dedicated complete code
  rejectTransfer: "kernel.transfer.reject",
  cancelTransfer: "kernel.transfer.create.self",
  createModule: "kernel.module.register",
  modules: "kernel.module.read",
  module: "kernel.module.read",
  manifest: "kernel.module.register",
  deprecate: "kernel.module.register",
  install: "kernel.module.install",
  activateInstall: "kernel.module.install",
  config: "kernel.module.configure",
  suspend: "kernel.module.disable", // no dedicated suspend code
  disable: "kernel.module.disable",
  installations: "kernel.module.read",
  capabilities: "kernel.module.read",
};

// Handlers whose route only carries the entity's own id (not its
// organizationId). Without this, AuthorizationService.check() receives
// organizationId: undefined and any ORGANIZATION/ORGANIZATION_TREE-scoped
// assignment is rejected (scopeSpecificity returns -1), leaving only
// PLATFORM-scoped assignments able to act — silently locking out every
// district/club-scoped role from managing its own resources. These
// resolvers load the entity once to recover the organizationId(s) the
// authorization check should actually be evaluated against.
type OrganizationResolver = (
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
) => Promise<Array<string | undefined> | undefined>;

async function membershipOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { id: String(request.params.membershipId) },
    select: { organizationId: true },
  });
  return membership ? [membership.organizationId] : undefined;
}

async function periodOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const period = await prisma.institutionalPeriod.findUnique({
    where: { id: String(request.params.periodId) },
    select: { organizationId: true },
  });
  return period ? [period.organizationId] : undefined;
}

const positionHandlers = new Set([
  "updatePosition",
  "attachPositionPermission",
  "detachPositionPermission",
]);

async function loadPosition(
  prisma: PrismaService,
  positionDefinitionId: string,
) {
  return prisma.positionDefinition.findUnique({
    where: { id: positionDefinitionId },
    select: { ownerOrganizationId: true, editPermissionCode: true },
  });
}

async function appointmentOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: String(request.params.appointmentId) },
    select: { organizationId: true },
  });
  return appointment ? [appointment.organizationId] : undefined;
}

async function applicationOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const application = await prisma.membershipApplication.findUnique({
    where: { id: String(request.params.applicationId) },
    select: { organizationId: true },
  });
  return application ? [application.organizationId] : undefined;
}

async function transferRequestOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const membershipId = request.body?.membershipId;
  if (!membershipId) return undefined;
  const membership = await prisma.organizationMembership.findUnique({
    where: { id: String(membershipId) },
    select: { organizationId: true },
  });
  return membership ? [membership.organizationId] : undefined;
}

async function transferDestinationOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const transfer = await prisma.membershipTransfer.findUnique({
    where: { id: String(request.params.transferId) },
    select: { toOrganizationId: true },
  });
  return transfer ? [transfer.toOrganizationId] : undefined;
}

async function transferOriginOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const transfer = await prisma.membershipTransfer.findUnique({
    where: { id: String(request.params.transferId) },
    select: { fromOrganizationId: true },
  });
  return transfer ? [transfer.fromOrganizationId] : undefined;
}

async function transferEitherSideOrganization(
  prisma: PrismaService,
  request: AuthenticatedRequest & Request,
): Promise<Array<string | undefined> | undefined> {
  const transfer = await prisma.membershipTransfer.findUnique({
    where: { id: String(request.params.transferId) },
    select: { fromOrganizationId: true, toOrganizationId: true },
  });
  return transfer
    ? [transfer.fromOrganizationId, transfer.toOrganizationId]
    : undefined;
}

// ---------------------------------------------------------------------
// "Self" permission enforcement (kernel-openapi.yaml's documented
// behaviour for listMembershipApplications et al: holding only the
// ".self" permission — not the org-scoped review/staff one — restricts
// the actor to their OWN application/transfer, never a third party's).
// ScopeType has no SELF variant, so this can't be expressed as a scope;
// it's enforced here by comparing the resource's owner against the
// authenticated actor and choosing which permission code must hold.
// ---------------------------------------------------------------------
type ResourceOwnership = {
  organizationIds: Array<string | undefined>;
  ownerPersonId: string | undefined;
};
type SelfScopeResourceConfig = {
  paramName: string;
  load: (
    prisma: PrismaService,
    id: string,
  ) => Promise<ResourceOwnership | undefined>;
  selfPermission: string;
  escalationPermissions: string[];
};
type SelfScopeListConfig = {
  selfPermission: string;
  escalationPermissions: string[];
  /** request.query field forced to the actor's personId when they lack every escalation permission. */
  filterField: string;
};

async function loadApplicationOwnership(
  prisma: PrismaService,
  id: string,
): Promise<ResourceOwnership | undefined> {
  const application = await prisma.membershipApplication.findUnique({
    where: { id },
    select: { organizationId: true, requesterPersonId: true },
  });
  return application
    ? {
        organizationIds: [application.organizationId],
        ownerPersonId: application.requesterPersonId,
      }
    : undefined;
}

async function loadTransferOwnership(
  prisma: PrismaService,
  id: string,
): Promise<ResourceOwnership | undefined> {
  const transfer = await prisma.membershipTransfer.findUnique({
    where: { id },
    select: {
      fromOrganizationId: true,
      toOrganizationId: true,
      requestedById: true,
    },
  });
  return transfer
    ? {
        organizationIds: [
          transfer.fromOrganizationId,
          transfer.toOrganizationId,
        ],
        ownerPersonId: transfer.requestedById,
      }
    : undefined;
}

const applicationEscalation = ["kernel.application.review"];
const transferEscalation = [
  "kernel.transfer.accept",
  "kernel.transfer.confirm",
  "kernel.transfer.reject",
];

const selfScopeResourceHandlers: Record<string, SelfScopeResourceConfig> = {
  application: {
    paramName: "applicationId",
    load: loadApplicationOwnership,
    selfPermission: "kernel.application.read.self",
    escalationPermissions: applicationEscalation,
  },
  submit: {
    paramName: "applicationId",
    load: loadApplicationOwnership,
    selfPermission: "kernel.application.create.self",
    escalationPermissions: applicationEscalation,
  },
  cancelApplication: {
    paramName: "applicationId",
    load: loadApplicationOwnership,
    selfPermission: "kernel.application.cancel.self",
    escalationPermissions: applicationEscalation,
  },
  transfer: {
    paramName: "transferId",
    load: loadTransferOwnership,
    selfPermission: "kernel.transfer.read.self",
    escalationPermissions: transferEscalation,
  },
  cancelTransfer: {
    paramName: "transferId",
    load: loadTransferOwnership,
    selfPermission: "kernel.transfer.create.self",
    escalationPermissions: transferEscalation,
  },
};

const selfScopeListHandlers: Record<string, SelfScopeListConfig> = {
  listApplications: {
    selfPermission: "kernel.application.read.self",
    escalationPermissions: applicationEscalation,
    filterField: "personId",
  },
  listTransfers: {
    selfPermission: "kernel.transfer.read.self",
    escalationPermissions: transferEscalation,
    filterField: "requestedById",
  },
};

const organizationResolverByHandler: Record<string, OrganizationResolver> = {
  updateMembership: membershipOrganization,
  membershipActivate: membershipOrganization,
  membershipLeave: membershipOrganization,
  membershipResume: membershipOrganization,
  membershipDeactivate: membershipOrganization,
  membershipGraduate: membershipOrganization,
  membershipReactivate: membershipOrganization,
  updatePeriod: periodOrganization,
  schedule: periodOrganization,
  activatePeriod: periodOrganization,
  closePeriod: periodOrganization,
  cancelPeriod: periodOrganization,
  elect: appointmentOrganization,
  activateAppointment: appointmentOrganization,
  endAppointment: appointmentOrganization,
  revokeAppointment: appointmentOrganization,
  // submit/cancelApplication and transfer/cancelTransfer are NOT listed
  // here — they're handled by selfScopeResourceHandlers instead, which
  // resolves ownership and organizationId together.
  approve: applicationOrganization,
  reject: applicationOrganization,
  requestTransfer: transferRequestOrganization,
  accept: transferDestinationOrganization,
  confirm: transferOriginOrganization,
  complete: transferEitherSideOrganization,
  rejectTransfer: transferEitherSideOrganization,
};

@Injectable()
export class KernelAccessGuard implements CanActivate {
  constructor(
    private readonly users: JwtSessionGuard,
    private readonly services: ServiceApiGuard,
    private readonly authorization: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler().name;
    if (publicOperations.has(handler)) return true;
    const controller = context.getClass().name;
    if (controller === "ServiceController" || handler === "introspect")
      return this.services.canActivate(context);
    await this.users.canActivate(context);
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & Request>();
    if (idempotentMutations.has(handler) && !request.header("idempotency-key"))
      throw new BadRequestException(
        "Idempotency-Key is required for this command",
      );
    if (accountOperations.has(handler)) return true;
    let permission = permissionByHandler[handler];
    if (!permission)
      throw new ForbiddenException(
        "No authorization policy is registered for this operation",
      );
    const directOrganizationId =
      String(
        request.params.organizationId ??
          request.body?.organizationId ??
          request.query?.organizationId ??
          "",
      ) || undefined;
    const periodId =
      String(
        request.params.periodId ??
          request.body?.periodId ??
          request.query?.periodId ??
          "",
      ) || undefined;

    const listConfig = selfScopeListHandlers[handler];
    if (listConfig) {
      const directCandidates = directOrganizationId
        ? [directOrganizationId]
        : [undefined];
      const hasEscalation = await this.hasAnyPermission(
        request.user.personId,
        listConfig.escalationPermissions,
        directCandidates,
        periodId,
      );
      if (hasEscalation) return true;
      // No staff/review permission: force the query to the actor's own
      // resources regardless of what the client asked for, then require
      // at least the PLATFORM-wide .self permission (§10.2 PLATFORM_USER)
      // to proceed — an account with no role at all still gets denied.
      overrideQueryParam(
        request,
        listConfig.filterField,
        request.user.personId,
      );
      const hasSelf = await this.hasAnyPermission(
        request.user.personId,
        [listConfig.selfPermission],
        [undefined],
        periodId,
      );
      if (!hasSelf) throw new ForbiddenException("Permission denied");
      return true;
    }

    let permissions = [permission];
    let candidateOrganizationIds: Array<string | undefined>;
    const selfConfig = selfScopeResourceHandlers[handler];
    if (positionHandlers.has(handler)) {
      // The position catalog is authorized against the district that owns
      // it, using the permission code the position itself declares
      // (editPermissionCode) rather than a fixed handler->permission
      // mapping, so a district can delegate catalog edits to a permission
      // other than kernel.position.manage.
      const position = await loadPosition(
        this.prisma,
        String(request.params.positionDefinitionId),
      );
      permissions = [position?.editPermissionCode ?? permission];
      candidateOrganizationIds = position
        ? position.ownerOrganizationId
          ? [position.ownerOrganizationId]
          : []
        : [undefined];
    } else if (selfConfig) {
      const owned = await selfConfig.load(
        this.prisma,
        String(request.params[selfConfig.paramName]),
      );
      const isOwner = !!owned && owned.ownerPersonId === request.user.personId;
      permissions = isOwner
        ? [selfConfig.selfPermission]
        : selfConfig.escalationPermissions;
      candidateOrganizationIds =
        owned && owned.organizationIds.length
          ? owned.organizationIds
          : [undefined];
    } else {
      candidateOrganizationIds = directOrganizationId
        ? [directOrganizationId]
        : ((await organizationResolverByHandler[handler]?.(
            this.prisma,
            request,
          )) ?? [undefined]);
    }
    if (candidateOrganizationIds.length === 0)
      candidateOrganizationIds = [undefined];
    const allowed = await this.hasAnyPermission(
      request.user.personId,
      permissions,
      candidateOrganizationIds,
      periodId,
    );
    if (!allowed) throw new ForbiddenException("Permission denied");
    return true;
  }
  private async hasAnyPermission(
    personId: string,
    permissions: string[],
    organizationIds: Array<string | undefined>,
    periodId: string | undefined,
  ): Promise<boolean> {
    for (const permissionCode of permissions) {
      for (const organizationId of organizationIds) {
        const decision = await this.authorization.check({
          personId,
          permissionCode,
          organizationId,
          periodId,
        });
        if (decision.allowed) return true;
      }
    }
    return false;
  }
}
