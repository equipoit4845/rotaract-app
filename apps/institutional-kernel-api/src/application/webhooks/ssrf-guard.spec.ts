import { createServer, type Server } from "http";
import type { AddressInfo } from "net";

import { postWebhook } from "./http-delivery";
import {
  WebhookUrlError,
  isNonPublicAddress,
  resolvePublicAddresses,
  validateWebhookUrl,
  webhookUrlPolicy,
} from "./ssrf-guard";

const strict = { allowInsecure: false };
const insecure = { allowInsecure: true };

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe", // 169.254.169.254 mapped
    "64:ff9b::a00:1", // NAT64 of 10.0.0.1
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "192.169.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows public %s", (address) => {
    expect(isNonPublicAddress(address)).toBe(false);
  });

  it("requires https and a public host unless insecure mode is on", () => {
    expect(validateWebhookUrl("https://hooks.example.com/mr", strict)).toBe(
      "https://hooks.example.com/mr",
    );
    for (const url of [
      "http://hooks.example.com/mr",
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://[::1]/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/hook",
      "https://intranet/hook",
      "https://printer.local/hook",
      "https://api.internal/hook",
      "https://user:pass@hooks.example.com/",
      "https://hooks.example.com/#frag",
      "ftp://hooks.example.com/",
      "not a url",
      "",
    ])
      expect(() => validateWebhookUrl(url, strict)).toThrow(WebhookUrlError);
    expect(
      validateWebhookUrl("http://localhost:3000/api/webhooks", insecure),
    ).toBe("http://localhost:3000/api/webhooks");
    expect(() =>
      validateWebhookUrl("http://user:pw@localhost/", insecure),
    ).toThrow(WebhookUrlError);
  });

  it("reads KERNEL_WEBHOOKS_ALLOW_INSECURE", () => {
    expect(webhookUrlPolicy({})).toEqual(strict);
    expect(
      webhookUrlPolicy({ KERNEL_WEBHOOKS_ALLOW_INSECURE: "false" }),
    ).toEqual(strict);
    expect(
      webhookUrlPolicy({ KERNEL_WEBHOOKS_ALLOW_INSECURE: "true" }),
    ).toEqual(insecure);
  });

  it("rejects a domain when ANY of its DNS records is private", async () => {
    const dns = (records: string[]) => async () =>
      records.map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      }));
    await expect(
      resolvePublicAddresses("ok.example.com", strict, dns(["93.184.216.34"])),
    ).resolves.toHaveLength(1);
    await expect(
      resolvePublicAddresses(
        "rebind.example.com",
        strict,
        dns(["93.184.216.34", "127.0.0.1"]),
      ),
    ).rejects.toThrow(WebhookUrlError);
    await expect(
      resolvePublicAddresses(
        "meta.example.com",
        strict,
        dns(["169.254.169.254"]),
      ),
    ).rejects.toThrow(/privada o local/);
    await expect(
      resolvePublicAddresses("nx.example.com", strict, async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toThrow(/No pudimos encontrar/);
    await expect(
      resolvePublicAddresses("local.example.com", insecure, dns(["127.0.0.1"])),
    ).resolves.toHaveLength(1);
  });
});

describe("webhook HTTP delivery", () => {
  let server: Server;
  let base: string;
  let handler: (req: any, res: any) => void = () => undefined;

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(
    () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
  );

  const post = (path: string, extra: object = {}) =>
    postWebhook({
      url: `${base}${path}`,
      headers: { "Content-Type": "application/json" },
      body: '{"id":"evt_1"}',
      policy: insecure,
      ...extra,
    });

  it("succeeds on 2xx and keeps the first KB of the answer", async () => {
    let received = "";
    handler = (req, res) => {
      req.on("data", (chunk: Buffer) => (received += chunk));
      req.on("end", () => res.writeHead(200).end("x".repeat(5_000)));
    };
    const result = await post("/ok");
    expect(received).toBe('{"id":"evt_1"}');
    expect(result).toMatchObject({ ok: true, status: 200, error: null });
    expect(result.responseExcerpt).toHaveLength(1_024);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("fails on 5xx and on redirects (never followed)", async () => {
    handler = (_req, res) => res.writeHead(503).end("down");
    expect(await post("/down")).toMatchObject({
      ok: false,
      status: 503,
      responseExcerpt: "down",
    });
    handler = (_req, res) =>
      res.writeHead(302, { Location: "http://169.254.169.254/" }).end();
    const redirected = await post("/redirect");
    expect(redirected).toMatchObject({ ok: false, status: 302 });
    expect(redirected.error).toMatch(/redirecciones/);
  });

  it("gives up after the timeout", async () => {
    handler = () => undefined; // never answers
    const result = await post("/slow", { timeoutMs: 200 });
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/Sin respuesta/);
  });

  it("refuses a private destination in strict mode, before connecting", async () => {
    let hit = false;
    handler = (_req, res) => {
      hit = true;
      res.writeHead(200).end();
    };
    const result = await postWebhook({
      url: `${base.replace("http", "https")}/x`,
      headers: {},
      body: "{}",
      policy: strict,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/privada o local/);
    // A public-looking name that resolves to loopback is caught after DNS.
    const rebound = await postWebhook({
      url: "https://hooks.example.com/x",
      headers: {},
      body: "{}",
      policy: strict,
      lookupAll: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    expect(rebound.ok).toBe(false);
    expect(rebound.error).toMatch(/privada o local/);
    expect(hit).toBe(false);
  });
});
