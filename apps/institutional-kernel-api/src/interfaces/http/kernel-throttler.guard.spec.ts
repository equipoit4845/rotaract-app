import { clientIp } from "./kernel-throttler.guard";

describe("clientIp (rate-limit tracker)", () => {
  it("uses CF-Connecting-IP when the request comes through the local tunnel", () => {
    expect(
      clientIp({
        ip: "127.0.0.1",
        headers: {
          "cf-connecting-ip": "181.120.1.2",
          "x-forwarded-for": "9.9.9.9",
        },
      }),
    ).toBe("181.120.1.2");
  });

  it("uses the first X-Forwarded-For hop from the Web's server (Docker network)", () => {
    expect(
      clientIp({
        ip: "::ffff:172.18.0.5",
        headers: { "x-forwarded-for": "181.120.1.2, 172.18.0.5" },
      }),
    ).toBe("181.120.1.2");
  });

  it("ignores forwarded headers from untrusted peers (they could be spoofed)", () => {
    expect(
      clientIp({
        ip: "203.0.113.7",
        headers: {
          "cf-connecting-ip": "1.1.1.1",
          "x-forwarded-for": "2.2.2.2",
        },
      }),
    ).toBe("203.0.113.7");
  });

  it("falls back to the socket address when no header is present", () => {
    expect(clientIp({ ip: "127.0.0.1", headers: {} })).toBe("127.0.0.1");
  });
});
