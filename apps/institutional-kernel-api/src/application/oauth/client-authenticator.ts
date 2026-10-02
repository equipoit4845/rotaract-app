import { Injectable, NotFoundException } from "@nestjs/common";
import { DeveloperAppStatus, type DeveloperApp } from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { verifyClientSecret } from "../developer-apps/credentials";
import { OAuthError } from "./oauth-error";

/**
 * Authenticates the client on /oauth/token and /oauth/revoke, and serves
 * the public view of an app for the consent screen. Shared by E2 and E3.
 */
@Injectable()
export class ClientAuthenticator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * PUBLIC apps authenticate with client_id alone (and must not send a
   * secret); CONFIDENTIAL apps need a current secret. Every failure is the
   * same invalid_client, so callers can't probe which client ids exist.
   */
  async authenticate(credentials: {
    clientId?: string;
    clientSecret?: string;
  }): Promise<DeveloperApp> {
    const fail = () => new OAuthError("invalid_client");
    if (!credentials.clientId) throw fail();
    const app = await this.prisma.developerApp.findUnique({
      where: { clientId: credentials.clientId },
      include: {
        secrets: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
    });
    if (!app || app.status !== DeveloperAppStatus.ACTIVE) throw fail();

    if (app.type === "PUBLIC") {
      if (credentials.clientSecret) throw fail();
    } else {
      if (!credentials.clientSecret) throw fail();
      let matched: string | undefined;
      for (const secret of app.secrets)
        if (
          await verifyClientSecret(secret.secretHash, credentials.clientSecret)
        ) {
          matched = secret.id;
          break;
        }
      if (!matched) throw fail();
      await this.prisma.developerAppSecret.update({
        where: { id: matched },
        data: { lastUsedAt: new Date() },
      });
    }
    const { secrets: _secrets, ...rest } = app;
    return rest;
  }

  /** 404 unless the app exists and is ACTIVE. */
  async publicInfo(clientId: string) {
    const app = await this.prisma.developerApp.findUnique({
      where: { clientId },
      include: { organization: { select: { name: true } } },
    });
    if (!app || app.status !== DeveloperAppStatus.ACTIVE)
      throw new NotFoundException("App not found");
    return {
      clientId: app.clientId,
      name: app.name,
      description: app.description,
      type: app.type,
      organizationName: app.organization.name,
    };
  }
}
