import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../examples");

test("client config examples are valid JSON pointing at the stdio bin", () => {
  const files = readdirSync(DIR);
  assert.deepEqual(files.sort(), [
    ".mcp.json",
    "cursor-mcp.json",
    "vscode-mcp.json",
  ]);
  for (const file of files) {
    const config = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    const server = (config.mcpServers ?? config.servers).mirotaract;
    assert.equal(server.command, "node", file);
    assert.match(
      server.args[0],
      /packages\/mcp-server\/bin\/mirotaract-mcp\.js$/,
      file,
    );
    assert.match(
      server.env.MIROTARACT_BASE_URL,
      /localhost:54321\/api\/kernel\/v1/,
      file,
    );
  }
});
