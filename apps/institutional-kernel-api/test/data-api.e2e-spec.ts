import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";

import {
  hashClientSecret,
  newClientId,
  newClientSecret,
} from "../src/application/developer-apps/credentials";
import { createTestApp, e2eTag, testPrisma } from "./support/test-app";

/**
 * E4 · Data API v1 against the real stack (docs/12-data-api-and-sdks.md):
 * projections, cursor pagination, updatedSince, ETag/304, contact-field
 * gating and confinement of each app to its organization tree. Request AND
 * response OpenAPI validation are on, so every 200 here also proves the
 * body matches the contract's view schemas.
 */
describe("Data API v1 E2E (E4)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const base = "/api/kernel/v1";
  const previousEnv = {
    runtime: process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION,
    response: process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION,
  };

  const T0 = new Date("2026-01-01T00:00:00.000Z");
  const READ_SCOPES = [
    "kernel.service.organizations.read",
    "kernel.service.persons.read",
    "kernel.service.memberships.read",
    "kernel.service.authorities.read",
    "kernel.service.periods.read",
  ];
  const CONTACT = "kernel.service.persons.contact.read";

  let districtId: string;
  let clubA: string;
  let clubB: string;
  /** Five members of club A; [0] is also a member of club B. */
  let membersA: string[] = [];
  let memberB: string;
  let outsider: string;
  const personIds: string[] = [];
  const appIds: string[] = [];

  let clubToken: string;
  let clubContactToken: string;
  let districtToken: string;

  async function createApp(organizationId: string, scopes: string[]) {
    const clientId = newClientId();
    const { secret, hint } = newClientSecret();
    const created = await prisma.developerApp.create({
      data: {
        clientId,
        name: `E4 ${tag}`,
        type: "CONFIDENTIAL",
        organizationId,
        ownerPersonId: outsider,
        grantTypes: ["client_credentials"],
        scopes,
        redirectUris: [],
        secrets: {
          create: { secretHash: await hashClientSecret(secret), hint },
        },
      },
    });
    appIds.push(created.id);
    const token = await request(http)
      .post(`${base}/oauth/token`)
      .type("form")
      .send({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: secret,
      })
      .expect(200);
    return token.body.access_token as string;
  }

  const get = (token: string, url: string) =>
    request(http)
      .get(`${base}/service${url}`)
      .set("authorization", `Bearer ${token}`);

  const batch = (token: string, ids: string[]) =>
    request(http)
      .post(`${base}/service/persons/batch`)
      .set("authorization", `Bearer ${token}`)
      .send({ ids });

  async function person(label: string, extra: object = {}) {
    const created = await prisma.person.create({
      data: {
        firstName: label,
        lastName: tag,
        primaryEmail: `${label}-${tag}@example.test`,
        phone: "+54 351 555 0000",
        birthDate: new Date("2000-05-06T00:00:00.000Z"),
        externalReference: `ext-${label}`,
        metadata: { internal: true },
        updatedAt: T0,
        ...extra,
      },
    });
    personIds.push(created.id);
    return created.id;
  }

  async function organization(
    type: "DISTRICT" | "CLUB",
    label: string,
    parentId?: string,
  ) {
    const created = await prisma.organization.create({
      data: {
        type,
        code: `${label}-${tag}`,
        name: `${label} ${tag}`,
        slug: `${label.toLowerCase()}-${tag}`,
        status: "ACTIVE",
        parentId,
        contactEmail: "internal@example.test",
        attributes: { internal: true },
      },
    });
    return created.id;
  }

  const membership = (organizationId: string, personId: string) =>
    prisma.organizationMembership.create({
      data: {
        organizationId,
        personId,
        status: "ACTIVE",
        joinedAt: T0,
        internalNotes: "private",
        updatedAt: T0,
      },
    });

  async function period(organizationId: string) {
    await prisma.institutionalPeriod.create({
      data: {
        organizationId,
        code: "2025-26",
        name: "Período 2025-26",
        sequence: 1,
        startDate: new Date("2025-07-01"),
        endDate: new Date("2026-06-30"),
        status: "CLOSED",
      },
    });
    return prisma.institutionalPeriod.create({
      data: {
        organizationId,
        code: "2026-27",
        name: "Período 2026-27",
        sequence: 2,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2027-06-30"),
        status: "ACTIVE",
      },
    });
  }

  async function appoint(
    organizationId: string,
    membershipId: string,
    periodId: string,
    positionCode: string,
  ) {
    const position = await prisma.positionDefinition.findUniqueOrThrow({
      where: { code: positionCode },
    });
    return prisma.appointment.create({
      data: {
        organizationId,
        membershipId,
        periodId,
        positionDefinitionId: position.id,
        status: "ACTIVE",
        startsAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
  }

  beforeAll(async () => {
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION = "true";
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();

    districtId = await organization("DISTRICT", "D");
    clubA = await organization("CLUB", "A", districtId);
    clubB = await organization("CLUB", "B", districtId);

    outsider = await person("outsider");
    const membershipsA = [];
    for (let i = 0; i < 5; i++) {
      const id = await person(`a${i}`);
      membersA.push(id);
      membershipsA.push(await membership(clubA, id));
    }
    memberB = await person("b0");
    const membershipB = await membership(clubB, memberB);
    await membership(clubB, membersA[0]);

    const [periodD, periodA, periodB] = await Promise.all(
      [districtId, clubA, clubB].map(period),
    );
    // A district position held through a membership in a descendant club.
    await appoint(districtId, membershipB.id, periodD.id, "DISTRICT_RDR");
    await appoint(clubA, membershipsA[0].id, periodA.id, "CLUB_PRESIDENT");
    await appoint(clubB, membershipB.id, periodB.id, "CLUB_PRESIDENT");

    clubToken = await createApp(clubA, READ_SCOPES);
    clubContactToken = await createApp(clubA, [...READ_SCOPES, CONTACT]);
    districtToken = await createApp(districtId, [...READ_SCOPES, CONTACT]);
  });

  afterAll(async () => {
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    // secrets cascade with the app
    await prisma.developerApp.deleteMany({ where: { id: { in: appIds } } });
    await prisma.appointment.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.institutionalPeriod.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.kernelAuditLog.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [clubA, clubB].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({ where: { id: districtId } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
    await app.close();
    for (const [key, value] of [
      ["KERNEL_OPENAPI_RUNTIME_VALIDATION", previousEnv.runtime],
      ["KERNEL_OPENAPI_RESPONSE_VALIDATION", previousEnv.response],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const ids = (items: Array<{ id: string }>) =>
    items.map((item) => item.id).sort();

  it("lists only the club for a club app, and the tree for a district app", async () => {
    const club = await get(clubToken, "/organizations").expect(200);
    expect(ids(club.body.items)).toEqual([clubA]);
    expect(club.body.pageInfo).toEqual({ hasMore: false, nextCursor: null });

    const district = await get(districtToken, "/organizations").expect(200);
    expect(ids(district.body.items)).toEqual([districtId, clubA, clubB].sort());
    const clubs = await get(districtToken, "/organizations?type=CLUB").expect(
      200,
    );
    expect(ids(clubs.body.items)).toEqual([clubA, clubB].sort());
    const children = await get(
      districtToken,
      `/organizations?parentId=${districtId}&limit=1`,
    ).expect(200);
    expect(children.body.items).toHaveLength(1);
    expect(children.body.pageInfo.hasMore).toBe(true);

    for (const item of district.body.items) {
      expect(item).not.toHaveProperty("contactEmail");
      expect(item).not.toHaveProperty("attributes");
      expect(item).not.toHaveProperty("createdAt");
    }
  });

  it("returns OrganizationView from serviceGetOrganization", async () => {
    const response = await get(clubToken, `/organizations/${clubA}`).expect(
      200,
    );
    expect(response.body).toMatchObject({
      id: clubA,
      type: "CLUB",
      parentId: districtId,
      status: "ACTIVE",
    });
    expect(response.body).not.toHaveProperty("contactEmail");
    expect(response.body).not.toHaveProperty("archivedAt");
    await get(clubToken, `/organizations/${clubB}`).expect(403);
  });

  it("paginates members with a stable cursor across pages", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = cursor
        ? `?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "?limit=2";
      const page = await get(
        clubToken,
        `/organizations/${clubA}/members${query}`,
      ).expect(200);
      pages++;
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      seen.push(
        ...page.body.items.map((item: { personId: string }) => item.personId),
      );
      cursor = page.body.pageInfo.nextCursor;
      expect(page.body.pageInfo.hasMore).toBe(cursor !== null);
    } while (cursor);
    expect(pages).toBe(3);
    // every member exactly once, even though all share the same updatedAt
    expect(seen).toHaveLength(5);
    expect([...seen].sort()).toEqual([...membersA].sort());

    // same cursor → same page
    const first = await get(
      clubToken,
      `/organizations/${clubA}/members?limit=2`,
    ).expect(200);
    const next = first.body.pageInfo.nextCursor;
    const again = [
      await get(
        clubToken,
        `/organizations/${clubA}/members?limit=2&cursor=${encodeURIComponent(next)}`,
      ).expect(200),
      await get(
        clubToken,
        `/organizations/${clubA}/members?limit=2&cursor=${encodeURIComponent(next)}`,
      ).expect(200),
    ];
    expect(again[0].body).toEqual(again[1].body);

    await get(
      clubToken,
      `/organizations/${clubA}/members?cursor=garbage`,
    ).expect(400);
    await get(clubToken, `/organizations/${clubA}/members?limit=101`).expect(
      400,
    );
  });

  it("omits contact fields without the contact scope and includes them with it", async () => {
    const without = await get(
      clubToken,
      `/organizations/${clubA}/members?limit=100`,
    ).expect(200);
    for (const item of without.body.items) {
      for (const field of ["email", "phone", "birthDate"])
        expect(item.person).not.toHaveProperty(field);
      expect(item).not.toHaveProperty("internalNotes");
    }

    const withContact = await get(
      clubContactToken,
      `/organizations/${clubA}/members?limit=100`,
    ).expect(200);
    const first = withContact.body.items.find(
      (item: { personId: string }) => item.personId === membersA[0],
    );
    expect(first.person).toMatchObject({
      email: `a0-${tag}@example.test`,
      phone: "+54 351 555 0000",
      birthDate: "2000-05-06",
    });
  });

  it("filters members by updatedSince (membership or person changes)", async () => {
    const since = T0.toISOString();
    const none = await get(
      clubToken,
      `/organizations/${clubA}/members?updatedSince=${since}`,
    ).expect(200);
    expect(none.body.items).toEqual([]);

    await prisma.organizationMembership.updateMany({
      where: { organizationId: clubA, personId: membersA[2] },
      data: { memberNumber: `N-${tag}` },
    });
    await prisma.person.update({
      where: { id: membersA[3] },
      data: { lastName: `${tag}-renamed` },
    });
    const changed = await get(
      clubToken,
      `/organizations/${clubA}/members?updatedSince=${since}`,
    ).expect(200);
    expect(
      changed.body.items
        .map((item: { personId: string }) => item.personId)
        .sort(),
    ).toEqual([membersA[2], membersA[3]].sort());
    for (const item of changed.body.items)
      expect(new Date(item.updatedAt).getTime()).toBeGreaterThan(T0.getTime());

    const orgs = await get(
      districtToken,
      `/organizations?updatedSince=${new Date(Date.now() + 60_000).toISOString()}`,
    ).expect(200);
    expect(orgs.body.items).toEqual([]);
  });

  it("answers 304 to If-None-Match with the current weak ETag", async () => {
    const url = `/organizations/${clubA}/members?limit=3`;
    const first = await get(clubToken, url).expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"[0-9a-f]{40}"$/);

    const cached = await get(clubToken, url)
      .set("if-none-match", etag)
      .expect(304);
    expect(cached.text ?? "").toBe("");

    await get(clubToken, url).set("if-none-match", 'W/"stale"').expect(200);

    const orgs = await get(districtToken, "/organizations").expect(200);
    await get(districtToken, "/organizations")
      .set("if-none-match", orgs.headers.etag)
      .expect(304);

    const personUrl = `/persons/${membersA[1]}`;
    const personResponse = await get(clubToken, personUrl).expect(200);
    await get(clubToken, personUrl)
      .set("if-none-match", personResponse.headers.etag)
      .expect(304);
    // a change invalidates the tag
    await prisma.person.update({
      where: { id: membersA[1] },
      data: { avatarUrl: "https://example.test/a1.png" },
    });
    const updated = await get(clubToken, personUrl)
      .set("if-none-match", personResponse.headers.etag)
      .expect(200);
    expect(updated.headers.etag).not.toBe(personResponse.headers.etag);
  });

  it("forbids the members of another club", async () => {
    await get(clubToken, `/organizations/${clubB}/members`).expect(403);
    await get(clubToken, `/organizations/${districtId}/members`).expect(403);
    await get(districtToken, `/organizations/${clubB}/members`).expect(200);
  });

  it("returns PersonView from serviceGetPerson", async () => {
    const response = await get(clubToken, `/persons/${membersA[0]}`).expect(
      200,
    );
    expect(response.body).toMatchObject({
      id: membersA[0],
      firstName: "a0",
      displayName: `a0 ${tag}`,
    });
    for (const raw of [
      "externalReference",
      "metadata",
      "primaryEmail",
      "createdAt",
      "archivedAt",
      "email",
      "phone",
      "birthDate",
    ])
      expect(response.body).not.toHaveProperty(raw);

    const contact = await get(
      clubContactToken,
      `/persons/${membersA[0]}`,
    ).expect(200);
    expect(contact.body.email).toBe(`a0-${tag}@example.test`);

    await get(clubToken, `/persons/${memberB}`).expect(403);
  });

  it("batch-reads persons, silently omitting those out of scope", async () => {
    const club = await batch(clubToken, [
      membersA[1],
      memberB,
      outsider,
      "does-not-exist",
      membersA[0],
      membersA[1],
    ]).expect(200);
    expect(club.body.map((p: { id: string }) => p.id)).toEqual([
      membersA[1],
      membersA[0],
    ]);
    expect(club.body[0]).not.toHaveProperty("email");

    const district = await batch(districtToken, [memberB, membersA[0]]).expect(
      200,
    );
    expect(district.body.map((p: { id: string }) => p.id)).toEqual([
      memberB,
      membersA[0],
    ]);
    expect(district.body[0]).toHaveProperty("email");

    const tooMany = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await batch(clubToken, tooMany).expect(400);
    await batch(clubToken, []).expect(400);
  });

  it("lists current authorities, with descendants only within scope", async () => {
    const own = await get(
      districtToken,
      `/organizations/${districtId}/authorities`,
    ).expect(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0]).toMatchObject({
      organizationId: districtId,
      positionCode: "DISTRICT_RDR",
      status: "ACTIVE",
      person: { id: memberB },
    });
    expect(own.body[0].person).not.toHaveProperty("email");

    const tree = await get(
      districtToken,
      `/organizations/${districtId}/authorities?includeDescendants=true`,
    ).expect(200);
    expect(
      tree.body.map((a: { organizationId: string }) => a.organizationId).sort(),
    ).toEqual([districtId, clubA, clubB].sort());

    const club = await get(
      clubToken,
      `/organizations/${clubA}/authorities?includeDescendants=true`,
    ).expect(200);
    expect(club.body).toHaveLength(1);
    expect(club.body[0]).toMatchObject({
      organizationId: clubA,
      positionCode: "CLUB_PRESIDENT",
      person: { id: membersA[0] },
    });
    await get(clubToken, `/organizations/${districtId}/authorities`).expect(
      403,
    );
  });

  it("lists periods, filtered by status", async () => {
    const all = await get(clubToken, `/organizations/${clubA}/periods`).expect(
      200,
    );
    expect(all.body.map((p: { code: string }) => p.code)).toEqual([
      "2026-27",
      "2025-26",
    ]);
    const active = await get(
      clubToken,
      `/organizations/${clubA}/periods?status=ACTIVE`,
    ).expect(200);
    expect(active.body).toHaveLength(1);
    expect(active.body[0]).toMatchObject({
      organizationId: clubA,
      status: "ACTIVE",
      startDate: "2026-07-01T00:00:00.000Z",
    });
    await get(clubToken, `/organizations/${clubB}/periods`).expect(403);
  });

  it("limits a person's memberships to the app's scope", async () => {
    const club = await get(
      clubToken,
      `/persons/${membersA[0]}/memberships`,
    ).expect(200);
    expect(club.body).toEqual([
      expect.objectContaining({
        organizationId: clubA,
        organizationType: "CLUB",
        organizationName: `A ${tag}`,
        status: "ACTIVE",
      }),
    ]);
    const district = await get(
      districtToken,
      `/persons/${membersA[0]}/memberships`,
    ).expect(200);
    expect(
      district.body
        .map((m: { organizationId: string }) => m.organizationId)
        .sort(),
    ).toEqual([clubA, clubB].sort());
    await get(clubToken, `/persons/${memberB}/memberships`).expect(403);
  });
});
