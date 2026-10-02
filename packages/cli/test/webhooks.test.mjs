import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { run } from "../src/cli.js";
import {
  backoffDelay,
  listenWebhooks,
  matchesEvents,
  resolveListenOptions,
  streamUrl,
} from "../src/commands/webhooks.js";
import { SseParser } from "../src/lib/sse.js";
import { APP, startMockKernel, streamEvent } from "./support/mock-kernel.mjs";

/** The developer's endpoint: verifies signatures like the templates do. */
async function startReceiver({ status = 200 } = {}) {
  const received = [];
  let secret;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const ts = req.headers["mirotaract-webhook-timestamp"];
      const expected = createHmac("sha256", secret ?? "")
        .update(`${ts}.${body}`)
        .digest();
      const valid = String(req.headers["mirotaract-signature"] ?? "")
        .split(",")
        .some((part) => {
          const given = Buffer.from(part.trim().replace(/^v1=/, ""), "hex");
          return (
            given.length === expected.length && timingSafeEqual(given, expected)
          );
        });
      received.push({ headers: req.headers, body, valid });
      res.writeHead(status, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/api/webhooks`,
    received,
    setSecret: (value) => {
      secret = value;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

/** A port nobody listens on (fetch refuses "bad ports" like 9 before connecting). */
async function closedPort() {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  return port;
}

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

const options = (mock, receiver, extra = {}) => ({
  baseUrl: mock.baseUrl,
  appId: APP.id,
  clientId: APP.clientId,
  clientSecret: APP.clientSecret,
  forwardTo: receiver.url,
  events: null,
  backoff: { initialMs: 5, maxMs: 20 },
  ...extra,
});

async function waitFor(predicate, ms = 3000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("SseParser", () => {
  test("parses events split across chunks, CRLF, comments and multi-line data", () => {
    const events = [];
    const parser = new SseParser((e) => events.push(e));
    parser.push(': comentario\r\nevent: ready\r\ndata: {"secret":');
    parser.push(
      '"whsec_x"}\r\n\r\nid: 7\nevent: webhook\ndata: a\ndata: b\n\n',
    );
    parser.push("data: sin evento\n\n");
    assert.deepEqual(events, [
      {
        event: "ready",
        data: '{"secret":"whsec_x"}',
        id: undefined,
        retry: undefined,
      },
      { event: "webhook", data: "a\nb", id: "7", retry: undefined },
      { event: "message", data: "sin evento", id: "7", retry: undefined },
    ]);
  });
});

describe("helpers", () => {
  test("matchesEvents supports exact types and prefix wildcards", () => {
    assert.equal(matchesEvents("ping.v1", null), true);
    assert.equal(matchesEvents("ping.v1", ["membership.*"]), false);
    assert.equal(matchesEvents("membership.ended.v1", ["membership.*"]), true);
    assert.equal(
      matchesEvents("membership.ended.v1", ["membership.ended.v1", "ping.v1"]),
      true,
    );
  });

  test("backoff grows exponentially with jitter and a ceiling", () => {
    const min = (n) => backoffDelay(n, { random: () => 0 });
    const max = (n) => backoffDelay(n, { random: () => 1 });
    assert.equal(min(0), 500);
    assert.equal(max(0), 1000);
    assert.equal(max(3), 8000);
    assert.equal(max(10), 30000);
    assert.equal(min(10), 15000);
  });

  test("streamUrl follows the contract path", () => {
    assert.equal(
      streamUrl("http://k/api/kernel/v1/", "app 1"),
      "http://k/api/kernel/v1/developer-apps/app%201/webhooks/stream",
    );
  });

  test("resolveListenOptions: flags > env > .env.local, clear errors", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mr-listen-"));
    writeFileSync(
      join(cwd, ".env.local"),
      "MIROTARACT_BASE_URL=http://file/api/kernel/v1\nMIROTARACT_APP_ID=file_app\nMIROTARACT_CLIENT_ID=mra_file\nMIROTARACT_CLIENT_SECRET=mrs_file\n",
    );
    const resolved = resolveListenOptions(
      {
        "forward-to": "http://localhost:3000/api/webhooks",
        "app-id": "flag_app",
        events: "a.v1, b.*",
      },
      { cwd, env: { MIROTARACT_CLIENT_ID: "mra_env" } },
    );
    assert.equal(resolved.appId, "flag_app");
    assert.equal(resolved.clientId, "mra_env");
    assert.equal(resolved.clientSecret, "mrs_file");
    assert.deepEqual(resolved.events, ["a.v1", "b.*"]);
    assert.throws(
      () => resolveListenOptions({}, { cwd, env: {} }),
      /Falta --forward-to/,
    );
    const empty = mkdtempSync(join(tmpdir(), "mr-listen-"));
    assert.throws(
      () =>
        resolveListenOptions(
          { "forward-to": "http://localhost:3000" },
          { cwd: empty, env: {} },
        ),
      /MIROTARACT_APP_ID/,
    );
  });
});

describe("listenWebhooks against the mock SSE kernel", () => {
  let receiver;
  before(async () => {
    receiver = await startReceiver();
  });
  after(() => receiver.close());

  test("forwards each event byte for byte with its signature headers", async () => {
    receiver.received.length = 0;
    const mock = await startMockKernel({ secret: "whsec_fixed" });
    receiver.setSecret("whsec_fixed");
    const controller = new AbortController();
    const out = sink();
    const done = listenWebhooks(options(mock, receiver), {
      out,
      err: sink(),
      signal: controller.signal,
    });
    await waitFor(() => receiver.received.length === 2);
    controller.abort();
    const stats = await done;
    await mock.close();

    assert.match(out.text, /Secreto de firma de esta sesión: whsec_fixed/);
    assert.match(out.text, /membership\.activated\.v1 +evt_\w+ +→ 200/);
    assert.deepEqual(stats.received, 2);
    assert.deepEqual(stats.forwarded, 2);
    for (const hit of receiver.received) {
      assert.equal(
        hit.valid,
        true,
        "the signature must verify at the receiver",
      );
      assert.equal(hit.headers["user-agent"], "MiRotaract-Webhooks/1");
      assert.match(hit.headers["mirotaract-webhook-id"], /^evt_/);
      assert.equal(
        JSON.parse(hit.body).id,
        hit.headers["mirotaract-webhook-id"],
      );
    }
    assert.equal(
      mock.connections[0].headers.authorization,
      `Basic ${Buffer.from("mra_test:mrs_test").toString("base64")}`,
    );
    assert.equal(mock.connections[0].headers.accept, "text/event-stream");
  });

  test("--events filters client side", async () => {
    receiver.received.length = 0;
    const mock = await startMockKernel({ secret: "whsec_fixed" });
    const controller = new AbortController();
    const out = sink();
    const done = listenWebhooks(
      options(mock, receiver, { events: ["ping.*"] }),
      {
        out,
        err: sink(),
        signal: controller.signal,
      },
    );
    await waitFor(
      () => /filtrado/.test(out.text) && receiver.received.length === 1,
    );
    controller.abort();
    const stats = await done;
    await mock.close();
    assert.equal(stats.skipped, 1);
    assert.equal(JSON.parse(receiver.received[0].body).type, "ping.v1");
  });

  test("reconnects with backoff when the stream drops, sending Last-Event-ID", async () => {
    receiver.received.length = 0;
    const mock = await startMockKernel({
      secret: "whsec_fixed",
      script: (index, send, end, secret) => {
        send("ready", { secret });
        const event = streamEvent(secret, "membership.ended.v1", { n: index });
        send("webhook", event.payload, `cursor-${index}`);
        if (index === 0) setTimeout(end, 20); // first connection drops
      },
    });
    const controller = new AbortController();
    const err = sink();
    const out = sink();
    const done = listenWebhooks(options(mock, receiver), {
      out,
      err,
      signal: controller.signal,
    });
    await waitFor(
      () => receiver.received.length === 2 && mock.connections.length === 2,
    );
    controller.abort();
    const stats = await done;
    await mock.close();
    assert.equal(stats.connections, 2);
    assert.equal(mock.connections[1].headers["last-event-id"], "cursor-0");
    assert.match(err.text, /reconectando/);
    assert.match(out.text, /Reconectado/);
  });

  test("reports receiver errors without stopping", async () => {
    const failing = await startReceiver({ status: 500 });
    failing.setSecret("whsec_fixed");
    const mock = await startMockKernel({ secret: "whsec_fixed" });
    const controller = new AbortController();
    const out = sink();
    const done = listenWebhooks(options(mock, failing), {
      out,
      err: sink(),
      signal: controller.signal,
    });
    await waitFor(() => failing.received.length === 2);
    controller.abort();
    const stats = await done;
    await mock.close();
    await failing.close();
    assert.equal(stats.failed, 2);
    assert.match(out.text, /→ 500/);
  });

  test("unreachable target is reported per event", async () => {
    const mock = await startMockKernel({ secret: "whsec_fixed" });
    const controller = new AbortController();
    const out = sink();
    const done = listenWebhooks(
      options(mock, {
        url: `http://127.0.0.1:${await closedPort()}/api/webhooks`,
      }),
      { out, err: sink(), signal: controller.signal },
    );
    await waitFor(() => (out.text.match(/→ error/g) ?? []).length === 2);
    controller.abort();
    await done;
    await mock.close();
    assert.match(out.text, /→ error: ECONNREFUSED/);
  });

  test("bad credentials and unknown app are fatal, with hints", async () => {
    const mock = await startMockKernel();
    await assert.rejects(
      listenWebhooks(options(mock, receiver, { clientSecret: "nope" }), {
        out: sink(),
        err: sink(),
      }),
      /rechazó las credenciales.*401/,
    );
    await assert.rejects(
      listenWebhooks(options(mock, receiver, { appId: "otra" }), {
        out: sink(),
        err: sink(),
      }),
      /no tiene el stream de webhooks/,
    );
    await mock.close();
  });

  test("network errors are retried until aborted", async () => {
    const err = sink();
    const controller = new AbortController();
    const done = listenWebhooks(
      {
        ...options(
          { baseUrl: `http://127.0.0.1:${await closedPort()}/api/kernel/v1` },
          receiver,
        ),
        maxReconnects: 2,
      },
      { out: sink(), err, signal: controller.signal },
    );
    const stats = await done;
    assert.equal(stats.connections, 0);
    assert.equal(
      (err.text.match(/No pude conectar.*ECONNREFUSED/g) ?? []).length,
      3,
    );
  });

  test("CLI: `webhooks listen` reads .env.local", async () => {
    const mock = await startMockKernel({
      secret: "whsec_fixed",
      script: (_i, send, end, secret) => {
        send("ready", { secret });
        // The CLI exits when the stream errors fatally; here: 401 on reconnect.
        setTimeout(end, 30);
      },
    });
    const cwd = mkdtempSync(join(tmpdir(), "mr-listen-cli-"));
    writeFileSync(
      join(cwd, ".env.local"),
      `MIROTARACT_BASE_URL=${mock.baseUrl}\nMIROTARACT_APP_ID=${APP.id}\nMIROTARACT_CLIENT_ID=${APP.clientId}\nMIROTARACT_CLIENT_SECRET=${APP.clientSecret}\n`,
    );
    const out = sink();
    const err = sink();
    const pending = run(["webhooks", "listen", "--forward-to", receiver.url], {
      cwd,
      env: {},
      out,
      err,
    });
    await waitFor(() => /whsec_fixed/.test(out.text));
    process.emit("SIGINT");
    const code = await pending;
    await mock.close();
    assert.equal(code, 130);
    assert.match(err.text, /Recibidos 0/);
  });
});
