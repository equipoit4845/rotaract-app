import type {
  Appointment,
  InstitutionalPeriod,
  Organization,
  OrganizationMembership,
  Person,
  PositionDefinition,
} from "@prisma/client";

import {
  toAuthorityView,
  toMemberView,
  toOrganizationView,
  toPeriodView,
  toPersonMembershipView,
  toPersonView,
} from "./views";

const person: Person = {
  id: "p1",
  firstName: "Ana",
  lastName: "García",
  displayName: null,
  primaryEmail: "ana@example.test",
  phone: "+54 351 000",
  birthDate: new Date("1999-04-03T00:00:00Z"),
  avatarUrl: null,
  externalReference: "legacy-42",
  metadata: { secret: true },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  archivedAt: null,
};

const organization: Organization = {
  id: "o1",
  parentId: "d1",
  type: "CLUB",
  code: "C1",
  name: "Club Uno",
  slug: "club-uno",
  status: "ACTIVE",
  countryCode: "AR",
  region: null,
  city: "Córdoba",
  timezone: "America/Argentina/Cordoba",
  contactEmail: "club@example.test",
  contactPhone: "123",
  logoUrl: null,
  foundedAt: null,
  description: null,
  attributes: { internal: 1 },
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
  archivedAt: null,
};

const membership: OrganizationMembership = {
  id: "m1",
  organizationId: "o1",
  personId: "p1",
  memberNumber: "7",
  status: "ACTIVE",
  joinedAt: new Date("2026-01-05T00:00:00Z"),
  statusChangedAt: new Date("2026-01-05T00:00:00Z"),
  endedAt: null,
  internalNotes: "do not leak",
  metadata: null,
  createdAt: new Date("2026-01-05T00:00:00Z"),
  updatedAt: new Date("2026-01-10T00:00:00Z"),
};

describe("Data API views", () => {
  it("omits contact fields (not null) without the contact scope", () => {
    const view = toPersonView(person, { contact: false });
    expect(view).toEqual({
      id: "p1",
      displayName: "Ana García",
      firstName: "Ana",
      lastName: "García",
      avatarUrl: null,
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    for (const key of ["email", "phone", "birthDate"])
      expect(Object.prototype.hasOwnProperty.call(view, key)).toBe(false);
  });

  it("adds email, phone and birthDate (as a date) with the contact scope", () => {
    expect(toPersonView(person, { contact: true })).toMatchObject({
      email: "ana@example.test",
      phone: "+54 351 000",
      birthDate: "1999-04-03",
    });
    expect(
      toPersonView(
        { ...person, primaryEmail: null, phone: null, birthDate: null },
        { contact: true },
      ),
    ).toMatchObject({ email: null, phone: null, birthDate: null });
  });

  it("projects organizations without internal columns", () => {
    const view = toOrganizationView(organization);
    expect(Object.keys(view).sort()).toEqual(
      [
        "id",
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
        "updatedAt",
      ].sort(),
    );
  });

  it("dates a member by the later of membership and person", () => {
    const view = toMemberView({ ...membership, person }, { contact: false });
    expect(view.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(view.person).not.toHaveProperty("email");
    expect(view).not.toHaveProperty("internalNotes");
    expect(view).toMatchObject({ membershipId: "m1", memberNumber: "7" });
  });

  it("projects person memberships, authorities and periods", () => {
    expect(toPersonMembershipView({ ...membership, organization })).toEqual({
      membershipId: "m1",
      organizationId: "o1",
      organizationName: "Club Uno",
      organizationType: "CLUB",
      status: "ACTIVE",
      joinedAt: "2026-01-05T00:00:00.000Z",
      endedAt: null,
    });

    const appointment = {
      id: "a1",
      organizationId: "o1",
      membershipId: "m1",
      periodId: "per1",
      positionDefinitionId: "pos1",
      status: "ACTIVE",
      startsAt: null,
      endsAt: null,
      positionDefinition: {
        code: "CLUB_PRESIDENT",
        name: "Presidente",
      } as PositionDefinition,
      membership: { ...membership, person },
    } as unknown as Appointment & {
      positionDefinition: PositionDefinition;
      membership: OrganizationMembership & { person: Person };
    };
    const authority = toAuthorityView(appointment);
    expect(authority.person).toEqual({
      id: "p1",
      displayName: "Ana García",
      avatarUrl: null,
    });
    expect(authority).toMatchObject({
      positionCode: "CLUB_PRESIDENT",
      positionName: "Presidente",
    });

    const period = {
      id: "per1",
      organizationId: "o1",
      code: "2026-27",
      name: "Período 2026-27",
      sequence: 1,
      startDate: new Date("2026-07-01T00:00:00Z"),
      endDate: new Date("2027-06-30T00:00:00Z"),
      status: "ACTIVE",
    } as InstitutionalPeriod;
    expect(toPeriodView(period)).toEqual({
      id: "per1",
      organizationId: "o1",
      code: "2026-27",
      name: "Período 2026-27",
      status: "ACTIVE",
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2027-06-30T00:00:00.000Z",
    });
  });
});
