#!/usr/bin/env node
// Dev helper: prints what describe_operation returns for an operationId.
//   node scripts/describe.mjs serviceListMembers
import { loadBundle } from "../src/bundle.js";
import { describeOperation, findOperation } from "../src/openapi.js";

const bundle = await loadBundle();
const { found, suggestions = [] } = findOperation(bundle.openapi, { operationId: process.argv[2] });
if (!found) {
  process.stderr.write(`No encontrada. ${suggestions.map((s) => s.op.operationId).join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${describeOperation(bundle.openapi, found, bundle.permissions.endpointScopes).markdown}\n`);
