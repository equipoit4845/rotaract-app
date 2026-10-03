// Against a real local kernel (`mirotaract dev up`), over stdio. Skipped unless
// MIROTARACT_MCP_LIVE_URL=http://localhost:54321/api/kernel/v1 is set.
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LIVE = process.env.MIROTARACT_MCP_LIVE_URL;
const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  "../bin/mirotaract-mcp.js",
);

test(
  "sandbox tools against a live local kernel",
  { skip: !LIVE && "MIROTARACT_MCP_LIVE_URL no está definido" },
  async () => {
    const client = new Client({ name: "live", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [BIN],
        env: { PATH: process.env.PATH ?? "", MIROTARACT_BASE_URL: LIVE },
        stderr: "pipe",
      }),
    );
    try {
      const created = await client.callTool({
        name: "create_test_app",
        arguments: {
          name: "MCP live test",
          scopes: [
            "kernel.service.organizations.read",
            "kernel.service.memberships.read",
          ],
          organization: "Sandbox Norte",
        },
      });
      assert.ok(!created.isError, created.content[0].text);
      const app = JSON.parse(created.content[0].text);
      assert.match(app.app.clientId, /^mra_[0-9a-f]{20}$/);
      assert.match(app.clientSecret, /^mrs_/);
      assert.equal(app.organization.name, "Rotaract Club Sandbox Norte");
      assert.match(app.organization.code, /^SBX-/);

      const token = await client.callTool({
        name: "issue_test_token",
        arguments: { scope: "kernel.service.memberships.read" },
      });
      assert.ok(!token.isError, token.content[0].text);
      const issued = JSON.parse(token.content[0].text);
      assert.equal(issued.scope, "kernel.service.memberships.read");
      assert.equal(issued.claims.token_use, "service");
      assert.equal(issued.claims.aud, "institutional-kernel");
      assert.equal(issued.header.alg, "ES256");

      // The token really works against the sandbox, and only sees synthetic data.
      const members = await fetch(
        `${LIVE}/service/organizations/${app.organization.id}/members?limit=5`,
        { headers: { authorization: `Bearer ${issued.accessToken}` } },
      );
      assert.equal(members.status, 200);
      const page = await members.json();
      for (const m of page.items)
        assert.doesNotMatch(
          JSON.stringify(m),
          /@(?!example\.org)[a-z0-9.-]+\.[a-z]+/i,
        );

      const tooMuch = await client.callTool({
        name: "issue_test_token",
        arguments: { scope: "kernel.service.persons.contact.read" },
      });
      assert.equal(tooMuch.isError, true);
    } finally {
      await client.close();
    }
  },
);
