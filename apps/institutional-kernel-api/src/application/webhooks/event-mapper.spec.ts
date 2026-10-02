import { EVENT_TYPES } from "./catalog";
import {
  CONTACT_SCOPE,
  MAPPED_INTERNAL_TYPES,
  planPublicEvent,
  publicEventId,
  renderForApp,
  resolvePublicEvent,
  type OutboxLike,
} from "./event-mapper";

const at = new Date("2026-10-02T21:15:04.000Z");
const message = (eventType: string, payload: object = {}): OutboxLike => ({
  id: "cm1outbox",
  eventType,
  payload,
  occurredAt: at,
  aggregateId: "agg_1",
});

const person = {
  id: "per_1",
  firstName: "Ana",
  lastName: "Pérez",
  displayName: null,
  primaryEmail: "ana@example.test",
  phone: "+595 981 000000",
  birthDate: new Date("2000-01-02"),
  avatarUrl: null,
  updatedAt: at,
};
const membership = {
  id: "mem_1",
  organizationId: "club_a",
  personId: "per_1",
  status: "ACTIVE",
  joinedAt: at,
  endedAt: null,
  memberNumber: "7",
  internalNotes: "nunca sale",
  updatedAt: at,
  person,
};

/** Minimal Prisma double: only what resolvePublicEvent reads. */
function db(overrides: Record<string, unknown> = {}) {
  const find = (value: unknown) => ({ findUnique: async () => value });
  return {
    organizationMembership: find(membership),
    appointment: find(null),
    organization: find(null),
    person: find(null),
    institutionalPeriod: find(null),
    ...overrides,
  } as any;
}

describe("event mapping (internal outbox → public catalog)", () => {
  it.each([
    ["kernel.membership.created.v1", {}, "membership.created.v1"],
    ["kernel.membership.activated.v1", {}, "membership.activated.v1"],
    [
      "kernel.membership.status-changed.v1",
      { toStatus: "INACTIVE" },
      "membership.ended.v1",
    ],
    [
      "kernel.membership.status-changed.v1",
      { toStatus: "GRADUATED" },
      "membership.ended.v1",
    ],
    ["kernel.membership.transferred.v1", {}, "membership.ended.v1"],
    ["kernel.appointment.activated.v1", {}, "appointment.activated.v1"],
    ["kernel.appointment.ended.v1", {}, "appointment.ended.v1"],
    ["kernel.appointment.revoked.v1", {}, "appointment.ended.v1"],
    ["kernel.organization.updated.v1", {}, "organization.updated.v1"],
    ["kernel.organization.deactivated.v1", {}, "organization.updated.v1"],
    ["kernel.organization.moved.v1", {}, "organization.updated.v1"],
    ["kernel.organization.archived.v1", {}, "organization.archived.v1"],
    ["kernel.person.updated.v1", {}, "person.updated.v1"],
    ["kernel.period.created.v1", {}, "period.created.v1"],
  ])("%s %j → %s", (internal, payload, expected) => {
    expect(planPublicEvent(message(internal, payload))?.type).toBe(expected);
  });

  it.each([
    ["kernel.membership.status-changed.v1", { toStatus: "ON_LEAVE" }],
    ["kernel.account.registered.v1", {}],
    ["kernel.role-assignment.granted.v1", {}],
    ["kernel.appointment.created.v1", {}],
  ])("does not publish %s %j", (internal, payload) => {
    expect(planPublicEvent(message(internal, payload))).toBeNull();
  });

  it("only maps to types in the catalog, and the prefilter covers them all", () => {
    for (const internal of MAPPED_INTERNAL_TYPES) {
      const plan = planPublicEvent(message(internal, { toStatus: "INACTIVE" }));
      expect(plan).not.toBeNull();
      expect(EVENT_TYPES).toContain(plan!.type);
    }
  });

  it("uses a stable evt_ id derived from the outbox row", () => {
    expect(publicEventId("cm1abc")).toBe("evt_cm1abc");
  });
});

