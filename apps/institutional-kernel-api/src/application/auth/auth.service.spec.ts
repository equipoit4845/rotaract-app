import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";

import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notification.service";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuthService } from "./auth.service";

function buildAuth(prismaOverrides: Record<string, any> = {}) {
  const fakePrisma: any = { ...prismaOverrides };
  fakePrisma.$transaction = jest.fn((handler: any) => handler(fakePrisma));
  const jwt = { signAsync: jest.fn().mockResolvedValue("signed.jwt.token") };
  const outbox = { record: jest.fn() } as unknown as OutboxService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const notifications = {
    sendEmail: jest.fn(),
  } as unknown as NotificationService;
  const auth = new AuthService(
    fakePrisma as PrismaService,
    jwt as any,
    outbox,
    audit,
    notifications,
  );
  return { auth, prisma: fakePrisma, jwt, outbox, audit, notifications };
}

describe("AuthService.login — lockout and audit (§14.1/§14.4)", () => {
  const meta = { ip: "127.0.0.1", userAgent: "jest" };

  it("increments failedLoginAttempts and audits a failure on wrong password", async () => {
    const passwordHash = await argon2.hash("correct-password-123");
    const account = {
      id: "account-1",
      status: "ACTIVE",
      passwordHash,
      lockedUntil: null,
      failedLoginAttempts: 0,
    };
    const { auth, prisma, audit } = buildAuth({
      userAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
      },
    });

    await expect(
      auth.login("user@example.com", "wrong-password", meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.userAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-1" },
        data: expect.objectContaining({ failedLoginAttempts: 1 }),
      }),
    );
    const [, , , , , , result] = (audit.record as jest.Mock).mock.calls[0];
    expect(result).toBe("FAILURE");
  });

  it("locks the account after reaching the max failed attempts", async () => {
    const passwordHash = await argon2.hash("correct-password-123");
    const account = {
      id: "account-1",
      status: "ACTIVE",
      passwordHash,
      lockedUntil: null,
      failedLoginAttempts: 4,
    };
    const { auth, prisma } = buildAuth({
      userAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
      },
    });

    await expect(
      auth.login("user@example.com", "wrong-password", meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const updateCall = (prisma.userAccount.update as jest.Mock).mock
      .calls[0][0];
    expect(updateCall.data.failedLoginAttempts).toBe(0);
    expect(updateCall.data.lockedUntil).toBeInstanceOf(Date);
    expect(updateCall.data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a locked account without checking the password", async () => {
    const account = {
      id: "account-1",
      status: "ACTIVE",
      passwordHash: "irrelevant",
      lockedUntil: new Date(Date.now() + 60_000),
      failedLoginAttempts: 5,
    };
    const { auth, audit } = buildAuth({
      userAccount: { findUnique: jest.fn().mockResolvedValue(account) },
    });

    await expect(
      auth.login("user@example.com", "anything", meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.record).toHaveBeenCalled();
  });

  it("resets lockout state and audits success on a correct login", async () => {
    const passwordHash = await argon2.hash("correct-password-123");
    const account = {
      id: "account-1",
      personId: "person-1",
      status: "ACTIVE",
      passwordHash,
      lockedUntil: null,
      failedLoginAttempts: 2,
      platformRole: "USER",
    };
    const { auth, prisma, audit } = buildAuth({
      userAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(account),
      },
      accountSession: {
        create: jest.fn().mockResolvedValue({ id: "session-1" }),
      },
    });

    const result = await auth.login(
      "user@example.com",
      "correct-password-123",
      meta,
    );

    expect(result).toMatchObject({ accessToken: "signed.jwt.token" });
    expect(prisma.userAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { failedLoginAttempts: 0, lockedUntil: null },
      }),
    );
    const [, , , , , , successResult] = (audit.record as jest.Mock).mock
      .calls[0];
    expect(successResult).toBe("SUCCESS");
  });

  it("audits a failed login attempt for an unknown email without throwing on the audit call", async () => {
    const { auth, audit } = buildAuth({
      userAccount: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      auth.login("nobody@example.com", "whatever", meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.record).toHaveBeenCalled();
  });
});

