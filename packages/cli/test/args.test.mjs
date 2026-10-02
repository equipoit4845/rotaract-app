import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { run } from "../src/cli.js";
import {
  COMMANDS,
  commandHelp,
  parseCommand,
  parsePort,
  parseUrl,
} from "../src/lib/args.js";

function sink() {
  let text = "";
  return {
    write: (chunk) => (text += chunk),
    get text() {
      return text;
    },
  };
}

describe("parseCommand", () => {
  test("help and version", () => {
    assert.deepEqual(parseCommand([]), { help: null });
    assert.deepEqual(parseCommand(["--help"]), { help: null });
    assert.deepEqual(parseCommand(["-v"]), { version: true });
    assert.deepEqual(parseCommand(["dev"]), { help: null, group: "dev" });
    assert.deepEqual(parseCommand(["dev", "up", "-h"]), { help: "dev up" });
    assert.deepEqual(parseCommand(["help", "init"]), { help: "init" });
  });

  test("init with positional and flags", () => {
    const parsed = parseCommand([
      "init",
      "mi-app",
      "-t",
      "fastapi",
      "--kernel-repo",
      "/repo",
      "--force",
    ]);
    assert.equal(parsed.command, "init");
    assert.deepEqual(parsed.positionals, ["mi-app"]);
    assert.equal(parsed.values.template, "fastapi");
    assert.equal(parsed.values["kernel-repo"], "/repo");
    assert.equal(parsed.values.force, true);
  });

  test("subcommands, repeatable options and --flag=value", () => {
    const parsed = parseCommand([
      "dev",
      "up",
      "--api-port=60000",
      "--redirect-uri",
      "http://localhost:1/a",
      "--redirect-uri",
      "http://localhost:2/b",
      "--no-web",
    ]);
    assert.equal(parsed.command, "dev up");
    assert.equal(parsed.values["api-port"], "60000");
    assert.deepEqual(parsed.values["redirect-uri"], [
      "http://localhost:1/a",
      "http://localhost:2/b",
    ]);
    assert.equal(parsed.values["no-web"], true);
  });

  test("dev reset accepts the options of dev up", () => {
    const parsed = parseCommand([
      "dev",
      "reset",
      "--kernel-repo",
      "/r",
      "--api-port",
      "60000",
    ]);
    assert.equal(parsed.command, "dev reset");
    assert.equal(parsed.values["kernel-repo"], "/r");
  });

  test("clear errors in Spanish", () => {
    assert.throws(
      () => parseCommand(["deploy"]),
      /Comando desconocido: deploy/,
    );
    assert.throws(
      () => parseCommand(["dev", "nuke"]),
      (e) =>
        /Subcomando desconocido: dev nuke/.test(e.message) &&
        /dev up/.test(e.hint),
    );
    assert.throws(
      () => parseCommand(["dev", "up", "--bogus"]),
      (e) =>
        /Opción desconocida: --bogus/.test(e.message) &&
        /dev up --help/.test(e.hint),
    );
    assert.throws(
      () => parseCommand(["gen", "types", "--lang"]),
      /Falta el valor de la opción --lang/,
    );
    assert.throws(
      () => parseCommand(["dev", "status", "extra"]),
      /Sobran argumentos: extra/,
    );
    assert.throws(
      () => parseCommand(["init", "a", "b"]),
      /Sobran argumentos: b/,
    );
  });

  test("ports and urls", () => {
    assert.equal(parsePort(undefined, 54321, "--api-port"), 54321);
    assert.equal(parsePort("60000", 1, "--api-port"), 60000);
    assert.throws(() => parsePort("80", 1, "--api-port"), /entre 1024 y 65535/);
    assert.throws(
      () => parsePort("abc", 1, "--api-port"),
      /entre 1024 y 65535/,
    );
    assert.equal(
      parseUrl("http://localhost:3000/", "--app-url"),
      "http://localhost:3000",
    );
    assert.throws(
      () => parseUrl("ftp://x", "--app-url"),
      /http:\/\/ o https:\/\//,
    );
    assert.throws(() => parseUrl("nada", "--app-url"), /no es una URL válida/);
  });

  test("every command has Spanish help with its options", () => {
    for (const name of Object.keys(COMMANDS)) {
      const help = commandHelp(name);
      assert.match(help, /^Uso: mirotaract /);
      for (const option of Object.keys(COMMANDS[name].options))
        assert.match(help, new RegExp(`--${option}`));
    }
  });
});

describe("run()", () => {
  test("--help prints the command list and exits 0", async () => {
    const out = sink();
    assert.equal(await run(["--help"], { out, err: sink() }), 0);
    for (const name of ["init", "dev up", "gen types", "webhooks listen"])
      assert.match(out.text, new RegExp(name));
  });

  test("--version", async () => {
    const out = sink();
    assert.equal(await run(["--version"], { out, err: sink() }), 0);
    assert.match(out.text, /^\d+\.\d+\.\d+\n$/);
  });

  test("errors go to stderr with a hint and exit 1", async () => {
    const err = sink();
    assert.equal(
      await run(["init", "--template", "angular"], {
        out: sink(),
        err,
        cwd: "/tmp",
        env: {},
      }),
      1,
    );
    assert.match(err.text, /^Error: No conozco la plantilla "angular"/);
    assert.match(err.text, /Plantillas: next, fastapi, flutter/);
  });
});