describe("per-app rendering (scope, organization tree, PII)", () => {
  const app = (scopes: string[], orgs = ["district", "club_a"]) => ({
    scopes,
    organizationIds: new Set(orgs),
  });

  it("renders a membership activation with the Data API MemberView", async () => {
    const event = await resolvePublicEvent(
      db(),
      message("kernel.membership.activated.v1", {
        membershipId: "mem_1",
        fromStatus: "PENDING",
      }),
    );
    const rendered = renderForApp(
      event!,
      app(["kernel.service.memberships.read"]),
    );
    expect(rendered).not.toBeNull();
    const body = JSON.parse(rendered!.body);
    expect(body).toEqual({
      id: "evt_cm1outbox",
      type: "membership.activated.v1",
      createdAt: at.toISOString(),
      organizationId: "club_a",
      data: {
        membership: expect.objectContaining({
          membershipId: "mem_1",
          status: "ACTIVE",
          person: expect.objectContaining({ displayName: "Ana Pérez" }),
        }),
        previousStatus: "PENDING",
      },
    });
    // No contact data without the contact scope; never internal notes.
    expect(rendered!.body).not.toContain("ana@example.test");
    expect(rendered!.body).not.toContain("981");
    expect(rendered!.body).not.toContain("nunca sale");
    expect(body.data.membership.person).not.toHaveProperty("email");
  });

  it("includes contact data only with kernel.service.persons.contact.read", async () => {
    const event = await resolvePublicEvent(
      db(),
      message("kernel.membership.activated.v1", { membershipId: "mem_1" }),
    );
    const rendered = renderForApp(
      event!,
      app(["kernel.service.memberships.read", CONTACT_SCOPE]),
    );
    expect(JSON.parse(rendered!.body).data.membership.person).toMatchObject({
      email: "ana@example.test",
      phone: "+595 981 000000",
      birthDate: "2000-01-02",
    });
  });

  it("drops events without the required scope or outside the app's tree", async () => {
    const event = await resolvePublicEvent(
      db(),
      message("kernel.membership.activated.v1", { membershipId: "mem_1" }),
    );
    expect(
      renderForApp(event!, app(["kernel.service.periods.read"])),
    ).toBeNull();
    expect(
      renderForApp(
        event!,
        app(["kernel.service.memberships.read"], ["club_b"]),
      ),
    ).toBeNull();
  });

  it("adds reason and endedAt to membership.ended.v1", async () => {
    const ended = {
      ...membership,
      status: "INACTIVE",
      endedAt: new Date("2026-10-03T00:00:00Z"),
    };
    const event = await resolvePublicEvent(
      db({ organizationMembership: { findUnique: async () => ended } }),
      message("kernel.membership.status-changed.v1", {
        membershipId: "mem_1",
        fromStatus: "ACTIVE",
        toStatus: "INACTIVE",
      }),
    );
    const body = JSON.parse(
      renderForApp(event!, app(["kernel.service.memberships.read"]))!.body,
    );
    expect(body.data).toMatchObject({
      previousStatus: "ACTIVE",
      reason: "INACTIVE",
      endedAt: "2026-10-03T00:00:00.000Z",
    });
  });

  it("publishes a revoked appointment only if it had taken office", async () => {
    const appointment = (activatedAt: Date | null) => ({
      id: "app_1",
      organizationId: "club_a",
      periodId: "per_2026",
      status: "REVOKED",
      startsAt: null,
      endsAt: null,
      activatedAt,
      positionDefinition: { code: "CLUB_PRESIDENT", name: "Presidente/a" },
      membership: { ...membership, person },
    });
    const revoked = message("kernel.appointment.revoked.v1", {
      appointmentId: "app_1",
    });
    expect(
      await resolvePublicEvent(
        db({ appointment: { findUnique: async () => appointment(null) } }),
        revoked,
      ),
    ).toBeNull();
    const event = await resolvePublicEvent(
      db({ appointment: { findUnique: async () => appointment(at) } }),
      revoked,
    );
    const body = JSON.parse(
      renderForApp(event!, app(["kernel.service.authorities.read"]))!.body,
    );
    expect(body.type).toBe("appointment.ended.v1");
    expect(body.data.authority).toMatchObject({
      appointmentId: "app_1",
      positionCode: "CLUB_PRESIDENT",
      person: { id: "per_1", displayName: "Ana Pérez", avatarUrl: null },
    });
    expect(body.data.authority.person).not.toHaveProperty("email");
  });

  it("hides person.updated.v1 when only contact fields changed and the app can't see them", async () => {
    const withMemberships = {
      ...person,
      memberships: [
        { organizationId: "club_old", status: "INACTIVE" },
        { organizationId: "club_a", status: "ACTIVE" },
      ],
    };
    const reader = db({ person: { findUnique: async () => withMemberships } });
    const phoneOnly = await resolvePublicEvent(
      reader,
      message("kernel.person.updated.v1", {
        personId: "per_1",
        changedFields: ["phone"],
      }),
    );
    expect(
      renderForApp(phoneOnly!, app(["kernel.service.persons.read"])),
    ).toBeNull();
    const withContact = renderForApp(
      phoneOnly!,
      app(["kernel.service.persons.read", CONTACT_SCOPE]),
    );
    expect(JSON.parse(withContact!.body).data.changedFields).toEqual(["phone"]);

    const named = await resolvePublicEvent(
      reader,
      message("kernel.person.updated.v1", {
        personId: "per_1",
        changedFields: ["lastName", "primaryEmail", "metadata"],
      }),
    );
    const body = JSON.parse(
      renderForApp(named!, app(["kernel.service.persons.read"]))!.body,
    );
    // Current memberships first; email never mentioned without the scope.
    expect(body.organizationId).toBe("club_a");
    expect(body.data.changedFields).toEqual(["lastName"]);
    expect(body.data.person).not.toHaveProperty("email");
  });

  it("ignores organization updates that only touched non-public columns", async () => {
    const organization = {
      id: "club_a",
      type: "CLUB",
      code: "A",
      name: "Club A",
      slug: "a",
      status: "ACTIVE",
      parentId: "district",
      countryCode: "PY",
      region: null,
      city: null,
      timezone: null,
      logoUrl: null,
      description: null,
      contactEmail: "club@example.test",
      updatedAt: at,
    };
    const reader = db({
      organization: { findUnique: async () => organization },
    });
    expect(
      await resolvePublicEvent(
        reader,
        message("kernel.organization.updated.v1", {
          organizationId: "club_a",
          changedFields: ["contactEmail"],
        }),
      ),
    ).toBeNull();
    const event = await resolvePublicEvent(
      reader,
      message("kernel.organization.updated.v1", {
        organizationId: "club_a",
        changedFields: ["name", "contactPhone"],
      }),
    );
    const rendered = renderForApp(
      event!,
      app(["kernel.service.organizations.read"]),
    );
    expect(JSON.parse(rendered!.body).data.changedFields).toEqual(["name"]);
    expect(rendered!.body).not.toContain("club@example.test");
  });
});
