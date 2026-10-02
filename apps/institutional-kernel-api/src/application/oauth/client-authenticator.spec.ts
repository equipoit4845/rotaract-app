import { NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { hashClientSecret } from "../developer-apps/credentials";
import { ClientAuthenticator } from "./client-authenticator";
import { OAuthError } from "./oauth-error";

function authenticator(app: any) {
  const prisma = {
    developerApp: { findUnique: jest.fn().mockResolvedValue(app) },
    developerAppSecret: { update: jest.fn() },
  };
  return {
    clients: new ClientAuthenticator(prisma as unknown as PrismaService),
    prisma,
  };
}

const base = {
  id: "app_1",
  clientId: "mra_1",
  status: "ACTIVE",
  type: "CONFIDENTIAL",
  secrets: [] as any[],
  organization: { name: "Distrito 4845" },
};

describe("ClientAuthenticator", () => {
  it("accepts a confidential client with a current secret and records its use", async () => {
    const secretHash = await hashClientSecret("mrs_right");
    const { clients, prisma } = authenticator({
      ...base,
      secrets: [{ id: "sec_1", secretHash }],
    });

    const app = await clients.authenticate({
      clientId: "mra_1",
      clientSecret: "mrs_right",
    });

    expect(app.clientId).toBe("mra_1");
    expect(app).not.toHaveProperty("secrets");
    expect(prisma.developerAppSecret.update).toHaveBeenCalledWith({
      where: { id: "sec_1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it.each([
    ["a wrong secret", { ...base }, "mrs_wrong"],
    ["a missing secret", { ...base }, undefined],
    ["a suspended app", { ...base, status: "SUSPENDED" }, "mrs_right"],
    ["an unknown client", null, "mrs_right"],
    ["a public client sending a secret", { ...base, type: "PUBLIC" }, "x"],
  ])("rejects %s as invalid_client", async (_label, app, secret) => {
    const secretHash = await hashClientSecret("mrs_right");
    const { clients } = authenticator(
      app ? { ...app, secrets: [{ id: "sec_1", secretHash }] } : null,
    );

    const error = await clients
      .authenticate({ clientId: "mra_1", clientSecret: secret })
      .catch((e) => e);

    expect(error).toBeInstanceOf(OAuthError);
    expect(error.error).toBe("invalid_client");
    expect(error.status).toBe(401);
  });

  it("accepts a public client by client_id alone", async () => {
    const { clients } = authenticator({ ...base, type: "PUBLIC" });
    await expect(clients.authenticate({ clientId: "mra_1" })).resolves.toEqual(
      expect.objectContaining({ clientId: "mra_1" }),
    );
  });

  it("hides apps that are not active from the consent screen", async () => {
    const { clients } = authenticator({ ...base, status: "REVOKED" });
    await expect(clients.publicInfo("mra_1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
