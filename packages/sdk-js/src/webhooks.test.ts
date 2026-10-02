import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { test } from "node:test";

import { miRotaractWebhook } from "./express.ts";
import {
  MiRotaractWebhookError,
  createWebhookHandler,
  verifyWebhook,
} from "./webhooks.ts";

type Vector = {
  name: string;
  secret: string;
  now: number;
  toleranceSec?: number;
  body: string;
  headers: Record<string, string>;
  expected: { valid: boolean; eventId?: string; type?: string; error?: string };
};

const { vectors } = JSON.parse(
  readFileSync(
    new URL("../../../sdks/conformance/webhook-vectors.json", import.meta.url),
    "utf8",
  ),
) as { vectors: Vector[] };

for (const vector of vectors)
  test(`webhook vector: ${vector.name}`, async () => {
    const run = () =>
      verifyWebhook({
        payload: vector.body,
        headers: vector.headers,
        secret: vector.secret,
        toleranceSec: vector.toleranceSec,
        now: vector.now,
      });
    if (vector.expected.valid) {
      const event = await run();
      assert.equal(event.id, vector.expected.eventId);
      assert.equal(event.type, vector.expected.type);
    } else
      await assert.rejects(run, (error: unknown) => {
        assert.ok(error instanceof MiRotaractWebhookError);
        assert.equal(error.code, vector.expected.error);
        return true;
      });
  });

const secret = "whsec_unit-test-secret";
function signed(body: string, at = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret)
    .update(`${at}.${body}`)
    .digest("hex");
  return {
    "MiRotaract-Webhook-Id": "evt_1",
    "MiRotaract-Webhook-Timestamp": String(at),
    "MiRotaract-Signature": `v1=${sig}`,
    "Content-Type": "application/json",
  };
}
const body = JSON.stringify({
  id: "evt_1",
  type: "ping.v1",
  createdAt: new Date().toISOString(),
  organizationId: "org",
  data: { message: "hola", appId: "a", endpointId: "e" },
});

test("verifyWebhook accepts bytes, Headers and several secrets", async () => {
  const event = await verifyWebhook({
    payload: new TextEncoder().encode(body),
    headers: new Headers(signed(body)),
    secret: ["whsec_other", secret],
  });
  assert.equal(event.type, "ping.v1");
  if (event.type === "ping.v1") assert.equal(event.data.message, "hola");
});

test("verifyWebhook refuses an already-parsed body", async () => {
  await assert.rejects(
    verifyWebhook({
      payload: JSON.parse(body) as never,
      headers: signed(body),
      secret,
    }),
    (error: unknown) =>
      error instanceof MiRotaractWebhookError &&
      error.code === "invalid_payload",
  );
});

test("createWebhookHandler: 200, 400 on bad signature, 500 when onEvent throws", async () => {
  const seen: string[] = [];
  const handler = createWebhookHandler({
    secret,
    onEvent: (event) => {
      seen.push(event.id);
    },
  });
  const request = (headers: Record<string, string>) =>
    new Request("https://app.test/api/webhooks", {
      method: "POST",
      headers,
      body,
    });
  const ok = await handler(request(signed(body)));
  assert.equal(ok.status, 200);
  assert.deepEqual(seen, ["evt_1"]);
  const bad = await handler(
    request({ ...signed(body), "MiRotaract-Signature": "v1=00" }),
  );
  assert.equal(bad.status, 400);
  assert.equal(
    ((await bad.json()) as { error: string }).error,
    "invalid_signature",
  );
  const failing = createWebhookHandler({
    secret,
    onEvent: () => {
      throw new Error("db down");
    },
  });
  assert.equal((await failing(request(signed(body)))).status, 500);
});

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader() {},
    json(value: unknown) {
      res.body = value;
    },
  };
  return res;
}

test("miRotaractWebhook (Express): raw Buffer body, stream body, parsed body", async () => {
  const mw = miRotaractWebhook({ secret });
  // express.raw()
  const raw: any = { headers: signed(body), body: Buffer.from(body) };
  let nextArg: unknown = "not-called";
  await mw(raw, fakeRes(), (error?: unknown) => (nextArg = error));
  assert.equal(nextArg, undefined);
  assert.equal(raw.miRotaractEvent.id, "evt_1");

  // no body parser: reads the stream
  const stream: any = Object.assign(Readable.from([Buffer.from(body)]), {
    headers: signed(body),
  });
  nextArg = "not-called";
  await mw(stream, fakeRes(), (error?: unknown) => (nextArg = error));
  assert.equal(nextArg, undefined);
  assert.equal(stream.miRotaractEvent.type, "ping.v1");

  // express.json() already ran: can't verify
  const parsed: any = { headers: signed(body), body: JSON.parse(body) };
  const res = fakeRes();
  await mw(parsed, res, () => assert.fail("next must not run"));
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as { error: string }).error, "invalid_payload");

  // bad signature
  const forged: any = {
    headers: {
      ...signed(body),
      "MiRotaract-Signature": `v1=${"0".repeat(64)}`,
    },
    body: Buffer.from(body),
  };
  const res2 = fakeRes();
  await mw(forged, res2, () => assert.fail("next must not run"));
  assert.equal(res2.statusCode, 400);
});
