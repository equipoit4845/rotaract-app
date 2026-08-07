export const KERNEL_API_VERSION = "v1" as const;
export const KERNEL_EVENT_SPEC_VERSION = "1.0" as const;

// kernel-spec.md §11.1 — the envelope every kernel integration event is
// published with on the outbox/broker.
export type ActorType = "USER" | "SERVICE" | "SYSTEM";

export type KernelEventEnvelope<TData = unknown> = {
  specVersion: typeof KERNEL_EVENT_SPEC_VERSION;
  eventId: string;
  eventType: string;
  eventVersion: number;
  source: "institutional-kernel";
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  tenantId?: string;
  occurredAt: string;
  actor: { type: ActorType; id?: string };
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  data: TData;
};

// kernel-spec.md §12.2 — UserContext
export type UserContext = {
  accountId: string;
  personId: string;
  accountStatus: "ACTIVE";
  platformRole: "USER" | "SUPERADMIN";
  displayName: string;
  memberships: Array<{
    membershipId: string;
    organizationId: string;
    organizationType: "DISTRICT" | "CLUB" | "OTHER";
    status: string;
  }>;
  contextVersion: number;
};

// kernel-spec.md §12.3 — MembershipSnapshot
export type MembershipSnapshot = {
  snapshotId: string;
  organizationId: string;
  capturedAt: string;
  sourceVersion: number;
  members: Array<{
    membershipId: string;
    personId: string;
    accountId?: string;
    status: string;
  }>;
};

// kernel-spec.md §12.4 — AuthoritySnapshot
export type AuthoritySnapshot = {
  snapshotId: string;
  organizationId: string;
  periodId: string | null;
  capturedAt: string;
  appointments: Array<{
    appointmentId: string;
    positionCode: string;
    membershipId: string;
    membershipOrganizationId: string;
    personId: string;
    status: "ACTIVE";
    startsAt?: string;
    endsAt?: string;
  }>;
};

// kernel-spec.md §12.4.1 — PeriodSnapshot
export type PeriodSnapshot = {
  snapshotId: string;
  organizationId: string;
  capturedAt: string;
  currentPeriod: {
    periodId: string;
    code: string;
    name: string;
    sequence: number;
    startDate: string;
    endDate: string;
    status: "ACTIVE";
  } | null;
};

// kernel-spec.md §9.8 — authorization check request/response contract.
export type AuthorizationScopeType =
  "PLATFORM" | "ORGANIZATION" | "ORGANIZATION_TREE";
export type AuthorizationCheckRequest = {
  subjectId: string;
  permission: string;
  scope?: { type: AuthorizationScopeType; organizationId?: string };
  periodId?: string;
  resource?: {
    type: string;
    id: string;
    attributes?: Record<string, unknown>;
  };
};
export type BatchAuthorizationCheckRequest = {
  checks: AuthorizationCheckRequest[];
};
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

// §12.1 — auxiliary read types the SDK exposes. The spec names these
// (IntrospectionResult, PersonSummary, OrganizationSummary,
// ModuleInstallationSummary) without pinning their fields; these mirror
// what the kernel's /auth/introspect and /service/* endpoints actually
// return.
export type IntrospectionResult = {
  active: boolean;
  subject?: string;
  accountId?: string;
  personId?: string;
  expiresAt?: string;
};

export type PersonSummary = {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  primaryEmail?: string | null;
  archivedAt?: string | null;
};

export type OrganizationSummary = {
  id: string;
  parentId?: string | null;
  type: "DISTRICT" | "CLUB" | "OTHER";
  code: string;
  name: string;
  status: string;
};

export type ModuleInstallationSummary = {
  moduleId: string;
  organizationId: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  configuration?: Record<string, unknown> | null;
};
