import type { Prisma, PrismaClient } from "@prisma/client";

import {
  toAuthorityView,
  toMemberView,
  toOrganizationView,
  toPeriodView,
  toPersonView,
} from "../data-api/views";
import { eventDefinition, type PublicEnvelope } from "./catalog";

/**
 * Internal outbox events (kernel-events-contract.md) → public catalog
 * (catalog.ts). Three steps:
 *
 * 1. `planPublicEvent` (pure): which public type, if any, an outbox row
 *    becomes, and which aggregate it is about.
 * 2. `resolvePublicEvent` (reads the database once per event): loads the
 *    aggregate and the organizations the event concerns.
 * 3. `renderForApp` (pure): per app — required scope, organization tree,
 *    PII rules of the Data API views — the exact body to sign, or null.
 */

export const CONTACT_SCOPE = "kernel.service.persons.contact.read";

export type OutboxLike = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  aggregateId: string;
};

export type EventPlan =
  | {
      kind: "membership";
      type: string;
      membershipId: string;
      previousStatus: string | null;
      reason?: string;
    }
  | {
      kind: "appointment";
      type: string;
      appointmentId: string;
      /** Only if the appointment had been ACTIVE (a revoked nomination is not "cargo terminado"). */
      requireActivated: boolean;
    }
  | {
      kind: "organization";
      type: string;
      organizationId: string;
      changedFields: string[];
    }
  | { kind: "person"; type: string; personId: string; changedFields: string[] }
  | { kind: "period"; type: string; periodId: string }
  | {
      kind: "module";
      type: string;
      moduleId: string;
      organizationId: string;
      reason?: string;
    };

