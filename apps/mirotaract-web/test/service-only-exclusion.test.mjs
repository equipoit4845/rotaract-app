import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

// The 10 `x-service-only: true` operationIds from kernel-openapi.yaml — these
// require `serviceAuth` and must never be reachable from browser code.
const SERVICE_ONLY_OPERATION_IDS = [
  "introspectToken",
  "serviceGetUserContext",
  "serviceGetPerson",
  "serviceGetOrganization",
  "serviceGetMembershipSnapshot",
  "serviceGetAuthoritySnapshot",
  "serviceGetPeriodSnapshot",
  "serviceCheckAuthorization",
  "serviceBatchCheckAuthorization",
  "serviceGetModuleInstallation",
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

test("no /service/* path or serviceAuth-only operationId is referenced outside the generated schema", async () => {
  const srcDir = new URL("../src", import.meta.url).pathname;
  const offenders = [];
  for await (const file of walk(srcDir)) {
    if (file.endsWith("client/schema.ts")) continue;
    const content = await readFile(file, "utf8");
    if (/["'`]\/service\//.test(content))
      offenders.push(`${file}: literal /service/ path`);
    for (const opId of SERVICE_ONLY_OPERATION_IDS) {
      if (content.includes(opId)) offenders.push(`${file}: references ${opId}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the public barrel (src/lib/api/index.ts) exports nothing service-only-flavored", async () => {
  const content = await readFile(
    new URL("../src/lib/api/index.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(content, /service/i);
  assert.doesNotMatch(content, /introspect/i);
});
