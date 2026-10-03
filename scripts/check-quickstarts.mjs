#!/usr/bin/env node
/**
 * E9.1 — the quickstarts' code must work. For every
 * docs/developers/quickstart-*.md:
 *
 *   ```ts runnable file=src/server.ts                      → typechecked
 *   ```python runnable file=app/main.py                    → compiled + SDK names + mypy
 *   ```ts runnable file=src/lib/x.ts from=packages/cli/…   → also identical to the template
 *   ```dart file=lib/src/x.dart from=packages/cli/…        → identical to the template
 *
 * TypeScript blocks of one quickstart form one project (tsc --noEmit against
 * the built @mirotaract/sdk, Next.js, React and Express types from
 * apps/developers-portal). Python blocks are compiled, their imports from
 * `mirotaract` checked against sdks/python, and type-checked with mypy when
 * it is installed. `from=` keeps quickstarts and `mirotaract init` templates
 * from drifting apart. Usage: pnpm quickstarts:check (docs/16-developer-portal.md).
 *
 * Env: MR_PYTHON (interpreter, default python3), MR_REQUIRE_PYTHON=true
 * (fail instead of skipping when the SDK's dependencies are missing),
 * MR_REQUIRE_MYPY=true (fail when mypy is not installed).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs/developers");
const portal = join(root, "apps/developers-portal");
const workDir = join(portal, ".quickstarts");
const python = process.env.MR_PYTHON || "python3";
const requirePython = process.env.MR_REQUIRE_PYTHON === "true";
const requireMypy = process.env.MR_REQUIRE_MYPY === "true";

const failures = [];
const notices = [];
const fail = (message) => failures.push(message);

/** Fenced blocks with their info string parsed into lang, flags and key=value attributes. */
export function parseBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const open = lines[i].match(/^(`{3,})(\S*)\s*(.*)$/);
    if (!open) continue;
    const [, fence, lang, info] = open;
    const body = [];
    let j = i + 1;
    while (j < lines.length && lines[j] !== fence) body.push(lines[j++]);
    const attrs = {};
    const flags = new Set();
    for (const token of info.split(/\s+/).filter(Boolean)) {
      const [key, ...value] = token.split("=");
      if (value.length) attrs[key] = value.join("=");
      else flags.add(key);
    }
    blocks.push({ lang, attrs, flags, code: body.join("\n"), line: i + 1 });
    i = j;
  }
  return blocks;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function writeTree(base, files) {
  for (const [file, code] of files) {
    const target = join(base, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${code}\n`);
  }
}

function checkTypeScript(name, files) {
  const sdkTypes = join(root, "packages/sdk-js/dist/esm/index.d.ts");
  if (!existsSync(sdkTypes)) {
    fail(
      `${name}: falta compilar el SDK de JS (pnpm --filter @mirotaract/sdk build)`,
    );
    return;
  }
  const dir = join(workDir, name);
  rmSync(dir, { recursive: true, force: true });
  writeTree(dir, files);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "esnext"],
          strict: true,
          noEmit: true,
          module: "esnext",
          moduleResolution: "bundler",
          jsx: "preserve",
          esModuleInterop: true,
          skipLibCheck: true,
          isolatedModules: true,
          resolveJsonModule: true,
          types: ["node"],
          paths: { "@/*": ["./src/*"] },
        },
        include: ["**/*.ts", "**/*.tsx"],
      },
      null,
      2,
    ),
  );
  const tsc = join(portal, "node_modules/.bin/tsc");
  const result = run(tsc, ["-p", dir, "--pretty", "false"], { cwd: dir });
  if (result.status !== 0)
    fail(
      `${name}: tsc falló\n${(result.stdout + result.stderr)
        .trim()
        .split("\n")
        .map((line) => `    ${line.replace(`${dir}/`, "")}`)
        .join("\n")}`,
    );
  else console.log(`  ✓ ${name}: TypeScript (${files.length} archivos)`);
}

const PY_SDK_CHECK = String.raw`
import ast, importlib, json, sys
files = json.loads(sys.argv[1])
missing_dep = None
problems = []
for path in files:
    tree = ast.parse(open(path, encoding="utf-8").read(), path)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.split(".")[0] == "mirotaract":
            try:
                module = importlib.import_module(node.module)
            except ModuleNotFoundError as error:
                if error.name and not error.name.startswith("mirotaract"):
                    missing_dep = error.name
                    continue
                problems.append(f"{path}: no existe el módulo {node.module}")
                continue
            for alias in node.names:
                if not hasattr(module, alias.name):
                    problems.append(f"{path}:{node.lineno}: {node.module} no exporta {alias.name}")
print(json.dumps({"problems": problems, "missing_dep": missing_dep}))
`;

