import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import request from "supertest";

import { MembershipApplicationNotifierService } from "../src/application/notifications/membership-application-notifier.service";
import { NotificationService } from "../src/application/notifications/notification.service";
import {
  activateForTests,
  createTestApp,
  e2eTag,
  grantRoleForTests,
  testPrisma,
} from "./support/test-app";

/**
 * Club chosen at registration → application submitted on email
 * verification → the club presidency is emailed; approval → the applicant
 * is emailed. Real Postgres, real HTTP pipeline; only ClickMail is replaced
 * by a spy on NotificationService.sendEmail.
 */
describe("Membership application notifications E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: any;
  let notifier: MembershipApplicationNotifierService;
  let sendEmail: jest.SpyInstance;
  const tag = e2eTag();
  const password = "a-very-long-e2e-password-1";

  let admin: string;
  let districtId: string;
  let clubId: string;
  let presidentEmail: string;
  let presidentToken: string;

  async function account(label: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post("/api/kernel/v1/auth/register")
      .send({ email, password, firstName: "E2E", lastName: label })
      .expect(201);
    await activateForTests(
      prisma,
      registered.body.id,
      registered.body.personId,
    );
    return {
      email,
      personId: registered.body.personId as string,
      login: async () =>
        (
          await request(http)
            .post("/api/kernel/v1/auth/login")
            .send({ email, password })
            .expect(200)
        ).body.accessToken as string,
    };
  }

  const as = (token: string) => ({
    get: (url: string) =>
      request(http)
        .get(`/api/kernel/v1${url}`)
        .set("authorization", `Bearer ${token}`),
    post: (url: string, body: object = {}) =>
      request(http)
        .post(`/api/kernel/v1${url}`)
        .set("authorization", `Bearer ${token}`)
        .set("idempotency-key", randomUUID())
        .send(body),
  });

  const emailsTo = (to: string) =>
    sendEmail.mock.calls.map(([email]) => email).filter((e) => e.to === to);

  /** Registers with a club and verifies through the real token. */
  async function registerWithClub(label: string, message?: string) {
    const email = `${tag}-${label}@example.test`;
    const registered = await request(http)
      .post("/api/kernel/v1/auth/register")
      .send({
        email,
        password,
        firstName: "Ana",
        lastName: label,
        organizationId: clubId,
        message,
      })
      .expect(201);
    const verification = emailsTo(email).find((e) =>
      e.html.includes("/verify-email?token="),
    );
    const token = /token=([A-Za-z0-9_-]+)/.exec(verification.html)![1];
    await request(http)
      .post("/api/kernel/v1/auth/verify-email")
      .send({ token })
      .expect(200);
    return { email, personId: registered.body.personId as string };
  }

  beforeAll(async () => {
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION = "true";
    app = await createTestApp();
    http = app.getHttpServer();
    prisma = testPrisma();
    notifier = app.get(MembershipApplicationNotifierService);
    sendEmail = jest
      .spyOn(app.get(NotificationService), "sendEmail")
      .mockResolvedValue(true);

    const superadmin = await account("admin");
    await prisma.userAccount.updateMany({
      where: { personId: superadmin.personId },
      data: { platformRole: "SUPERADMIN" },
    });
    admin = await superadmin.login();

    const district = await as(admin)
      .post("/organizations", {
        type: "DISTRICT",
        code: `D-${tag}`,
        name: `Distrito ${tag}`,
        slug: `d-${tag}`,
      })
      .expect(201);
    districtId = district.body.id;
    await as(admin).post(`/organizations/${districtId}/activate`).expect(201);
    const club = await as(admin)
      .post("/organizations", {
        type: "CLUB",
        code: `C-${tag}`,
        name: `Club Notificaciones ${tag}`,
        slug: `c-${tag}`,
        parentId: districtId,
      })
      .expect(201);
    clubId = club.body.id;
    await as(admin).post(`/organizations/${clubId}/activate`).expect(201);

    const president = await account("president");
    presidentEmail = president.email;
    await grantRoleForTests(
      prisma,
      president.personId,
      "CLUB_PRESIDENT",
      "ORGANIZATION",
      clubId,
    );
    presidentToken = await president.login();
  });

  afterAll(async () => {
    sendEmail?.mockRestore();
    await prisma?.$disconnect();
    await app?.close();
  });

  it("lists active clubs publicly, without people or contact data", async () => {
    const response = await request(http)
      .get("/api/kernel/v1/auth/register/clubs")
      .expect(200);
    const club = response.body.items.find(
      (item: { id: string }) => item.id === clubId,
    );
    expect(club).toEqual({
      id: clubId,
      name: `Club Notificaciones ${tag}`,
      code: `C-${tag}`,
      city: null,
    });
    expect(
      response.body.items.some((item: { id: string }) => item.id === districtId),
    ).toBe(false);
  });

  it("refuses to register with something that is not an active club", async () => {
    await request(http)
      .post("/api/kernel/v1/auth/register")
      .send({
        email: `${tag}-district@example.test`,
        password,
        firstName: "E2E",
        lastName: "district",
        organizationId: districtId,
      })
      .expect(400);
    expect(
      await prisma.userAccount.count({
        where: { emailNormalized: `${tag}-district@example.test` },
      }),
    ).toBe(0);
  });

  it("submits the application on verification and emails the presidency once", async () => {
    const applicant = await registerWithClub("applicant", "Me mudé al barrio");

    const application = await prisma.membershipApplication.findFirstOrThrow({
      where: { requesterPersonId: applicant.personId },
    });
    expect(application).toEqual(
      expect.objectContaining({
        organizationId: clubId,
        status: "SUBMITTED",
        message: "Me mudé al barrio",
      }),
    );
    const account = await prisma.userAccount.findUniqueOrThrow({
      where: { personId: applicant.personId },
    });
    expect(account.requestedOrganizationId).toBeNull();
    expect(account.requestedMessage).toBeNull();

    await notifier.runOnce();
    await notifier.runOnce();

    const sent = emailsTo(presidentEmail).filter((e) =>
      e.idempotencyKey?.startsWith("application-submitted:"),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(
      `Ana applicant quiere sumarse a Club Notificaciones ${tag}`,
    );
    expect(sent[0].html).toContain(`/applications/${application.id}`);
    expect(sent[0].html).toContain("Me mudé al barrio");

    // The presidency approves; the applicant is told.
    await as(presidentToken)
      .post(`/membership-applications/${application.id}/approve`)
      .expect(201);
    await notifier.runOnce();
    const welcome = emailsTo(applicant.email).filter((e) =>
      e.idempotencyKey?.startsWith("application-approved:"),
    );
    expect(welcome).toHaveLength(1);
    expect(welcome[0].html).toContain("aprobó tu solicitud");
  });

  it("keeps the notice pending while ClickMail refuses it", async () => {
    const applicant = await registerWithClub("retry");
    const application = await prisma.membershipApplication.findFirstOrThrow({
      where: { requesterPersonId: applicant.personId },
    });
    sendEmail.mockResolvedValueOnce(false);

    await notifier.runOnce();

    const message = await prisma.outboxMessage.findFirstOrThrow({
      where: {
        eventType: "kernel.membership-application.submitted.v1",
        aggregateId: application.id,
      },
    });
    expect(message.emailsNotifiedAt).toBeNull();
    expect(message.emailAttempts).toBe(1);
  });
});
