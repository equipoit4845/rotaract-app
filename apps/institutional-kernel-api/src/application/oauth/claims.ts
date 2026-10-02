import type { PrismaService } from "../../infrastructure/prisma/prisma.service";

/** Membership states a third-party app may see (docs/11 §Claims por scope). */
const VISIBLE_MEMBERSHIP_STATUSES = ["ACTIVE", "ON_LEAVE"] as const;

export type OidcClaims = {
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
};

/**
 * The app's organization and all of its descendants: the only
 * organizations whose memberships and positions the app may learn about
 * (data minimization: a club app sees that club only).
 */
export async function organizationSubtree(
  prisma: PrismaService,
  rootId: string,
): Promise<string[]> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await prisma.organization.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/**
 * Claims for the granted scopes (ID token and userinfo), excluding `sub`
 * which the caller sets. Scopes the person did not grant produce nothing.
 */
export async function buildClaims(
  prisma: PrismaService,
  input: { personId: string; scopes: string[]; appOrganizationId: string },
): Promise<OidcClaims> {
  const { personId, scopes } = input;
  const has = (scope: string) => scopes.includes(scope);
  const claims: OidcClaims = {};

  if (has("profile")) {
    const person = await prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: {
        firstName: true,
        lastName: true,
        displayName: true,
        avatarUrl: true,
      },
    });
    claims.name =
      person.displayName?.trim() ||
      `${person.firstName} ${person.lastName}`.trim();
    claims.given_name = person.firstName;
    claims.family_name = person.lastName;
    claims.picture = person.avatarUrl ?? null;
  }

  if (has("email")) {
    const account = await prisma.userAccount.findUnique({
      where: { personId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (account) {
      claims.email = account.email;
      claims.email_verified = account.emailVerifiedAt !== null;
    }
  }

  if (has("memberships") || has("positions")) {
    const tree = await organizationSubtree(prisma, input.appOrganizationId);

    if (has("memberships")) {
      const memberships = await prisma.organizationMembership.findMany({
        where: {
          personId,
          organizationId: { in: tree },
          status: { in: [...VISIBLE_MEMBERSHIP_STATUSES] },
        },
        include: {
          organization: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      claims.memberships = memberships.map((membership) => ({
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationType: membership.organization.type,
        status: membership.status,
      }));
    }

    if (has("positions")) {
      const appointments = await prisma.appointment.findMany({
        where: {
          status: "ACTIVE",
          organizationId: { in: tree },
          membership: { personId },
        },
        include: {
          positionDefinition: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      claims.positions = appointments.map((appointment) => ({
        organizationId: appointment.organizationId,
        positionCode: appointment.positionDefinition.code,
        positionName: appointment.positionDefinition.name,
        periodId: appointment.periodId,
      }));
    }
  }

  return claims;
}