function checkPython(name, files) {
  const dir = mkdtempSync(join(tmpdir(), `quickstart-${name}-`));
  try {
    writeTree(dir, files);
    // Packages for relative imports (`from .config import …`).
    for (const [file] of files) {
      let folder = dirname(file);
      while (folder && folder !== ".") {
        const init = join(dir, folder, "__init__.py");
        if (!existsSync(init)) writeFileSync(init, "");
        folder = dirname(folder);
      }
    }
    const paths = files.map(([file]) => join(dir, file));
    const compiled = run(python, ["-m", "py_compile", ...paths]);
    if (compiled.error) {
      const message = `${name}: no hay intérprete de Python (${python})`;
      if (requirePython) fail(message);
      else notices.push(message);
      return;
    }
    if (compiled.status !== 0) {
      fail(`${name}: error de sintaxis\n${compiled.stderr}`);
      return;
    }
    const env = {
      ...process.env,
      PYTHONPATH: [join(root, "sdks/python/src"), dir].join(":"),
    };
    const sdk = run(python, ["-c", PY_SDK_CHECK, JSON.stringify(paths)], {
      env,
    });
    if (sdk.status !== 0) {
      fail(`${name}: no se pudo revisar el SDK\n${sdk.stderr}`);
      return;
    }
    const report = JSON.parse(sdk.stdout.trim().split("\n").pop());
    for (const problem of report.problems)
      fail(`${name}: ${problem.replace(`${dir}/`, "")}`);
    if (report.missing_dep) {
      const message = `${name}: falta la dependencia de Python "${report.missing_dep}" para importar el SDK (usá MR_PYTHON con un venv que tenga httpx y PyJWT)`;
      if (requirePython) fail(message);
      else notices.push(message);
    }
    const hasMypy = run(python, ["-m", "mypy", "--version"]).status === 0;
    if (hasMypy) {
      const mypy = run(
        python,
        [
          "-m",
          "mypy",
          "--python-version",
          "3.10",
          "--ignore-missing-imports",
          "--no-error-summary",
          "--cache-dir",
          join(dir, ".mypy_cache"),
          ...files.map(([file]) => file),
        ],
        {
          cwd: dir,
          env: { ...env, MYPYPATH: join(root, "sdks/python/src") },
        },
      );
      if (mypy.status !== 0)
        fail(`${name}: mypy falló\n${(mypy.stdout + mypy.stderr).trim()}`);
    } else {
      const message = `${name}: mypy no está instalado; solo sintaxis e imports del SDK`;
      if (requireMypy) fail(message);
      else notices.push(message);
    }
    if (!failures.some((failure) => failure.startsWith(`${name}:`)))
      console.log(
        `  ✓ ${name}: Python (${files.length} archivos${hasMypy ? ", mypy" : ""})`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const docs = readdirSync(docsDir)
    .filter((file) => /^quickstart-.+\.md$/.test(file))
    .sort();
  if (docs.length === 0) fail("No hay quickstarts en docs/developers");
  for (const doc of docs) {
    const name = doc.replace(/^quickstart-|\.md$/g, "");
    const blocks = parseBlocks(readFileSync(join(docsDir, doc), "utf8"));
    const checked = blocks.filter(
      (block) => block.flags.has("runnable") || block.attrs.from,
    );
    console.log(`${doc}: ${checked.length} bloques verificables`);
    if (checked.length === 0)
      fail(`${doc}: ningún bloque marcado runnable o from=`);
    const ts = [];
    const py = [];
    for (const block of checked) {
      const where = `${doc}:${block.line}`;
      if (block.attrs.from) {
        const source = join(root, block.attrs.from);
        if (!existsSync(source))
          fail(`${where}: no existe ${block.attrs.from}`);
        else if (
          readFileSync(source, "utf8").replace(/\n+$/, "") !== block.code
        )
          fail(
            `${where}: distinto de ${block.attrs.from} (actualizá el quickstart o la plantilla)`,
          );
        else
          console.log(
            `  ✓ ${block.attrs.file ?? block.attrs.from} = plantilla`,
          );
      }
      if (!block.flags.has("runnable")) continue;
      if (!block.attrs.file) {
        fail(`${where}: un bloque runnable necesita file=<ruta>`);
        continue;
      }
      if (["ts", "tsx", "typescript"].includes(block.lang))
        ts.push([block.attrs.file, block.code]);
      else if (["python", "py"].includes(block.lang))
        py.push([block.attrs.file, block.code]);
      else fail(`${where}: no sé verificar bloques ${block.lang}`);
    }
    if (ts.length) checkTypeScript(name, ts);
    if (py.length) checkPython(name, py);
  }
  for (const notice of notices) console.log(`  · aviso: ${notice}`);
  if (failures.length) {
    console.error(`\n${failures.length} problema(s):`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`\nQuickstarts OK (${docs.length})`);
}

if (
  process.argv[1] &&
  relative(process.argv[1], fileURLToPath(import.meta.url)) === ""
)
  main();
