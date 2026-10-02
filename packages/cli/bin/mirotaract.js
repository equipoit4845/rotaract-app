#!/usr/bin/env node
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  process.stderr.write(
    `mirotaract necesita Node 20 o más nuevo (tenés ${process.versions.node}).\n`,
  );
  process.exit(1);
}

const { run } = await import("../src/cli.js");
process.exitCode = await run(process.argv.slice(2));
