import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { createTestApp } from "./support/test-app";

/**
 * Rate limiting is on in production (KernelThrottlerGuard). The rest of the
 * E2E suite turns it off (test/jest-e2e.env.ts) because it logs in many
 * times from one address; this suite turns it back on.
 */
describe("Rate limiting E2E", () => {
  let app: INestApplication;
  let http: any;
  const previous = process.env.KERNEL_RATE_LIMIT_ENABLED;

  beforeAll(async () => {
    process.env.KERNEL_RATE_LIMIT_ENABLED = "true";
    app = await createTestApp();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    process.env.KERNEL_RATE_LIMIT_ENABLED = previous;
    await app.close();
  });

  const login = (ip: string, email: string) =>
    request(http)
      .post("/api/kernel/v1/auth/login")
      .set("cf-connecting-ip", ip)
      .send({ email, password: "wrong-password-for-rate-limit" });

  // A fresh client address per run, so counters left in Redis by a previous
  // run never affect this one.
  const client = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;

  it("answers 429 after 10 login attempts per minute from the same client", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await login(client, `rl-${i}@example.test`)).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("keeps a separate budget per real client behind the tunnel", async () => {
    // Same socket (127.0.0.1) but a different end user: not throttled.
    const other = await login(`${client}1`, "rl-other@example.test");
    expect(other.status).not.toBe(429);
  });
});
