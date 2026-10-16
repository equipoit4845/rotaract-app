/** Views of the data API v1 (kernel-openapi.yaml, tag Service). */

export type OrganizationType = "DISTRICT" | "CLUB" | "OTHER";
export type OrganizationStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type MembershipStatus =
  "PENDING" | "ACTIVE" | "ON_LEAVE" | "INACTIVE" | "GRADUATED" | "TRANSFERRED";
export type PeriodStatus =
  "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED";
export type AppointmentStatus =
  "NOMINATED" | "ELECTED" | "ACTIVE" | "ENDED" | "REVOKED";
export type ScopeType = "PLATFORM" | "ORGANIZATION" | "ORGANIZATION_TREE";

export type OrganizationView = {
  id: string;
  type: OrganizationType;
  code: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  parentId: string | null;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  timezone?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  updatedAt: string;
};

/** `email`, `phone` and `birthDate` only exist with `kernel.service.persons.contact.read`. */
export type PersonView = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  updatedAt: string;
};

export type MemberView = {
  membershipId: string;
  organizationId: string;
  personId: string;
  status: MembershipStatus;
  joinedAt?: string | null;
  memberNumber?: string | null;
  person: PersonView;
  updatedAt: string;
};

export type AuthorityView = {
  appointmentId: string;
  organizationId: string;
  periodId: string;
  positionCode: string;
  positionName: string;
  status: AppointmentStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  person: { id: string; displayName: string; avatarUrl?: string | null };
};

export type PeriodView = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: PeriodStatus;
  startDate: string;
  endDate: string;
};

export type PersonMembershipView = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrganizationType;
  status: MembershipStatus;
  joinedAt?: string | null;
  endedAt?: string | null;
};

/** A permission a position grants. */
export type PositionPermission = {
  code: string;
  name: string;
  moduleId?: string | null;
};

/**
 * A position (cargo) that can be held in an organization. Decide what a
 * person may do with `permissions.check`, not with `code`: codes of
 * positions created by organizations or modules are not stable names.
 */
export type PositionView = {
  code: string;
  name: string;
  description?: string | null;
  organizationType: OrganizationType;
  ownerOrganizationId?: string | null;
  /** MODULE: created by a module's installation. */
  source: "SYSTEM" | "ORGANIZATION" | "MODULE";
  moduleId?: string | null;
  isSingletonPerPeriod: boolean;
  /** Where its permissions apply: the position's club, or the district and its clubs. */
  scope: "ORGANIZATION" | "ORGANIZATION_TREE";
  archived: boolean;
  /** Only with `includePermissions` (list) or in `positions.get`. */
  permissions?: PositionPermission[];
};

/** Every permission a person holds in an organization. */
export type PersonPermissions = {
  organizationId: string;
  personId: string;
  permissions: string[];
  evaluatedAt: string;
};

export type AuthorizationDecision = {
  allowed: boolean;
  decisionId: string;
  subjectId: string;
  permission: string;
  matchedAssignments?: string[];
  reasonCodes?: string[];
  evaluatedAt: string;
  cacheUntil?: string | null;
};

/** OIDC discovery document (`{issuer}/.well-known/openid-configuration`). */
export type OpenIdConfiguration = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
  jwks_uri: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
  [key: string]: unknown;
};

export type UserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string | null;
  email?: string;
  email_verified?: boolean;
  memberships?: Array<{
    organizationId: string;
    organizationName: string;
    organizationType: string;
    status: string;
  }>;
  positions?: Array<{
    organizationId: string;
    positionCode: string;
    positionName: string;
    periodId: string;
  }>;
  [claim: string]: unknown;
};

/** Verified ID token claims. */
export type IdTokenClaims = UserInfo & {
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  azp?: string;
  nonce?: string;
  auth_time?: number;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
};

export type TokenSet = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope: string;
  idToken?: string;
  refreshToken?: string;
};
