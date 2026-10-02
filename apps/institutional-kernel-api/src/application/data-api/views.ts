import type {
  Appointment,
  InstitutionalPeriod,
  Organization,
  OrganizationMembership,
  Person,
  PositionDefinition,
} from "@prisma/client";

/**
 * Explicit projections of the Data API v1 (kernel-openapi.yaml, "Data API v1
 * views"). Nothing here spreads a Prisma row: a column added to the schema
 * never leaks to developer apps unless it is added to a view on purpose.
 */

const iso = (date: Date | string | null | undefined): string | null =>
  date ? new Date(date).toISOString() : null;

/** `format: date` (birthDate is stored as @db.Date). */
const isoDate = (date: Date | string | null | undefined): string | null =>
  date ? new Date(date).toISOString().slice(0, 10) : null;

export type OrganizationView = {
  id: string;
  type: Organization["type"];
  code: string;
  name: string;
  slug: string;
  status: Organization["status"];
  parentId: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  logoUrl: string | null;
  description: string | null;
  updatedAt: string;
};

export function toOrganizationView(org: Organization): OrganizationView {
  return {
    id: org.id,
    type: org.type,
    code: org.code,
    name: org.name,
    slug: org.slug,
    status: org.status,
    parentId: org.parentId ?? null,
    countryCode: org.countryCode ?? null,
    region: org.region ?? null,
    city: org.city ?? null,
    timezone: org.timezone ?? null,
    logoUrl: org.logoUrl ?? null,
    description: org.description ?? null,
    updatedAt: iso(org.updatedAt)!,
  };
}

export type PersonContact = {
  email: string | null;
  phone: string | null;
  birthDate: string | null;
};

export type PersonView = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  updatedAt: string;
} & Partial<PersonContact>;

export function displayNameOf(
  person: Pick<Person, "displayName" | "firstName" | "lastName">,
): string {
  return (
    person.displayName?.trim() ||
    `${person.firstName} ${person.lastName}`.trim()
  );
}

/**
 * Contact fields are only present with kernel.service.persons.contact.read.
 * Without it they are omitted, not null: "null" would read as "we know this
 * person has no phone", which the app is not entitled to know either.
 */
export function toPersonView(
  person: Person,
  options: { contact: boolean },
): PersonView {
  const view: PersonView = {
    id: person.id,
    displayName: displayNameOf(person),
    firstName: person.firstName,
    lastName: person.lastName,
    avatarUrl: person.avatarUrl ?? null,
    updatedAt: iso(person.updatedAt)!,
  };
  if (options.contact) {
    view.email = person.primaryEmail ?? null;
    view.phone = person.phone ?? null;
    view.birthDate = isoDate(person.birthDate);
  }
  return view;
}

export type MemberView = {
  membershipId: string;
  organizationId: string;
  personId: string;
  status: OrganizationMembership["status"];
  joinedAt: string | null;
  memberNumber: string | null;
  person: PersonView;
  updatedAt: string;
};

/**
 * `updatedAt` of a member is the later of the membership's and the person's,
 * so a client that stores max(updatedAt) as its next `updatedSince` also
 * picks up a member whose name or contact data changed.
 */
export function toMemberView(
  membership: OrganizationMembership & { person: Person },
  options: { contact: boolean },
): MemberView {
  const updatedAt = Math.max(
    new Date(membership.updatedAt).getTime(),
    new Date(membership.person.updatedAt).getTime(),
  );
  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    personId: membership.personId,
    status: membership.status,
    joinedAt: iso(membership.joinedAt),
    memberNumber: membership.memberNumber ?? null,
    person: toPersonView(membership.person, options),
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

export type PersonMembershipView = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: Organization["type"];
  status: OrganizationMembership["status"];
  joinedAt: string | null;
  endedAt: string | null;
};

export function toPersonMembershipView(
  membership: OrganizationMembership & { organization: Organization },
): PersonMembershipView {
  return {
    membershipId: membership.id,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationType: membership.organization.type,
    status: membership.status,
    joinedAt: iso(membership.joinedAt),
    endedAt: iso(membership.endedAt),
  };
}

export type AuthorityView = {
  appointmentId: string;
  organizationId: string;
  periodId: string;
  positionCode: string;
  positionName: string;
  status: Appointment["status"];
  startsAt: string | null;
  endsAt: string | null;
  person: { id: string; displayName: string; avatarUrl: string | null };
};

/** Authorities are public within the app's scope: never contact data. */
export function toAuthorityView(
  appointment: Appointment & {
    positionDefinition: PositionDefinition;
    membership: OrganizationMembership & { person: Person };
  },
): AuthorityView {
  const person = appointment.membership.person;
  return {
    appointmentId: appointment.id,
    organizationId: appointment.organizationId,
    periodId: appointment.periodId,
    positionCode: appointment.positionDefinition.code,
    positionName: appointment.positionDefinition.name,
    status: appointment.status,
    startsAt: iso(appointment.startsAt),
    endsAt: iso(appointment.endsAt),
    person: {
      id: person.id,
      displayName: displayNameOf(person),
      avatarUrl: person.avatarUrl ?? null,
    },
  };
}

export type PeriodView = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: InstitutionalPeriod["status"];
  startDate: string;
  endDate: string;
};

export function toPeriodView(period: InstitutionalPeriod): PeriodView {
  return {
    id: period.id,
    organizationId: period.organizationId,
    code: period.code,
    name: period.name,
    status: period.status,
    startDate: iso(period.startDate)!,
    endDate: iso(period.endDate)!,
  };
}
