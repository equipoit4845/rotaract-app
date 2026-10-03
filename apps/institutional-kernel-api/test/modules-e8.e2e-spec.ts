import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import request from "supertest";

import {
  activateForTests,
  approveForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * E8 end to end, against the real stack, with request AND response OpenAPI
 * validation on:
 *
 * the RDR registers the "reuniones" module from its manifest (linked to the
 * district's app) → assigns one of its permissions to the CLUB_PRESIDENT
 * position → a president installs and configures it for their own club (and
 * is refused for another club) → the authorization check allows the module
 * permission there, and only there.
 */
describe("Modules from a manifest (E8)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";
  const base = "/api/kernel/v1";
  // A unique module id per run: "r-e2e-<...>".
  const moduleId = `r-${tag}`.slice(0, 40).replace(/-+$/, "");

  let admin: string;
  let rdr: string;
  let president: string;
  let presidentPersonId: string;
  let presidentAccountId: string;
  let districtId: string;
  let clubA: string;
  let clubB: string;
  let appId: string;
  let clientId: string;
  let clientSecret: string;
  let presidentPositionId: string;
  let presidentPositionOwner: string | null;

  const example = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../../../packages/module-manifest/examples/reuniones/mirotaract.module.json",
      ),
      "utf8",
    ),
  );
  /** The reuniones example, under this run's module id. */
  function manifest(version = "1.0.0") {
    const text = JSON.stringify(example).replace(
      /"reuniones\./g,
      `"${moduleId}.`,
    );
    return { ...JSON.parse(text), id: moduleId, version };
  }
  const code = (suffix: string) => `${moduleId}.${suffix}`;

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
      accountId: registered.body.id as string,
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
    put: (url: string, body?: object) => {
      const call = request(http)
        .put(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID());
      return body === undefined ? call : call.send(body);
    },
    patch: (url: string, body: object) =>
      request(http)
        .patch(`${base}${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
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
  }

  async function serviceToken() {
    const response = await request(http)
      .post(`${base}/oauth/token`)
      .auth(clientId, clientSecret)
      .type("form")
      .send({ grant_type: "client_credentials" })
      .expect(200);
    return response.body.access_token as string;
  }

  async function serviceCheck(permission: string, organizationId: string) {
    const token = await serviceToken();
    const response = await request(http)
      .post(`${base}/service/authorization/check`)
      .set("authorization", `Bearer ${token}`)
      .send({
        subjectId: presidentPersonId,
        permission,
        scope: { type: "ORGANIZATION", organizationId },
      })
      .expect(200);
    return response.body as { allowed: boolean; reasonCodes: string[] };
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
    presidentPersonId = presidentAccount.personId;
    presidentAccountId = presidentAccount.accountId;
    await activeMember(presidentPersonId, clubA);
    await grantRoleForTests(
      prisma,
      presidentPersonId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubA,
    );
    president = await presidentAccount.login();

    // As in production (prisma/backfill-baseline-roles.ts), the district
    // owns the system position catalog, so its RDR edits what every club
    // president can do. Restored in afterAll.
    const position = await prisma.positionDefinition.findUniqueOrThrow({
      where: { code: "CLUB_PRESIDENT" },
    });
    presidentPositionId = position.id;
    presidentPositionOwner = position.ownerOrganizationId;
    await prisma.positionDefinition.update({
      where: { id: position.id },
      data: { ownerOrganizationId: districtId },
    });
  });

  afterAll(async () => {
    await prisma.positionDefinition.update({
      where: { id: presidentPositionId },
      data: { ownerOrganizationId: presidentPositionOwner },
    });
    // RolePermission rows cascade with the permissions.
    await prisma.permissionDefinition.deleteMany({ where: { moduleId } });
    await prisma.moduleInstallation.deleteMany({ where: { moduleId } });
    await prisma.moduleDefinition.deleteMany({ where: { id: moduleId } });
    const orgs = [clubA, clubB, districtId].filter(Boolean);
    const accounts = await prisma.userAccount.findMany({
      where: { email: { contains: tag } },
      select: { id: true, personId: true },
    });
    const personIds = accounts.map((a) => a.personId);
    await prisma.developerApp.deleteMany({
      where: { organizationId: { in: orgs } },
    });
    await prisma.roleAssignment.deleteMany({
      where: {
        OR: [{ organizationId: { in: orgs } }, { personId: { in: personIds } }],
      },
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

  it("the RDR registers the module from its manifest, linked to the district's app", async () => {
    const created = await as(rdr)
      .post("/developer/apps", {
        name: `Reuniones ${tag}`,
        description: "Reuniones distritales",
        type: "CONFIDENTIAL",
        organizationId: districtId,
        grantTypes: ["client_credentials"],
        scopes: [
          "kernel.service.authorization.check",
          "kernel.service.users.read",
          "kernel.service.modules.read",
        ],
      })
      .expect(201);
    appId = created.body.app.id;
    clientId = created.body.app.clientId;
    clientSecret = created.body.clientSecret;
    // E11: approved by the district, so its service token carries every scope.
    await approveForTests(prisma, appId);

    // A club president can't publish modules.
    await as(president)
      .post("/modules", { appId, manifest: manifest() })
      .expect(403);

    // Permissions outside the module's namespace: 422 in Spanish.
    const bad = manifest();
    bad.permissions[0].code = "kernel.person.manage";
    const rejected = await as(rdr)
      .post("/modules", { appId, manifest: bad })
      .expect(422);
    expect(rejected.body.code).toBe("KERNEL_MODULE_MANIFEST_INVALID");
    expect(rejected.body.errors).toEqual([
      expect.objectContaining({ path: "permissions[0].code" }),
    ]);
    expect(rejected.body.detail).toContain(
      `tiene que empezar con «${moduleId}.»`,
    );

    const registered = await as(rdr)
      .post("/modules", { appId, manifest: manifest() })
      .expect(201);
    expect(registered.body).toMatchObject({
      id: moduleId,
      name: "Reuniones distritales",
      version: "1.0.0",
      status: "ACTIVE",
      developerAppId: appId,
      ownerOrganizationId: districtId,
    });
    expect(registered.body.permissions.map((p: any) => p.code)).toEqual(
      manifest()
        .permissions.map((p: any) => p.code)
        .sort(),
    );

    await as(rdr).post("/modules", { appId, manifest: manifest() }).expect(409);

    // The permissions are part of the catalog the RDR assigns from.
    const catalog = await as(rdr)
      .get(`/permissions?organizationId=${districtId}`)
      .expect(200);
    const vote = catalog.body.find((p: any) => p.code === code("vote.cast"));
    expect(vote).toMatchObject({
      namespace: moduleId,
      moduleId,
      isSystem: false,
      name: "Votar en nombre del club",
    });
  });

  it("the RDR assigns a module permission to CLUB_PRESIDENT", async () => {
    const vote = await prisma.permissionDefinition.findUniqueOrThrow({
      where: { code: code("vote.cast") },
    });
    // A president can't edit the district's catalog.
    await as(president)
      .put(
        `/position-definitions/${presidentPositionId}/permissions/${vote.id}`,
      )
      .expect(403);
    await as(rdr)
      .put(
        `/position-definitions/${presidentPositionId}/permissions/${vote.id}`,
      )
      .expect(200);
    const permissions = await as(rdr)
      .get(`/position-definitions/${presidentPositionId}/permissions`)
      .expect(200);
    expect(permissions.body.map((p: any) => p.code)).toContain(
      code("vote.cast"),
    );
  });

  it("a president installs and configures it for their own club, never another", async () => {
    // Granted, but the module isn't on in the club yet.
    expect(await serviceCheck(code("vote.cast"), clubA)).toMatchObject({
      allowed: false,
      reasonCodes: ["MODULE_NOT_INSTALLED"],
    });

    const catalog = await as(president)
      .get(`/modules?organizationId=${clubA}`)
      .expect(200);
    expect(catalog.body.map((m: any) => m.id)).toContain(moduleId);

    await as(president)
      .post(`/organizations/${clubB}/modules/${moduleId}/install`, {})
      .expect(403);

    const invalid = await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {
        configuration: { emailContacto: "no-es-un-email", votosPorClub: 9 },
      })
      .expect(422);
    expect(invalid.body.code).toBe("KERNEL_MODULE_CONFIGURATION_INVALID");
    expect(invalid.body.errors.map((e: any) => e.message).sort()).toEqual(
      [
        "«Email de contacto del club» tiene que ser un email válido.",
        "«Votos por club» tiene que ser 2 o menos.",
      ].sort(),
    );

    const installed = await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {})
      .expect(201);
    expect(installed.body.status).toBe("PENDING");

    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {})
      .expect(409);

    const notConfigured = await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/activate`)
      .expect(422);
    expect(notConfigured.body.detail).toMatch(/^Antes de activar el módulo/);
    expect(notConfigured.body.errors).toEqual([
      expect.objectContaining({
        path: "emailContacto",
        message: "Falta completar «Email de contacto del club».",
      }),
    ]);

    await as(president)
      .patch(`/organizations/${clubB}/modules/${moduleId}/configuration`, {
        configuration: { emailContacto: "b@example.org" },
      })
      .expect(403);
    const configured = await as(president)
      .patch(`/organizations/${clubA}/modules/${moduleId}/configuration`, {
        configuration: { emailContacto: "club-a@example.org" },
      })
      .expect(200);
    expect(configured.body.configuration).toEqual({
      emailContacto: "club-a@example.org",
      votosPorClub: 1,
      avisarPorEmail: true,
      idioma: "es",
    });

    const activated = await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/activate`)
      .expect(200);
    expect(activated.body.status).toBe("ACTIVE");

    const audit = await prisma.kernelAuditLog.findMany({
      where: { organizationId: clubA, resourceType: "ModuleInstallation" },
      select: { action: true },
    });
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "InstallModule",
        "UpdateModuleConfiguration",
        "ACTIVEModuleInstallation",
      ]),
    );
    const outbox = await prisma.outboxMessage.findMany({
      where: { aggregateId: `${moduleId}:${clubA}` },
      select: { eventType: true },
    });
    expect(outbox.map((m) => m.eventType)).toEqual(
      expect.arrayContaining([
        "kernel.module-installed.v1",
        "kernel.module-configuration-updated.v1",
        "kernel.module-activated.v1",
      ]),
    );
  });

  it("the authorization check allows the module permission where it is on", async () => {
    expect(await serviceCheck(code("vote.cast"), clubA)).toMatchObject({
      allowed: true,
      reasonCodes: ["ROLE_ALLOWED"],
    });
    // Not the president there.
    expect((await serviceCheck(code("vote.cast"), clubB)).allowed).toBe(false);
    // Not a permission the position has.
    expect((await serviceCheck(code("meeting.manage"), clubA)).allowed).toBe(
      false,
    );

    // The user context lists it for the club.
    const token = await serviceToken();
    const context = await request(http)
      .get(`${base}/service/users/${presidentAccountId}/context`)
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    const workspace = context.body.workspaces.find(
      (w: any) => w.organizationId === clubA,
    );
    expect(workspace.modulePermissions).toEqual([code("vote.cast")]);

    // Turning the module off in the club turns the permission off there.
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/suspend`)
      .expect(200);
    expect(await serviceCheck(code("vote.cast"), clubA)).toMatchObject({
      allowed: false,
      reasonCodes: ["MODULE_NOT_ACTIVE"],
    });
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/activate`)
      .expect(200);
    expect((await serviceCheck(code("vote.cast"), clubA)).allowed).toBe(true);
  });

  it("the district sees every installation in its tree", async () => {
    const view = await as(rdr)
      .get(`/organizations/${districtId}/module-installations`)
      .expect(200);
    expect(view.body).toEqual([
      expect.objectContaining({
        moduleId,
        organizationId: clubA,
        organizationName: `Club A ${tag}`,
        organizationType: "CLUB",
        status: "ACTIVE",
      }),
    ]);
    // A president only reads their own club.
    await as(president)
      .get(`/organizations/${districtId}/module-installations`)
      .expect(403);
    const own = await as(president)
      .get(`/organizations/${clubA}/modules`)
      .expect(200);
    expect(own.body[0]).toMatchObject({ moduleId, status: "ACTIVE" });
  });

  it("a new manifest version syncs the permissions; downgrades are refused", async () => {
    const next = manifest("1.1.0");
    next.permissions = next.permissions.filter(
      (p: any) => p.code !== code("minutes.read"),
    );
    next.permissions[0].name = "Conducir reuniones distritales";
    await as(president)
      .put(`/modules/${moduleId}/manifest`, { manifest: next })
      .expect(403);
    const updated = await as(rdr)
      .put(`/modules/${moduleId}/manifest`, { manifest: next })
      .expect(200);
    expect(updated.body.version).toBe("1.1.0");
    expect(updated.body.permissions.map((p: any) => p.code)).not.toContain(
      code("minutes.read"),
    );
    expect(
      updated.body.permissions.find(
        (p: any) => p.code === code("meeting.manage"),
      ).name,
    ).toBe("Conducir reuniones distritales");
    // The president keeps what the RDR assigned.
    expect((await serviceCheck(code("vote.cast"), clubA)).allowed).toBe(true);

    const downgrade = await as(rdr)
      .put(`/modules/${moduleId}/manifest`, { manifest: manifest("1.0.0") })
      .expect(422);
    expect(downgrade.body.code).toBe("KERNEL_MODULE_VERSION_DOWNGRADE");
  });

  it("uninstalling keeps the configuration for a later reinstall", async () => {
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/disable`)
      .expect(200);
    expect(await serviceCheck(code("vote.cast"), clubA)).toMatchObject({
      allowed: false,
      reasonCodes: ["MODULE_NOT_INSTALLED"],
    });
    const again = await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/install`, {})
      .expect(201);
    expect(again.body).toMatchObject({
      status: "PENDING",
      configuration: expect.objectContaining({
        emailContacto: "club-a@example.org",
      }),
    });
    await as(president)
      .post(`/organizations/${clubA}/modules/${moduleId}/activate`)
      .expect(200);
  });
});
