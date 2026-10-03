#!/usr/bin/env node
// stdio transport: stdout is the protocol channel, so diagnostics go to stderr only.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer, VERSION } from "../src/server.js";

if (process.argv.includes("--version")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

try {
  const { server, config } = await createServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `mirotaract-mcp ${VERSION} listo (stdio). Kernel: ${config.baseUrl ?? "ninguno"} → ${config.mode === "sandbox" ? "sandbox local habilitado" : "solo lectura de docs y contratos"}.\n`,
  );
} catch (error) {
  process.stderr.write(`mirotaract-mcp no pudo arrancar: ${error?.stack ?? error}\n`);
  process.exit(1);
}
