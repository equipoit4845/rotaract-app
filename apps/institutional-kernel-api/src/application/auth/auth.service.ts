import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomBytes, randomUUID } from "crypto";
import { AccountStatus, InvitationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { OutboxService } from "../outbox/outbox.service";
import { AuditService } from "../audit/audit.service";
import { NotificationService } from "../notifications/notification.service";
import { webUrl } from "../shared/web-url";
import { verifyPasswordHash } from "./password-verifier";
import { CommandContext } from "../../domain/shared/command-context";
import {
  accountStateMachine,
  invitationStateMachine,
} from "../../domain/institutional/state-machines";

type RegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string;
};
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}
  private normalized(email: string): string {
    return email.trim().toLowerCase();
  }
  // Every account needs the platform-wide baseline role to exercise even
  // its own .self permissions (kernel-spec.md §10.2: PLATFORM_USER /
  // PLATFORM scope, "operaciones propias"). Without this, a freshly
  // activated account holds zero permissions until an admin grants one —
  // it couldn't even submit its own first membership application.
  private async grantBaselineRole(
    tx: Prisma.TransactionClient,
    personId: string,
  ): Promise<void> {
    const role = await tx.roleDefinition.findUnique({
      where: { code: "PLATFORM_USER" },
    });
    if (!role) return;
    const existing = await tx.roleAssignment.findFirst({
      where: { personId, roleDefinitionId: role.id, revokedAt: null },
    });
    if (existing) return;
    const assignment = await tx.roleAssignment.create({
      data: {
        personId,
        roleDefinitionId: role.id,
        scopeType: "PLATFORM",
        effect: "ALLOW",
        validFrom: new Date(),
      },
    });
    await this.outbox.record(
      tx,
      "kernel.role-assignment.granted.v1",
      "RoleAssignment",
      assignment.id,
      { assignmentId: assignment.id, personId },
    );
  }
  // §14.4: login success/failure, email/password changes, and
  // suspend/reactivate must be audited even though they live outside
  // KernelService's mutate() helper.
  private async logAudit(
    action: string,
    resourceId: string,
    actorId?: string,
    result: "SUCCESS" | "FAILURE" = "SUCCESS",
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.audit.record(
        tx,
        { commandId: randomUUID(), actor: { type: "USER", id: actorId } },
        action,
        "UserAccount",
        resourceId,
        undefined,
        result,
      ),
    );
  }
  private static readonly MAX_FAILED_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60_000;
  private publicAccount(account: {
    id: string;
    personId: string;
    email: string;
    status: AccountStatus;
    platformRole: string;
    emailVerifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): object {
    return {
      id: account.id,
      personId: account.personId,
      email: account.email,
      status: account.status,
      platformRole: account.platformRole,
      emailVerifiedAt: account.emailVerifiedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
  async register(input: RegisterInput): Promise<object> {
    const email = this.normalized(input.email);
    if (!/^\S+@\S+\.\S+$/.test(email) || input.password.length < 10)
      throw new ConflictException("Invalid registration data");
    try {
      const { account, token } = await this.prisma.$transaction(async (tx) => {
        const person = await tx.person.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            displayName: input.displayName,
            primaryEmail: email,
          },
        });
        const account = await tx.userAccount.create({
          data: {
            personId: person.id,
            email,
            emailNormalized: email,
            passwordHash: await argon2.hash(input.password),
            status: AccountStatus.PENDING_VERIFICATION,
          },
        });
        const token = randomBytes(32).toString("base64url");
        await tx.emailVerificationToken.create({
          data: {
            accountId: account.id,
            tokenHash: await argon2.hash(token),
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          },
        });
        await this.outbox.record(
          tx,
          "kernel.account.registered.v1",
          "UserAccount",
          account.id,
          {
            accountId: account.id,
            personId: person.id,
            email,
            status: account.status,
            platformRole: account.platformRole,
          },
        );
        return { account, token };
      });
      await this.notifications.sendEmail({
        to: email,
        subject: "Confirmá tu cuenta de Mi Rotaract",
        html: `<p>Confirmá tu cuenta haciendo clic en el siguiente enlace:</p><p><a href="${webUrl(`/verify-email?token=${token}`)}">Confirmar cuenta</a></p>`,
        idempotencyKey: `verify:${account.id}`,
      });
      return this.publicAccount(account);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new ConflictException("Email already registered");
      throw error;
    }
  }
  async login(
    emailInput: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<object> {
    const normalizedEmail = this.normalized(emailInput);
    const account = await this.prisma.userAccount.findUnique({
      where: { emailNormalized: normalizedEmail },
    });
    if (!account) {
      await this.logAudit(
        "AuthenticateAccount",
        normalizedEmail,
        undefined,
        "FAILURE",
      );
      throw new UnauthorizedException("Invalid credentials");
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      await this.logAudit(
        "AuthenticateAccount",
        account.id,
        account.id,
        "FAILURE",
      );
      throw new UnauthorizedException("Invalid credentials");
    }
    const passwordVerification =
      account.status === AccountStatus.ACTIVE
        ? await verifyPasswordHash(account.passwordHash, password)
        : { matches: false, needsRehash: false };
    if (!passwordVerification.matches) {
      // 14.1/14.4: lock the account out after repeated failed attempts and
      // audit every failure, not just the successful path.
      const attempts = account.failedLoginAttempts + 1;
      const locked = attempts >= AuthService.MAX_FAILED_LOGIN_ATTEMPTS;
      await this.prisma.userAccount.update({
        where: { id: account.id },
        data: {
          failedLoginAttempts: locked ? 0 : attempts,
          lockedUntil: locked
            ? new Date(Date.now() + AuthService.LOCKOUT_DURATION_MS)
            : account.lockedUntil,
        },
      });
      await this.logAudit(
        "AuthenticateAccount",
        account.id,
        account.id,
        "FAILURE",
      );
      throw new UnauthorizedException("Invalid credentials");
    }
    if (
      account.failedLoginAttempts > 0 ||
      account.lockedUntil ||
      passwordVerification.needsRehash
    )
      await this.prisma.userAccount.update({
        where: { id: account.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          ...(passwordVerification.needsRehash
            ? { passwordHash: await argon2.hash(password) }
            : {}),
        },
      });
    await this.logAudit("AuthenticateAccount", account.id, account.id);
    return this.issue(account.id, meta);
  }
  async issue(
    accountId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<object> {
    const refreshToken = randomBytes(48).toString("base64url");
    const session = await this.prisma.accountSession.create({
      data: {
        accountId,
        refreshTokenHash: await argon2.hash(refreshToken),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      },
    });
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    const accessToken = await this.jwt.signAsync(
      {
        sub: accountId,
        pid: account.personId,
        sid: session.id,
        pr: account.platformRole,
        iss: "institutional-kernel",
        aud: "mirotaract-platform",
      },
      { expiresIn: "10m" },
    );
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: 600 };
  }
  async refresh(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<object> {
    const sessions = await this.prisma.accountSession.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
    });
    const session = (
      await Promise.all(
        sessions.map(async (s) =>
          (await argon2.verify(s.refreshTokenHash, refreshToken)) ? s : null,
        ),
      )
    ).find(Boolean);
    if (!session) throw new UnauthorizedException("Invalid refresh token");
    await this.prisma.accountSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: "ROTATED" },
    });
    return this.issue(session.accountId, meta);
  }
  async verifyEmail(token: string): Promise<object> {
    const candidates = await this.prisma.emailVerificationToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      include: { account: true },
    });
    const entry = (
      await Promise.all(
        candidates.map(async (item) =>
          (await argon2.verify(item.tokenHash, token)) ? item : null,
        ),
      )
    ).find(Boolean);
    if (!entry)
      throw new GoneException("Verification token is invalid or expired");
    const account = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: entry.id },
        data: { usedAt: new Date() },
      });
      const updated = await tx.userAccount.update({
        where: { id: entry.accountId },
        data: { status: AccountStatus.ACTIVE, emailVerifiedAt: new Date() },
      });
      await this.outbox.record(
        tx,
        "kernel.account.activated.v1",
        "UserAccount",
        updated.id,
        { accountId: updated.id, personId: updated.personId },
      );
      await this.grantBaselineRole(tx, updated.personId);
      return updated;
    });
    return this.publicAccount(account);
  }
  async requestPasswordReset(emailInput: string): Promise<void> {
    const account = await this.prisma.userAccount.findUnique({
      where: { emailNormalized: this.normalized(emailInput) },
    });
    if (!account || account.status === AccountStatus.DISABLED) return;
    const token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          accountId: account.id,
          tokenHash: await argon2.hash(token),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      });
      // The raw token itself is never part of a public outbox event —
      // only this direct email carries it.
    });
    await this.notifications.sendEmail({
      to: account.email,
      subject: "Recuperá tu contraseña de Mi Rotaract",
      html: `<p>Recibimos un pedido para restablecer tu contraseña. Si fuiste vos, hacé clic en el siguiente enlace (vence en 1 hora):</p><p><a href="${webUrl(`/reset-password?token=${token}`)}">Restablecer contraseña</a></p><p>Si no fuiste vos, ignorá este mensaje.</p>`,
    });
  }
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 10)
      throw new BadRequestException(
        "Password must contain at least 10 characters",
      );
    const candidates = await this.prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
    });
    const entry = (
      await Promise.all(
        candidates.map(async (item) =>
          (await argon2.verify(item.tokenHash, token)) ? item : null,
        ),
      )
    ).find(Boolean);
    if (!entry)
      throw new GoneException("Password reset token is invalid or expired");
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: entry.id },
        data: { usedAt: new Date() },
      });
      await tx.userAccount.update({
        where: { id: entry.accountId },
        data: {
          passwordHash: await argon2.hash(newPassword),
          mustChangePassword: false,
        },
      });
      await tx.accountSession.updateMany({
        where: { accountId: entry.accountId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "PASSWORD_RESET" },
      });
      await this.audit.record(
        tx,
        {
          commandId: randomUUID(),
          actor: { type: "USER", id: entry.accountId },
        },
        "ResetPassword",
        "UserAccount",
        entry.accountId,
      );
    });
  }
  async acceptInvitation(token: string, password: string): Promise<object> {
    if (password.length < 10)
      throw new BadRequestException(
        "Password must contain at least 10 characters",
      );
    const candidates = await this.prisma.accountInvitation.findMany({
      where: {
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
    });
    const invitation = (
      await Promise.all(
        candidates.map(async (item) =>
          (await argon2.verify(item.tokenHash, token)) ? item : null,
        ),
      )
    ).find(Boolean);
    if (!invitation)
      throw new ConflictException("Invitation is invalid, consumed or expired");
    try {
      const account = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.userAccount.findUnique({
          where: { personId: invitation.personId },
        });
        if (existing)
          throw new ConflictException("Person already has an account");
        invitationStateMachine.assertTransition(
          invitation.status,
          InvitationStatus.ACCEPTED,
        );
        const email = this.normalized(invitation.email);
        const created = await tx.userAccount.create({
          data: {
            personId: invitation.personId,
            email,
            emailNormalized: email,
            passwordHash: await argon2.hash(password),
            status: AccountStatus.ACTIVE,
            emailVerifiedAt: new Date(),
          },
        });
        await tx.accountInvitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
        });
        await this.outbox.record(
          tx,
          "kernel.account.invitation-accepted.v1",
          "UserAccount",
          created.id,
          {
            invitationId: invitation.id,
            accountId: created.id,
            personId: created.personId,
            membershipId: invitation.membershipId,
          },
        );
        await this.outbox.record(
          tx,
          "kernel.person.account-linked.v1",
          "Person",
          invitation.personId,
          {
            personId: invitation.personId,
            accountId: created.id,
            membershipId: invitation.membershipId,
          },
        );
        await this.grantBaselineRole(tx, invitation.personId);
        return created;
      });
      return this.publicAccount(account);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new ConflictException("Email already registered");
      throw error;
    }
  }
  async updateEmail(accountId: string, emailInput: string): Promise<object> {
    const email = this.normalized(emailInput);
    if (!/^\S+@\S+\.\S+$/.test(email))
      throw new BadRequestException("Invalid email");
    try {
      const { account, token } = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.userAccount.update({
          where: { id: accountId },
          data: {
            email,
            emailNormalized: email,
            emailVerifiedAt: null,
            status: AccountStatus.PENDING_VERIFICATION,
          },
        });
        const token = randomBytes(32).toString("base64url");
        await tx.emailVerificationToken.create({
          data: {
            accountId,
            tokenHash: await argon2.hash(token),
            expiresAt: new Date(Date.now() + 24 * 3600_000),
          },
        });
        await this.outbox.record(
          tx,
          "kernel.account.email-changed.v1",
          "UserAccount",
          accountId,
          { accountId, personId: updated.personId, newEmail: email },
        );
        await this.audit.record(
          tx,
          { commandId: randomUUID(), actor: { type: "USER", id: accountId } },
          "UpdateOwnAccountEmail",
          "UserAccount",
          accountId,
        );
        return { account: updated, token };
      });
      await this.notifications.sendEmail({
        to: email,
        subject: "Confirmá tu nueva dirección de email",
        html: `<p>Confirmá tu nueva dirección de email haciendo clic en el siguiente enlace:</p><p><a href="${webUrl(`/verify-email?token=${token}`)}">Confirmar email</a></p>`,
        idempotencyKey: `verify:${accountId}:${email}`,
      });
      return this.publicAccount(account);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new ConflictException("Email already registered");
      throw error;
    }
  }
  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 10)
      throw new BadRequestException(
        "Password must contain at least 10 characters",
      );
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    if (!(await argon2.verify(account.passwordHash, currentPassword)))
      throw new UnauthorizedException("Current password is incorrect");
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: accountId },
        data: {
          passwordHash: await argon2.hash(newPassword),
          mustChangePassword: false,
        },
      });
      await tx.accountSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "PASSWORD_CHANGED" },
      });
      await this.audit.record(
        tx,
        { commandId: randomUUID(), actor: { type: "USER", id: accountId } },
        "ChangePassword",
        "UserAccount",
        accountId,
      );
    });
  }
  async introspect(token: string): Promise<object> {
    try {
      const payload = await this.jwt.verifyAsync<any>(token, {
        audience: "mirotaract-platform",
        issuer: "institutional-kernel",
      });
      const session = await this.prisma.accountSession.findUnique({
        where: { id: payload.sid },
        include: { account: true },
      });
      const active = Boolean(
        session &&
        !session.revokedAt &&
        session.expiresAt > new Date() &&
        session.account.status === AccountStatus.ACTIVE,
      );
      return {
        active,
        subject: active ? payload.sub : undefined,
        accountId: active ? payload.sub : undefined,
        personId: active ? payload.pid : undefined,
        expiresAt: active
          ? new Date(payload.exp * 1000).toISOString()
          : undefined,
      };
    } catch {
      return { active: false };
    }
  }
  async transitionAccount(
    accountId: string,
    target: AccountStatus,
    context?: CommandContext,
  ): Promise<object> {
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: accountId },
    });
    accountStateMachine.assertTransition(account.status, target);
    const updated = await this.prisma.userAccount.update({
      where: { id: accountId },
      data: {
        status: target,
        disabledAt: target === AccountStatus.DISABLED ? new Date() : null,
      },
    });
    const events: Record<string, string> = {
      ACTIVE: "kernel.account.reactivated.v1",
      SUSPENDED: "kernel.account.suspended.v1",
      DISABLED: "kernel.account.disabled.v1",
    };
    const commandNames: Record<string, string> = {
      ACTIVE: "ReactivateAccount",
      SUSPENDED: "SuspendAccount",
      DISABLED: "DisableAccount",
    };
    const auditContext: CommandContext = context ?? {
      commandId: randomUUID(),
      actor: { type: "USER", id: accountId },
    };
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.record(
        tx,
        events[target],
        "UserAccount",
        accountId,
        { accountId, personId: updated.personId, reasonCode: null },
        context,
      );
      await this.audit.record(
        tx,
        auditContext,
        commandNames[target],
        "UserAccount",
        accountId,
      );
    });
    return this.publicAccount(updated);
  }
  async me(accountId: string): Promise<object> {
    const account = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { person: true },
    });
    return { account: this.publicAccount(account), person: account.person };
  }
  async logout(sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.accountSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date(), revokeReason: "LOGOUT" },
      });
      await this.outbox.record(
        tx,
        "kernel.account.sessions-revoked.v1",
        "UserAccount",
        session.accountId,
        {
          accountId: session.accountId,
          sessionIds: [session.id],
          reason: "LOGOUT",
        },
      );
    });
  }
  async logoutAll(accountId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.accountSession.findMany({
        where: { accountId, revokedAt: null },
        select: { id: true },
      });
      await tx.accountSession.updateMany({
        where: { accountId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "LOGOUT_ALL" },
      });
      await this.outbox.record(
        tx,
        "kernel.account.sessions-revoked.v1",
        "UserAccount",
        accountId,
        {
          accountId,
          sessionIds: sessions.map((session) => session.id),
          reason: "LOGOUT_ALL",
        },
      );
    });
  }
  async sessions(accountId: string): Promise<object[]> {
    return this.prisma.accountSession.findMany({
      where: { accountId },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async revokeSession(accountId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.accountSession.updateMany({
      where: { id: sessionId, accountId },
      data: { revokedAt: new Date(), revokeReason: "USER_REVOKED" },
    });
    if (!result.count) throw new UnauthorizedException("Session not found");
  }
}