const ENDED_STATUSES = ["INACTIVE", "GRADUATED"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/** Which public event an internal one becomes (null: not published). */
export function planPublicEvent(message: OutboxLike): EventPlan | null {
  const data = record(message.payload);
  const id = (key: string) => str(data[key]) ?? message.aggregateId;
  switch (message.eventType) {
    case "kernel.membership.created.v1":
      return {
        kind: "membership",
        type: "membership.created.v1",
        membershipId: id("membershipId"),
        previousStatus: null,
      };
    case "kernel.membership.activated.v1":
      return {
        kind: "membership",
        type: "membership.activated.v1",
        membershipId: id("membershipId"),
        previousStatus: str(data.fromStatus) ?? null,
      };
    case "kernel.membership.status-changed.v1": {
      const to = str(data.toStatus);
      if (!to || !ENDED_STATUSES.includes(to)) return null;
      return {
        kind: "membership",
        type: "membership.ended.v1",
        membershipId: id("membershipId"),
        previousStatus: str(data.fromStatus) ?? null,
        reason: to,
      };
    }
    case "kernel.membership.transferred.v1":
      return {
        kind: "membership",
        type: "membership.ended.v1",
        membershipId:
          str(data.membershipId) ?? str(data.sourceMembershipId) ?? "",
        previousStatus: "ACTIVE",
        reason: "TRANSFERRED",
      };
    case "kernel.appointment.activated.v1":
      return {
        kind: "appointment",
        type: "appointment.activated.v1",
        appointmentId: id("appointmentId"),
        requireActivated: false,
      };
    case "kernel.appointment.ended.v1":
      return {
        kind: "appointment",
        type: "appointment.ended.v1",
        appointmentId: id("appointmentId"),
        requireActivated: false,
      };
    case "kernel.appointment.revoked.v1":
      return {
        kind: "appointment",
        type: "appointment.ended.v1",
        appointmentId: id("appointmentId"),
        requireActivated: true,
      };
    case "kernel.organization.updated.v1":
      return {
        kind: "organization",
        type: "organization.updated.v1",
        organizationId: id("organizationId"),
        changedFields: strings(data.changedFields),
      };
    case "kernel.organization.activated.v1":
    case "kernel.organization.deactivated.v1":
      return {
        kind: "organization",
        type: "organization.updated.v1",
        organizationId: id("organizationId"),
        changedFields: ["status"],
      };
    case "kernel.organization.moved.v1":
      return {
        kind: "organization",
        type: "organization.updated.v1",
        organizationId: id("organizationId"),
        changedFields: ["parentId"],
      };
    case "kernel.organization.archived.v1":
      return {
        kind: "organization",
        type: "organization.archived.v1",
        organizationId: id("organizationId"),
        changedFields: ["status"],
      };
    case "kernel.person.updated.v1":
      return {
        kind: "person",
        type: "person.updated.v1",
        personId: id("personId"),
        changedFields: strings(data.changedFields),
      };
    case "kernel.period.created.v1":
      return {
        kind: "period",
        type: "period.created.v1",
        periodId: id("periodId"),
      };
    // E8: module installations (aggregateId is "<moduleId>:<organizationId>").
    case "kernel.module-installed.v1":
    case "kernel.module-activated.v1":
    case "kernel.module-suspended.v1":
    case "kernel.module-disabled.v1":
    case "kernel.module-configuration-updated.v1": {
      const [aggregateModule, aggregateOrganization] =
        message.aggregateId.split(":");
      const moduleId = str(data.moduleId) ?? aggregateModule;
      const organizationId = str(data.organizationId) ?? aggregateOrganization;
      if (!moduleId || !organizationId) return null;
      const types: Record<string, [string, string?]> = {
        "kernel.module-installed.v1": ["module.installed.v1"],
        "kernel.module-activated.v1": ["module.enabled.v1"],
        "kernel.module-suspended.v1": ["module.disabled.v1", "SUSPENDED"],
        "kernel.module-disabled.v1": ["module.disabled.v1", "DISABLED"],
        "kernel.module-configuration-updated.v1": ["module.configured.v1"],
      };
      const [type, reason] = types[message.eventType];
      return { kind: "module", type, moduleId, organizationId, reason };
    }
    default:
      return null;
  }
}

/** Internal event types that can become public ones (fan-out prefilter). */
export const MAPPED_INTERNAL_TYPES = [
  "kernel.membership.created.v1",
  "kernel.membership.activated.v1",
  "kernel.membership.status-changed.v1",
  "kernel.membership.transferred.v1",
  "kernel.appointment.activated.v1",
  "kernel.appointment.ended.v1",
  "kernel.appointment.revoked.v1",
  "kernel.organization.updated.v1",
  "kernel.organization.activated.v1",
  "kernel.organization.deactivated.v1",
  "kernel.organization.moved.v1",
  "kernel.organization.archived.v1",
  "kernel.person.updated.v1",
  "kernel.period.created.v1",
  "kernel.module-installed.v1",
  "kernel.module-activated.v1",
  "kernel.module-suspended.v1",
  "kernel.module-disabled.v1",
  "kernel.module-configuration-updated.v1",
];

/** What the Data API's OrganizationView publishes (other columns never leave). */
const ORGANIZATION_PUBLIC_FIELDS = new Set([
  "type",
  "code",
  "name",
  "slug",
  "status",
  "parentId",
  "countryCode",
  "region",
  "city",
  "timezone",
  "logoUrl",
  "description",
]);
/** PersonView fields, by internal column name → public name. */
const PERSON_PUBLIC_FIELDS: Record<string, string> = {
  firstName: "firstName",
  lastName: "lastName",
  displayName: "displayName",
  avatarUrl: "avatarUrl",
};
const PERSON_CONTACT_FIELDS: Record<string, string> = {
  primaryEmail: "email",
  phone: "phone",
  birthDate: "birthDate",
};

/** An event ready to be rendered per app. */
export type ResolvedEvent = {
  eventId: string;
  type: string;
  createdAt: string;
  scope: string | null;
  /** Organizations the event concerns, most specific first. */
  organizationIds: string[];
  /** E8: only this app may receive it (module events go to the module's app). */
  appId?: string;
  /** `data` for an app; null when nothing in it is visible to that app. */
  data: (options: { contact: boolean }) => Record<string, unknown> | null;
};

export function publicEventId(outboxMessageId: string): string {
  return `evt_${outboxMessageId}`;
}

type Reader = Pick<
  PrismaClient | Prisma.TransactionClient,
  | "organizationMembership"
  | "appointment"
  | "organization"
  | "person"
  | "institutionalPeriod"
  | "moduleInstallation"
>;

/** Loads what a plan needs. Null when the aggregate is gone or not publishable. */
export async function resolvePublicEvent(
  db: Reader,
  message: OutboxLike,
  plan: EventPlan | null = planPublicEvent(message),
): Promise<ResolvedEvent | null> {
  if (!plan) return null;
  const definition = eventDefinition(plan.type);
  if (!definition) return null;
  const base = {
    eventId: publicEventId(message.id),
    type: plan.type,
    createdAt: message.occurredAt.toISOString(),
    scope: definition.scope,
  };
  switch (plan.kind) {
    case "membership": {
      if (!plan.membershipId) return null;
      const membership = await db.organizationMembership.findUnique({
        where: { id: plan.membershipId },
        include: { person: true },
      });
      if (!membership) return null;
      return {
        ...base,
        organizationIds: [membership.organizationId],
        data: ({ contact }) => {
          const data: Record<string, unknown> = {
            membership: toMemberView(membership, { contact }),
            previousStatus: plan.previousStatus,
          };
          if (plan.reason) {
            data.reason = plan.reason;
            data.endedAt = membership.endedAt?.toISOString() ?? null;
          }
          return data;
        },
      };
    }
    case "appointment": {
      const appointment = await db.appointment.findUnique({
        where: { id: plan.appointmentId },
        include: {
          positionDefinition: true,
          membership: { include: { person: true } },
        },
      });
      if (!appointment) return null;
      if (plan.requireActivated && !appointment.activatedAt) return null;
      return {
        ...base,
        organizationIds: [appointment.organizationId],
        data: () => ({ authority: toAuthorityView(appointment) }),
      };
    }
    case "organization": {
      const organization = await db.organization.findUnique({
        where: { id: plan.organizationId },
      });
      if (!organization) return null;
      const changed = plan.changedFields.filter((field) =>
        ORGANIZATION_PUBLIC_FIELDS.has(field),
      );
      // An update that only touched non-public columns (contact data,
      // attributes) says nothing an app may know.
      if (
        plan.type === "organization.updated.v1" &&
        plan.changedFields.length > 0 &&
        changed.length === 0
      )
        return null;
      return {
        ...base,
        organizationIds: [organization.id],
        data: () =>
          plan.type === "organization.archived.v1"
            ? { organization: toOrganizationView(organization) }
            : {
                organization: toOrganizationView(organization),
                changedFields: changed,
              },
      };
    }
    case "person": {
      const person = await db.person.findUnique({
        where: { id: plan.personId },
        include: {
          memberships: {
            select: { organizationId: true, status: true },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!person) return null;
      // Like the Data API: a person is visible to an app when they have a
      // membership (any status) in its tree. Current memberships first.
      const current = ["ACTIVE", "ON_LEAVE", "PENDING"];
      const organizationIds = [
        ...new Set(
          [...person.memberships]
            .sort(
              (a, b) =>
                Number(current.includes(b.status)) -
                Number(current.includes(a.status)),
            )
            .map((membership) => membership.organizationId),
        ),
      ];
      const { memberships: _memberships, ...row } = person;
      return {
        ...base,
        organizationIds,
        data: ({ contact }) => {
          const changed = plan.changedFields.flatMap((field) => {
            if (PERSON_PUBLIC_FIELDS[field])
              return [PERSON_PUBLIC_FIELDS[field]];
            if (contact && PERSON_CONTACT_FIELDS[field])
              return [PERSON_CONTACT_FIELDS[field]];
            return [];
          });
          // Only contact data changed and the app can't see it: the app
          // must not even learn that it changed.
          if (plan.changedFields.length > 0 && changed.length === 0)
            return null;
          return {
            person: toPersonView(row, { contact }),
            changedFields: [...new Set(changed)],
          };
        },
      };
    }
    case "period": {
      const period = await db.institutionalPeriod.findUnique({
        where: { id: plan.periodId },
      });
      if (!period) return null;
      return {
        ...base,
        organizationIds: [period.organizationId],
        data: () => ({ period: toPeriodView(period) }),
      };
    }
    case "module": {
      const installation = await db.moduleInstallation.findUnique({
        where: {
          moduleId_organizationId: {
            moduleId: plan.moduleId,
            organizationId: plan.organizationId,
          },
        },
        include: { module: { select: { developerAppId: true } } },
      });
      // Modules registered before E8 have no owner app: nobody receives it.
      if (!installation?.module.developerAppId) return null;
      return {
        ...base,
        organizationIds: [installation.organizationId],
        appId: installation.module.developerAppId,
        data: () => {
          const data: Record<string, unknown> = {
            installation: {
              moduleId: installation.moduleId,
              organizationId: installation.organizationId,
              status: installation.status,
              configuration: installation.configuration ?? null,
              installedAt: installation.installedAt.toISOString(),
              activatedAt: installation.activatedAt?.toISOString() ?? null,
              disabledAt: installation.disabledAt?.toISOString() ?? null,
            },
          };
          if (plan.reason) data.reason = plan.reason;
          return data;
        },
      };
    }
  }
}

export type AppAudience = {
  /** E8: the app's id, for events addressed to a single app. */
  appId?: string;
  scopes: readonly string[];
  /** The app's organization and all its descendants. */
  organizationIds: ReadonlySet<string>;
};

export type RenderedEvent = {
  envelope: PublicEnvelope;
  /** The exact bytes that are signed and POSTed. */
  body: string;
};

/** Scope + organization tree + PII. Null: this app must not receive it. */
export function renderForApp(
  event: ResolvedEvent,
  app: AppAudience,
): RenderedEvent | null {
  if (event.scope && !app.scopes.includes(event.scope)) return null;
  if (event.appId && event.appId !== app.appId) return null;
  const organizationId = event.organizationIds.find((id) =>
    app.organizationIds.has(id),
  );
  if (!organizationId) return null;
  const data = event.data({ contact: app.scopes.includes(CONTACT_SCOPE) });
  if (!data) return null;
  const envelope: PublicEnvelope = {
    id: event.eventId,
    type: event.type,
    createdAt: event.createdAt,
    organizationId,
    data,
  };
  return { envelope, body: JSON.stringify(envelope) };
}

/** The organization and all its descendants (same rule as ServiceApiGuard). */
export async function organizationTree(
  db: Pick<PrismaClient | Prisma.TransactionClient, "organization">,
  rootId: string,
): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const children = await db.organization.findMany({
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
