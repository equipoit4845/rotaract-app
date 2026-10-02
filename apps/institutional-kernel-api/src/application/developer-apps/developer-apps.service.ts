import { Injectable, NotImplementedException } from "@nestjs/common";
import type { DeveloperApp, DeveloperAppSecret } from "@prisma/client";

import type { CommandContext } from "../../domain/shared/command-context";

export type DeveloperAppView = DeveloperApp & {
  secrets: Array<
    Pick<
      DeveloperAppSecret,
      "id" | "hint" | "createdAt" | "expiresAt" | "revokedAt" | "lastUsedAt"
    >
  >;
};

/**
 * E2 — registry of the apps committees build on the Kernel.
 * OWNER: E2 agent. Contract: kernel-openapi.yaml tag DeveloperApps and
 * docs/11-developer-platform-auth.md §E2.
 */
@Injectable()
export class DeveloperAppsService {
  list(_organizationId: string): Promise<DeveloperAppView[]> {
    throw new NotImplementedException();
  }
  get(_appId: string): Promise<DeveloperAppView> {
    throw new NotImplementedException();
  }
  create(
    _input: unknown,
    _context: CommandContext,
  ): Promise<{ app: DeveloperAppView; clientSecret: string | null }> {
    throw new NotImplementedException();
  }
  update(
    _appId: string,
    _input: unknown,
    _context: CommandContext,
  ): Promise<DeveloperAppView> {
    throw new NotImplementedException();
  }
  rotateSecret(
    _appId: string,
    _context: CommandContext,
  ): Promise<{
    secretId: string;
    secret: string;
    hint: string;
    createdAt: Date;
  }> {
    throw new NotImplementedException();
  }
  revokeSecret(
    _appId: string,
    _secretId: string,
    _context: CommandContext,
  ): Promise<void> {
    throw new NotImplementedException();
  }
  transition(
    _appId: string,
    _target: "ACTIVE" | "SUSPENDED" | "REVOKED",
    _context: CommandContext,
  ): Promise<DeveloperAppView> {
    throw new NotImplementedException();
  }
}
