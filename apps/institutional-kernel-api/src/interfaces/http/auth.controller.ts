import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";

import { AccountStatus } from "@prisma/client";

import { AuthService } from "../../application/auth/auth.service";
import {
  AuthenticatedRequest,
  JwtSessionGuard,
} from "../../application/auth/jwt-session.guard";
import { ServiceApiGuard } from "../../application/auth/service-api.guard";
import { HttpCommandContextFactory } from "./command-context.factory";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}

  @Post("register")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  register(
    @Body()
    body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      displayName?: string;
    },
  ) {
    return this.auth.register(body);
  }
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(
    @Body() body: { email: string; password: string },
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.login(body.email, body.password, { ip, userAgent });
  }
  @Post("refresh")
  @HttpCode(200)
  refresh(
    @Body() body: { refreshToken: string },
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.auth.refresh(body.refreshToken, { ip, userAgent });
  }
  @Post("verify-email") @HttpCode(200) verify(@Body() body: { token: string }) {
    return this.auth.verifyEmail(body.token);
  }
  @Post("forgot-password")
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async forgotPassword(@Body() body: { email: string }): Promise<void> {
    await this.auth.requestPasswordReset(body.email);
  }
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(
    @Body() body: { token: string; newPassword: string },
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.newPassword);
  }
  @Post("invitations/accept")
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  acceptInvitation(@Body() body: { token: string; password: string }) {
    return this.auth.acceptInvitation(body.token, body.password);
  }
  @Post("logout")
  @UseGuards(JwtSessionGuard)
  @HttpCode(204)
  async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(request.user.sessionId);
  }
  @Post("logout-all")
  @UseGuards(JwtSessionGuard)
  @HttpCode(204)
  async logoutAll(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.logoutAll(request.user.accountId);
  }
  @Get("me")
  @UseGuards(JwtSessionGuard)
  me(@Req() request: AuthenticatedRequest): Promise<object> {
    return this.auth.me(request.user.accountId);
  }
  @Patch("me")
  @UseGuards(JwtSessionGuard)
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() body: { email: string },
  ) {
    return this.auth.updateEmail(request.user.accountId, body.email);
  }
  @Patch("me/password")
  @UseGuards(JwtSessionGuard)
  @HttpCode(200)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    await this.auth.changePassword(
      request.user.accountId,
      body.currentPassword,
      body.newPassword,
    );
  }
  @Get("sessions")
  @UseGuards(JwtSessionGuard)
  sessions(@Req() request: AuthenticatedRequest): Promise<object[]> {
    return this.auth.sessions(request.user.accountId);
  }
  @Delete("sessions/:sessionId")
  @UseGuards(JwtSessionGuard)
  @HttpCode(204)
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId") sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(request.user.accountId, sessionId);
  }
  @Post("introspect")
  @UseGuards(ServiceApiGuard)
  introspect(@Body() body: { token: string }, @Req() _request: Request) {
    return this.auth.introspect(body.token);
  }

  // Platform-wide account administration (kernel-spec.md §8.1
  // SuspendAccount/ReactivateAccount/DisableAccount) — gated by
  // kernel.account.manage via KernelAccessGuard, not self-service.
  @Post("accounts/:accountId/suspend")
  suspendAccount(
    @Param("accountId") accountId: string,
    @Req() request: Request,
  ) {
    return this.auth.transitionAccount(
      accountId,
      AccountStatus.SUSPENDED,
      this.contexts.from(request, "suspendAccount"),
    );
  }
  @Post("accounts/:accountId/reactivate")
  reactivateAccount(
    @Param("accountId") accountId: string,
    @Req() request: Request,
  ) {
    return this.auth.transitionAccount(
      accountId,
      AccountStatus.ACTIVE,
      this.contexts.from(request, "reactivateAccount"),
    );
  }
  @Post("accounts/:accountId/disable")
  disableAccount(
    @Param("accountId") accountId: string,
    @Req() request: Request,
  ) {
    return this.auth.transitionAccount(
      accountId,
      AccountStatus.DISABLED,
      this.contexts.from(request, "disableAccount"),
    );
  }
}
