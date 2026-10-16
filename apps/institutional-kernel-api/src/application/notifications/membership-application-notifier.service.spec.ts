import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  APPLICATION_APPROVED,
  APPLICATION_REJECTED,
  APPLICATION_SUBMITTED,
  submittedEmail,
} from "./membership-application-emails";
import { MembershipApplicationNotifierService } from "./membership-application-notifier.service";
import { NotificationService } from "./notification.service";

const ada = {
  id: "person-ada",
  firstName: "Ada",
  lastName: "Lovelace",
  displayName: null,
  primaryEmail: "ada.personal@example.com",
  account: { email: "ada@example.com", status: "ACTIVE" },
};
const president = {
  id: "person-pres",
  firstName: "Grace",
  lastName: "Hopper",
  displayName: null,
  primaryEmail: null,
  account: { email: "grace@example.com", status: "ACTIVE" },
};
const comiteIt = {
  id: "person-it",
  firstName: "Facundo",
  lastName: "Cubells",
  displayName: null,
  primaryEmail: null,
  account: { email: "it@example.com", status: "ACTIVE" },
};

function build(options: {
  eventType: string;
  application?: Record<string, unknown>;
  presidents?: unknown[];
  fallback?: unknown[];
  delivered?: boolean;
}) {
  const application = {
    id: "app-1",
    organizationId: "club-1",
    status: "SUBMITTED",
    message: "Quiero <sumarme>",
    rejectionReason: null,
    organization: { id: "club-1", name: "Rotaract Club Centro" },
    requester: ada,
    ...options.application,
  };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        id: "outbox-1",
        eventType: options.eventType,
        aggregateId: "app-1",
        payload: { applicationId: "app-1" },
      },
    ]),
    membershipApplication: {
      findUnique: jest.fn().mockResolvedValue(application),
    },
    roleAssignment: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          (where.roleDefinition.code === "CLUB_PRESIDENT"
            ? (options.presidents ?? [{ person: president }])
            : (options.fallback ?? [{ person: comiteIt }])) as unknown[],
        ),
      ),
    },
    outboxMessage: { update: jest.fn() },
  };
  prisma.$transaction = jest.fn((handler: any) => handler(prisma));
  const notifications = {
    sendEmail: jest.fn().mockResolvedValue(options.delivered ?? true),
  };
  const notifier = new MembershipApplicationNotifierService(
    prisma as PrismaService,
    notifications as unknown as NotificationService,
  );
  return { notifier, prisma, notifications };
}

describe("MembershipApplicationNotifierService", () => {
  it("emails the club presidency when an application is submitted", async () => {
    const { notifier, prisma, notifications } = build({
      eventType: APPLICATION_SUBMITTED,
    });

    await expect(notifier.runOnce()).resolves.toEqual({
      handled: 1,
      failed: 0,
    });

    expect(prisma.roleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roleDefinition: { code: "CLUB_PRESIDENT" },
          organizationId: "club-1",
          revokedAt: null,
        }),
      }),
    );
    expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
    const email = notifications.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("grace@example.com");
    expect(email.subject).toBe(
      "Ada Lovelace quiere sumarse a Rotaract Club Centro",
    );
    expect(email.html).toContain("/applications/app-1");
    expect(email.html).toContain("Quiero &lt;sumarme&gt;");
    expect(email.idempotencyKey).toBe(
      "application-submitted:app-1:person-pres",
    );
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: "outbox-1" },
      data: {
        emailAttempts: { increment: 1 },
        emailsNotifiedAt: expect.any(Date),
      },
    });
  });

  it("falls back to Comité IT when the club has no presidency", async () => {
    const { notifier, notifications } = build({
      eventType: APPLICATION_SUBMITTED,
      presidents: [],
    });

    await notifier.runOnce();

    expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
    const email = notifications.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("it@example.com");
    expect(email.html).toContain("no tiene presidencia vigente");
  });

  it("sends nothing for an application no longer waiting for review", async () => {
    const { notifier, prisma, notifications } = build({
      eventType: APPLICATION_SUBMITTED,
      application: { status: "CANCELLED" },
    });

    await notifier.runOnce();

    expect(notifications.sendEmail).not.toHaveBeenCalled();
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailsNotifiedAt: expect.any(Date) }),
      }),
    );
  });

  it("emails the applicant when approved", async () => {
    const { notifier, notifications } = build({
      eventType: APPLICATION_APPROVED,
      application: { status: "APPROVED" },
    });

    await notifier.runOnce();

    const email = notifications.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("ada@example.com");
    expect(email.html).toContain("aprobó tu solicitud");
    expect(email.idempotencyKey).toBe("application-approved:app-1");
  });

  it("emails the applicant the reason when rejected", async () => {
    const { notifier, notifications } = build({
      eventType: APPLICATION_REJECTED,
      application: { status: "REJECTED", rejectionReason: "Cupo completo" },
    });

    await notifier.runOnce();

    const email = notifications.sendEmail.mock.calls[0][0];
    expect(email.to).toBe("ada@example.com");
    expect(email.html).toContain("Cupo completo");
    expect(email.html).toContain("/join-club");
  });

  it("keeps the message pending when ClickMail refuses the email", async () => {
    const { notifier, prisma } = build({
      eventType: APPLICATION_SUBMITTED,
      delivered: false,
    });

    await expect(notifier.runOnce()).resolves.toEqual({
      handled: 0,
      failed: 1,
    });
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: "outbox-1" },
      data: { emailAttempts: { increment: 1 } },
    });
  });
});

describe("submittedEmail", () => {
  it("escapes the names it puts in the HTML", () => {
    const email = submittedEmail({
      applicationId: "app-1",
      recipient: { personId: "p", email: "p@example.com", name: "<b>" },
      requesterName: "<script>",
      clubName: "Club & Co",
      message: null,
      fallback: false,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Club &amp; Co");
  });
});
