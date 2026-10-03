/**
 * Child process of the webhook-runtime grader. Loads the solution's route
 * handler (exported POST(Request)) and sends it signed, tampered, stale,
 * unsigned and duplicate deliveries. Prints one JSON line.
 *   node --experimental-transform-types webhook-child.mjs <solutionDir> <entriesJson> <sdkDir>
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [dir, entriesJson, sdkDir] = process.argv.slice(2);
const SECRET = `whsec_${randomBytes(24).toString("base64url")}`;
process.env.MIROTARACT_WEBHOOK_SECRET = SECRET;
process.env.MIROTARACT_WEBHOOK_SECRETS = SECRET;

const report = (value) => {
  process.stdout.write(`\n@@RESULT ${JSON.stringify(value)}\n`);
  process.exit(0);
};

register(new URL("./hooks.mjs", import.meta.url), { data: { root: dir, sdkDir } });

const entry = JSON.parse(entriesJson).find((e) => existsSync(join(dir, e)));
if (!entry) report({ loaded: false, reason: "no encontré el archivo del endpoint" });

// The handler's console output must not mix with the report.
for (const level of ["log", "info", "warn", "error", "debug"]) console[level] = () => {};

let handler;
try {
  const mod = await import(pathToFileURL(join(dir, entry)).href);
  handler = mod.POST ?? mod.default?.POST ?? (typeof mod.default === "function" ? mod.default : null);
} catch (error) {
  report({ loaded: false, entry, reason: `no se pudo cargar ${entry}: ${String(error?.message ?? error).split("\n")[0]}` });
}
if (typeof handler !== "function") report({ loaded: false, entry, reason: `${entry} no exporta POST(request)` });

function envelope(id) {
  return {
    id,
    type: "membership.activated.v1",
    createdAt: new Date().toISOString(),
    organizationId: "cm1clubsandboxnorte00000",
    data: {
      membership: {
        membershipId: "cm1membership0000000001",
        organizationId: "cm1clubsandboxnorte00000",
        personId: "cm1person000000000000001",
        status: "ACTIVE",
        joinedAt: new Date().toISOString(),
        memberNumber: "1042",
        person: { id: "cm1person000000000000001", displayName: "Ana Ejemplo", firstName: "Ana", lastName: "Ejemplo", avatarUrl: null, updatedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      },
      previousStatus: "PENDING",
    },
  };
}

function delivery(raw, { id, timestamp = Math.floor(Date.now() / 1000), sign = true, tamper = false } = {}) {
  const headers = { "content-type": "application/json", "user-agent": "MiRotaract-Webhooks/1", "mirotaract-webhook-id": id, "mirotaract-webhook-timestamp": String(timestamp) };
  if (sign) headers["mirotaract-signature"] = `v1=${createHmac("sha256", SECRET).update(`${timestamp}.${raw}`).digest("hex")}`;
  const body = tamper ? raw.replace("Ana Ejemplo", "Ana Atacante") : raw;
  return new Request("http://localhost:3000/api/webhooks/mirotaract", { method: "POST", headers, body });
}

async function send(name, request, expect) {
  const started = Date.now();
  let status;
  try {
    const response = await Promise.race([handler(request), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000))]);
    status = response?.status ?? 0;
  } catch (error) {
    status = String(error?.message) === "timeout" ? "timeout" : 500;
  }
  const ms = Date.now() - started;
  const ok = expect === "2xx" ? typeof status === "number" && status >= 200 && status < 300 && ms < 2000 : typeof status === "number" && status >= 400 && status < 500;
  return { name, expect, status, ms, ok };
}

const id = `evt_${randomBytes(10).toString("hex")}`;
// Pretty-printed on purpose: re-serializing the parsed JSON changes the bytes.
const raw = JSON.stringify(envelope(id), null, 2);
const cases = [];
cases.push(await send("válido (cuerpo crudo, firmado)", delivery(raw, { id }), "2xx"));
cases.push(await send("duplicado (mismo id, reintento)", delivery(raw, { id }), "2xx"));
cases.push(await send("cuerpo modificado", delivery(raw, { id: `${id}x`, tamper: true }), "4xx"));
cases.push(await send("marca de tiempo vieja (1 h)", delivery(raw, { id: `${id}y`, timestamp: Math.floor(Date.now() / 1000) - 3600 }), "4xx"));
cases.push(await send("sin firma", delivery(raw, { id: `${id}z`, sign: false }), "4xx"));
report({ loaded: true, entry, cases });