describe("AuthService — notification delivery", () => {
  it("sends a verification email on register", async () => {
    const { auth, notifications, prisma } = buildAuth({
      person: { create: jest.fn().mockResolvedValue({ id: "person-1" }) },
      userAccount: {
        create: jest.fn().mockResolvedValue({
          id: "account-1",
          personId: "person-1",
          email: "new@example.com",
          status: "PENDING_VERIFICATION",
          platformRole: "USER",
          emailVerifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      emailVerificationToken: { create: jest.fn() },
    });
    void prisma;

    await auth.register({
      email: "new@example.com",
      password: "a-long-enough-password",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(notifications.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "new@example.com" }),
    );
  });

  it("sends a password reset email when the account exists", async () => {
    const { auth, notifications } = buildAuth({
      userAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: "account-1",
          email: "u@example.com",
          status: "ACTIVE",
        }),
      },
      passwordResetToken: { create: jest.fn() },
    });

    await auth.requestPasswordReset("u@example.com");

    expect(notifications.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "u@example.com" }),
    );
  });

  it("does not send a reset email for an unknown or disabled account", async () => {
    const { auth, notifications } = buildAuth({
      userAccount: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await auth.requestPasswordReset("ghost@example.com");

    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });
});

describe("AuthService — audit coverage for account lifecycle", () => {
  it("audits ChangePassword", async () => {
    const passwordHash = await argon2.hash("old-password-123");
    const { auth, audit } = buildAuth({
      userAccount: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: "account-1", passwordHash }),
        update: jest.fn(),
      },
      accountSession: { updateMany: jest.fn() },
    });

    await auth.changePassword(
      "account-1",
      "old-password-123",
      "new-password-123",
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "ChangePassword",
      "UserAccount",
      "account-1",
    );
  });

  it("audits SuspendAccount/ReactivateAccount/DisableAccount transitions", async () => {
    const { auth, audit } = buildAuth({
      userAccount: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: "account-1", status: "ACTIVE" }),
        update: jest
          .fn()
          .mockResolvedValue({ id: "account-1", personId: "person-1" }),
      },
    });

    await auth.transitionAccount("account-1", "SUSPENDED" as any);

    const [, , action] = (audit.record as jest.Mock).mock.calls[0];
    expect(action).toBe("SuspendAccount");
  });
});

describe("AuthService — baseline PLATFORM_USER role grant (§10.2)", () => {
  it("grants PLATFORM_USER (PLATFORM scope) when an account is verified", async () => {
    const rawToken = "verify-token-plain";
    const tokenHash = await argon2.hash(rawToken);
    const { auth, prisma } = buildAuth({
      emailVerificationToken: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "vtok-1",
            accountId: "account-1",
            tokenHash,
            usedAt: null,
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        ]),
        update: jest.fn(),
      },
      userAccount: {
        update: jest
          .fn()
          .mockResolvedValue({ id: "account-1", personId: "person-1" }),
      },
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: "role-platform-user" }),
      },
      roleAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "assignment-1" }),
      },
    });

    await auth.verifyEmail(rawToken);

    expect(prisma.roleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: "person-1",
          roleDefinitionId: "role-platform-user",
          scopeType: "PLATFORM",
        }),
      }),
    );
  });

  it("does not grant PLATFORM_USER twice if the account already holds it", async () => {
    const rawToken = "verify-token-plain-2";
    const tokenHash = await argon2.hash(rawToken);
    const { auth, prisma } = buildAuth({
      emailVerificationToken: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "vtok-2",
            accountId: "account-1",
            tokenHash,
            usedAt: null,
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        ]),
        update: jest.fn(),
      },
      userAccount: {
        update: jest
          .fn()
          .mockResolvedValue({ id: "account-1", personId: "person-1" }),
      },
      roleDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: "role-platform-user" }),
      },
      roleAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: "existing-assignment" }),
        create: jest.fn(),
      },
    });

    await auth.verifyEmail(rawToken);

    expect(prisma.roleAssignment.create).not.toHaveBeenCalled();
  });
});
