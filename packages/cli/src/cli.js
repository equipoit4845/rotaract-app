import { readFileSync } from "node:fs";

import { aiInstallCommand } from "./commands/ai.js";
import { devCommand } from "./commands/dev.js";
import { genTypesCommand } from "./commands/gen-types.js";
import { initCommand } from "./commands/init.js";
import { webhooksListenCommand } from "./commands/webhooks.js";
import { COMMANDS, commandHelp, mainHelp, parseCommand } from "./lib/args.js";
import { CliError } from "./lib/errors.js";

export const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

function groupHelp(group) {
  const names = Object.keys(COMMANDS).filter((name) =>
    name.startsWith(`${group} `),
  );
  return [
    `Uso: mirotaract ${group} <subcomando> [opciones]`,
    "",
    ...names.map((name) => `  ${name.padEnd(17)} ${COMMANDS[name].summary}`),
    "",
    `Más detalle: mirotaract ${names[0]} --help`,
  ].join("\n");
}

/**
 * Entry point. Returns the exit code. `ctx` makes it testable
 * (cwd, env, out/err streams, fetch, run).
 */
export async function run(argv, ctx = {}) {
  const context = {
    cwd: process.cwd(),
    env: process.env,
    out: process.stdout,
    err: process.stderr,
    ...ctx,
  };
  try {
    const parsed = parseCommand(argv);
    if (parsed.version) {
      context.out.write(`${VERSION}\n`);
      return 0;
    }
    if ("help" in parsed) {
      const text = parsed.help
        ? commandHelp(parsed.help)
        : parsed.group
          ? groupHelp(parsed.group)
          : mainHelp(VERSION);
      context.out.write(`${text}\n`);
      return 0;
    }
    const { command, values, positionals } = parsed;
    switch (command) {
      case "init":
        return await initCommand(values, positionals, context);
      case "ai install":
        return await aiInstallCommand(values, positionals, context);
      case "dev up":
      case "dev down":
      case "dev reset":
      case "dev status":
        return await devCommand(command.split(" ")[1], values, context);
      case "gen types":
        return await genTypesCommand(values, context);
      case "webhooks listen":
        return await webhooksListenCommand(values, context);
      default:
        throw new CliError(`Comando sin implementar: ${command}`);
    }
  } catch (error) {
    if (error instanceof CliError) {
      context.err.write(`Error: ${error.message}\n`);
      if (error.hint) context.err.write(`${error.hint}\n`);
      return error.exitCode;
    }
    context.err.write(`Error inesperado: ${error?.stack ?? error}\n`);
    context.err.write(
      "Si se repite, reportalo con el comando que corriste y esta salida.\n",
    );
    return 1;
  }
}
