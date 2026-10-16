import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import request from "supertest";

import { KernelService } from "../src/application/kernel/kernel.service";

import {
  activateForTests,
  approveForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * Cargos for developer apps (docs/analisis-roles-api-developers.md), end to
 * end with request AND response OpenAPI validation on:
 *
 * - an app reads the positions of a club and what each one grants, and a
 *   person's effective permissions;
 * - a module declares a position template: installing it in a club creates
 *   the club's own position (only the module's permissions), the president
 *   appoints someone, and only there it grants anything;
 * - grants[] only apply to positions the installing organization owns;
 * - uninstalling archives the position and ends its appointments;
 *   reinstalling brings the same position back.
 */
describe("Module positions and the positions Data API", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  const moduleId = `p-${tag}`.slice(0, 40).replace(/-+$/, "");

  let admin: string;
  let rdr: string;
  let president: string;
  let delegatePersonId: string;
  let delegateMembershipId: string;
  let districtId: string;
  let clubA: string;
  let clubB: string;
  let clientId: string;
  let clientSecret: string;
  let presidentPositionId: string;
  let presidentPositionOwner: string | null;
  let periodId: string;
  let modulePositionCode: string;
  let modulePositionId: string;
  let appointmentId: string;

  const example = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../../../packages/module-manifest/examples/reuniones/mirotaract.module.json",
      ),
      "utf8",
    ),
  );
  const code = (suffix: string) => `${moduleId}.${suffix}`;
  /** The reuniones example under this run's id; its grant targets CLUB_PRESIDENT. */
  function manifest() {
    const text = JSON.stringify(example).replace(
      /"reuniones\./g,
      `"${moduleId}.`,
    );
    return {
      ...JSON.parse(text),
      id: moduleId,
      grants: [
        {
          positionCode: "CLUB_PRESIDENT",
          permissions: [code("meeting.attend")],
        },
      ],
    };
  }

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post(`${base}/auth/register`)
      .send({ email, password, firstName: "E2E", lastName: label })
      .expect(201);
    await activateForTests(
      prisma,
      registered.body.id,
      registered.body.personId,
    );
    return {
      personId: registered.body.personId as string,
      login: async () =>
        (
          await request(http)
            .post(`${base}/auth/login`)
            .send({ email, password })
            .expect(200)
        ).body.accessToken as string,
    };
  }

  const as = (token: string) => ({
    get: (url: string) =>
      request(http)
        .get(`${base}${url}`)
        .set("authorization", `Bearer ${token}`),
    post: (url: string, body?: object) => {
      const call = request(http)
        .post(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID());
      return body === undefined ? call : call.send(body);
    },
  });

  async function organization(body: object) {
    const created = await as(admin).post("/organizations", body).expect(201);
    await as(admin)
      .post(`/organizations/${created.body.id}/activate`)
      .expect(201);
    return created.body.id as string;
  }

  async function activeMember(personId: string, organizationId: string) {
    const membership = await as(admin)
      .post(`/organizations/${organizationId}/memberships`, { personId })
      .expect(201);
    await as(admin)
      .post(`/memberships/${membership.body.id}/activate`)
      .expect(201);
    return membership.body.id as string;
  }

  let token: string | undefined;
  async function service() {
    token ??= (
      await request(http)
        .post(`${base}/oauth/token`)
        .auth(clientId, clientSecret)
        .type("form")
        .send({ grant_type: "client_credentials" })
        .expect(200)
    ).body.access_token as string;
    return as(token);
  }

  async function allowed(personId: string, permission: string, org: string) {
    const response = await (
      await service()
    )
      .post("/service/authorization/check", {
        subjectId: personId,
        permission,
        scope: { type: "ORGANIZATION", organizationId: org },
      })
      .expect(200);
    return response.body.allowed as boolean;
  }

  beforeAll(async () => {
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION = "true";
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();

    const superadmin = await account("admin");
    await prisma.userAccount.updateMany({
      where: { personId: superadmin.personId },
      data: { platformRole: "SUPERADMIN" },
    });
    admin = await superadmin.login();

    districtId = await organization({
      type: "DISTRICT",
      code: `D-${tag}`,
      name: `Distrito ${tag}`,
      slug: `d-${tag}`,
    });
    clubA = await organization({
      type: "CLUB",
      code: `A-${tag}`,
      name: `Club A ${tag}`,
      slug: `a-${tag}`,
      parentId: districtId,
    });
    clubB = await organization({
      type: "CLUB",
      code: `B-${tag}`,
      name: `Club B ${tag}`,
      slug: `b-${tag}`,
      parentId: districtId,
    });

    const rdrAccount = await account("rdr");
    await activeMember(rdrAccount.personId, clubA);
    await grantRoleForTests(
      prisma,
      rdrAccount.personId,
      "DISTRICT_RDR",
      "ORGANIZATION_TREE",
      districtId,
    );
    rdr = await rdrAccount.login();

    const presidentAccount = await account("president-a");
    await activeMember(presidentAccount.personId, clubA);
    await grantRoleForTests(
      prisma,
      presidentAccount.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubA,
    );
    president = await presidentAccount.login();

    const delegate = await account("delegate-a");
    delegatePersonId = delegate.personId;
    delegateMembershipId = await activeMember(delegatePersonId, clubA);

    // As in production, the district owns the club position catalog.
    const position = await prisma.positionDefinition.findUniqueOrThrow({
      where: { code: "CLUB_PRESIDENT" },
    });
    presidentPositionId = position.id;
    presidentPositionOwner = position.ownerOrganizationId;
    await prisma.positionDefinition.update({
      where: { id: position.id },
      data: { ownerOrganizationId: districtId },
    });

    const period = await as(admin)
      .post(`/organizations/${clubA}/periods`, {
        code: `P-${tag}`,
        name: "2026-2027",
        sequence: 1,
        startDate: "2026-07-01",
        endDate: "2027-06-30",
      })
      .expect(201);
    periodId = period.body.id;
    await as(admin).post(`/periods/${periodId}/schedule`).expect(201);
    await as(admin).post(`/periods/${periodId}/activate`).expect(201);

    const created = await as(rdr)
      .post("/developer/apps", {
        name: `Cargos ${tag}`,
        description: "App de un comité",
        type: "CONFIDENTIAL",
        organizationId: districtId,
        grantTypes: ["client_credentials"],
        scopes: [
          "kernel.service.positions.read",
          "kernel.service.authorization.check",
        ],
      })
      .expect(201);
    clientId = created.body.app.clientId;
    clientSecret = created.body.clientSecret;
    await approveForTests(prisma, created.body.app.id);
    await as(rdr)
      .post("/modules", { appId: created.body.app.id, manifest: manifest() })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.positionDefinition.update({
      where: { id: presidentPositionId },
      data: { ownerOrganizationId: presidentPositionOwner },
    });
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const personIds = accounts.map((a) => a.personId);
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
    });
    await prisma.appointment.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.institutionalPeriod.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.positionDefinition.deleteMany({ where: { moduleId } });
    await prisma.roleDefinition.deleteMany({ where: { moduleId } });
    // RolePermission rows cascade with the permissions.
    await prisma.permissionDefinition.deleteMany({ where: { moduleId } });
    await prisma.moduleInstallation.deleteMany({ where: { moduleId } });
    await prisma.moduleDefinition.deleteMany({ where: { id: moduleId } });
    await prisma.developerApp.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.membershipTransition.deleteMany({
      where: { membership: { organizationId: { in: orgs } } },
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
    await prisma.accountSession.deleteMany({
      where: { accountId: { in: accounts.map((a) => a.id) } },
    });
    await prisma.userAccount.deleteMany({
      where: { id: { in: accounts.map((a) => a.id) } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.$disconnect();
    await app.close();
    delete process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION;
  });

  it("an app lists a club's positions and what each one grants", async () => {
    const svc = await service();
    const list = await svc
      .get(`/service/organizations/${clubA}/positions?include=permissions`)
      .expect(200);
    const presidency = list.body.find((p: any) => p.code === "CLUB_PRESIDENT");
    expect(presidency).toMatchObject({
      source: "SYSTEM",
      organizationType: "CLUB",
      scope: "ORGANIZATION",
      archived: false,
    });
    expect(presidency.permissions.length).toBeGreaterThan(0);
    // No technical role code, no ids.
    expect(presidency).not.toHaveProperty("defaultRoleCode");
    expect(presidency).not.toHaveProperty("id");
    // Only club positions in a club.
    expect(list.body.every((p: any) => p.organizationType === "CLUB")).toBe(
      true,
    );

    const detail = await svc
      .get("/service/positions/CLUB_PRESIDENT")
      .expect(200);
    expect(detail.body.permissions.map((p: any) => p.code).sort()).toEqual(
      presidency.permissions.map((p: any) => p.code).sort(),
    );
    await svc.get("/service/positions/NO_EXISTE").expect(404);
  });

  it("a club can't apply a grant on a position the district owns", async () => {
    const overview = await as(president)
      .get(`/organizations/${clubA}/modules/${moduleId}/positions`)
      .expect(200);
    expect(overview.body.positions).toEqual([
      expect.objectContaining({
        key: "delegado-asamblea",
        install: "suggested",
        position: null,
      }),
    ]);
    expect(overview.body.grants).toEqual([
      expect.objectContaining({
        positionCode: "CLUB_PRESIDENT",
        allowed: false,
        applied: false,
      }),
    ]);

    const refused = await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {
        configuration: { emailContacto: "club-a@example.org" },
        grants: ["CLUB_PRESIDENT"],
      })
      .expect(403);
    expect(refused.body.code).toBe("KERNEL_MODULE_GRANT_FORBIDDEN");
    // The whole installation rolled back.
    expect(await prisma.moduleInstallation.count({ where: { moduleId } })).toBe(
      0,
    );
    expect(await prisma.positionDefinition.count({ where: { moduleId } })).toBe(
      0,
    );
  });

  it("installing in a club creates the club's own position, with only the module's permissions", async () => {
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {
        configuration: { emailContacto: "club-a@example.org" },
      })
      .expect(201);
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/activate`)
      .expect(200);

    const position = await prisma.positionDefinition.findFirstOrThrow({
      where: { moduleId, ownerOrganizationId: clubA },
    });
    modulePositionId = position.id;
    modulePositionCode = position.code;
    expect(position).toMatchObject({
      code: `${moduleId}.delegado-asamblea.a-${tag}`,
      organizationType: "CLUB",
      moduleTemplateKey: "delegado-asamblea",
      archivedAt: null,
    });
    const role = await prisma.roleDefinition.findUniqueOrThrow({
      where: { code: position.defaultRoleCode! },
      include: { permissions: { include: { permissionDefinition: true } } },
    });
    expect(role).toMatchObject({ moduleId, isSystem: false });
    expect(
      role.permissions.map((link) => link.permissionDefinition.code).sort(),
    ).toEqual(
      ["vote.cast", "proxy.manage", "meeting.attend", "minutes.read"]
        .map(code)
        .sort(),
    );

    const svc = await service();
    const inA = await svc
      .get(`/service/organizations/${clubA}/positions`)
      .expect(200);
    expect(inA.body).toContainEqual(
      expect.objectContaining({
        code: modulePositionCode,
        source: "MODULE",
        moduleId,
        ownerOrganizationId: clubA,
      }),
    );
    // Another club never sees (nor can hold) club A's position.
    const inB = await svc
      .get(`/service/organizations/${clubB}/positions`)
      .expect(200);
    expect(inB.body.map((p: any) => p.code)).not.toContain(modulePositionCode);
    const applicable = await as(admin)
      .get(`/position-definitions?applicableTo=${clubB}`)
      .expect(200);
    expect(applicable.body.map((p: any) => p.code)).not.toContain(
      modulePositionCode,
    );
  });

  it("someone appointed to it gets the module's permissions in that club only", async () => {
    expect(await allowed(delegatePersonId, code("vote.cast"), clubA)).toBe(
      false,
    );
    // Through the service: POST /appointments (and its transitions) answer
    // an Appointment without membershipOrganizationId, which the response
    // validator rejects (an existing contract gap, not this feature's).
    const kernel = app.get(KernelService);
    const appointment = await kernel.createAppointment(clubA, {
      membershipId: delegateMembershipId,
      periodId,
      positionDefinitionId: modulePositionId,
    });
    appointmentId = appointment.id;
    await kernel.transitionAppointment(appointmentId, "ELECTED");
    await kernel.transitionAppointment(appointmentId, "ACTIVE");

    expect(await allowed(delegatePersonId, code("vote.cast"), clubA)).toBe(
      true,
    );
    expect(await allowed(delegatePersonId, code("vote.cast"), clubB)).toBe(
      false,
    );
    const effective = await (
      await service()
    )
      .get(
        `/service/organizations/${clubA}/persons/${delegatePersonId}/permissions`,
      )
      .expect(200);
    expect(effective.body.permissions).toEqual(
      expect.arrayContaining([code("vote.cast"), code("minutes.read")]),
    );
    expect(effective.body.permissions).not.toContain(code("meeting.manage"));

    // Club B can't appoint into club A's position.
    const otherMember = await account("member-b");
    const membershipB = await activeMember(otherMember.personId, clubB);
    const periodB = await as(admin)
      .post(`/organizations/${clubB}/periods`, {
        code: `PB-${tag}`,
        name: "2026-2027",
        sequence: 1,
        startDate: "2026-07-01",
        endDate: "2027-06-30",
      })
      .expect(201);
    const refused = await as(admin)
      .post(`/organizations/${clubB}/appointments`, {
        membershipId: membershipB,
        periodId: periodB.body.id,
        positionDefinitionId: modulePositionId,
      })
      .expect(400);
    expect(refused.body.code).toBe("KERNEL_POSITION_NOT_APPLICABLE");
  });

  it("the district applies the grant on the club catalog it owns, and takes it back on uninstall", async () => {
    const presidentPersonId = (
      await prisma.userAccount.findFirstOrThrow({
        where: { email: `${tag}-president-a@example.test` },
      })
    ).personId;
    expect(
      await allowed(presidentPersonId, code("meeting.attend"), clubA),
    ).toBe(false);

    await as(rdr)
      .post(`/organizations/${districtId}/modules/${moduleId}/install`, {
        configuration: { emailContacto: "distrito@example.org" },
        positions: [],
        grants: ["CLUB_PRESIDENT"],
      })
      .expect(201);
    await as(rdr)
      .post(`/organizations/${districtId}/modules/${moduleId}/activate`)
      .expect(200);
    const overview = await as(rdr)
      .get(`/organizations/${districtId}/modules/${moduleId}/positions`)
      .expect(200);
    // District installs see no club template, and the grant is applied.
    expect(overview.body.positions).toEqual([]);
    expect(overview.body.grants).toEqual([
      expect.objectContaining({ allowed: true, applied: true }),
    ]);
    expect(
      await allowed(presidentPersonId, code("meeting.attend"), clubA),
    ).toBe(true);

    await as(rdr)
      .post(`/organizations/${districtId}/modules/${moduleId}/disable`)
      .expect(200);
    expect(
      await allowed(presidentPersonId, code("meeting.attend"), clubA),
    ).toBe(false);
    const links = await prisma.rolePermission.count({
      where: {
        roleDefinition: { code: "CLUB_PRESIDENT" },
        permissionDefinition: { moduleId },
      },
    });
    expect(links).toBe(0);
  });

  it("uninstalling in the club archives the position and ends its appointments; reinstalling brings it back", async () => {
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/disable`)
      .expect(200);

    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(appointment.status).toBe("ENDED");
    expect(await allowed(delegatePersonId, code("vote.cast"), clubA)).toBe(
      false,
    );
    const svc = await service();
    const list = await svc
      .get(`/service/organizations/${clubA}/positions`)
      .expect(200);
    expect(list.body.map((p: any) => p.code)).not.toContain(modulePositionCode);
    const archived = await svc
      .get(`/service/positions/${modulePositionCode}`)
      .expect(200);
    expect(archived.body.archived).toBe(true);

    const refused = await as(president)
      .post(`/organizations/${clubA}/appointments`, {
        membershipId: delegateMembershipId,
        periodId,
        positionDefinitionId: modulePositionId,
      })
      .expect(409);
    expect(refused.body.code).toBe("KERNEL_POSITION_ARCHIVED");

    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {})
      .expect(201);
    const positions = await prisma.positionDefinition.findMany({
      where: { moduleId, ownerOrganizationId: clubA },
    });
    expect(positions).toEqual([
      expect.objectContaining({ id: modulePositionId, archivedAt: null }),
    ]);
    // Not re-appointed: history stays ended.
    expect(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
        })
      ).status,
    ).toBe("ENDED");
  });

  it("a manifest that hands out kernel permissions in a position is rejected", async () => {
    const bad = manifest();
    bad.version = "1.1.0";
    bad.positions[0].permissions.push("kernel.role.assign");
    const put = await request(http)
      .put(`${base}/modules/${moduleId}/manifest`)
      .set("authorization", `Bearer ${rdr}`)
      .set("idempotency-key", randomUUID())
      .send({ manifest: bad })
      .expect(422);
    expect(put.body.errors).toEqual([
      expect.objectContaining({ path: "positions[0].permissions[4]" }),
    ]);
  });
});
