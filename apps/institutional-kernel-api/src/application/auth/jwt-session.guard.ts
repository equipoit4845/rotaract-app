import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { AccountStatus } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export type AuthenticatedRequest = Request & {
  user: {
    accountId: string;
    personId: string;
    sessionId: string;
    platformRole: string;
  };
};
@Injectable()
export class JwtSessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Bearer token required");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(
        token,
        { audience: "mirotaract-platform", issuer: "institutional-kernel" },
      );
      const session = await this.prisma.accountSession.findUnique({
        where: { id: payload.sid },
        include: { account: true },
      });
      if (
        !session ||
        session.accountId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.account.status !== AccountStatus.ACTIVE
      )
        throw new UnauthorizedException("Session is not active");
      (request as AuthenticatedRequest).user = {
        accountId: session.accountId,
        personId: session.account.personId,
        sessionId: session.id,
        platformRole: session.account.platformRole,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid access token");
    }
  }
}
