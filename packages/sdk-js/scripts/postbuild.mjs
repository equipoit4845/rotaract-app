// Post-build:
// - dist/cjs/package.json marks dist/cjs/*.js as CommonJS (the package is
//   "type": "module").
// - tsc rewrites relative ".ts" imports in .js output but not in .d.ts files;
//   point declarations at ".js" so any consumer's TypeScript resolves them.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dist = new URL("../dist/", import.meta.url);

writeFileSync(
  new URL("cjs/package.json", dist),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);

for (const flavor of ["esm", "cjs"]) {
  const dir = new URL(`${flavor}/`, dist);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".d.ts")) continue;
    const path = new URL(file, dir);
    const source = readFileSync(path, "utf8");
    writeFileSync(
      path,
      source.replace(/(["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2"),
    );
  }
}
