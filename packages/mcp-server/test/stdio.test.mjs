import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "../bin/mirotaract-mcp.js");

test("real stdio handshake: initialize, tools/list and tool calls", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN],
    env: { PATH: process.env.PATH ?? "", MIROTARACT_BASE_URL: "https://api.rotaract4845.com/api/kernel/v1" },
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion().name, "mirotaract");
    assert.ok(client.getServerCapabilities().tools);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);
    const search = await client.callTool({ name: "search_docs", arguments: { query: "client_credentials token de servicio" } });
    assert.match(search.content[0].text, /autenticacion-servidor\.md/);
    const op = await client.callTool({ name: "describe_operation", arguments: { operationId: "issueOAuthToken" } });
    assert.match(op.content[0].text, /POST \/oauth\/token/);
    const refused = await client.callTool({ name: "issue_test_token", arguments: { clientId: "mra_x", clientSecret: "y" } });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /solo lectura/);
  } finally {
    await client.close();
  }
});
