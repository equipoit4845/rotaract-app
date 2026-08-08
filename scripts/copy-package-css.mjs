import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

// Copies every *.css file from a package's src/ into its dist/ — tsc only
// emits .ts/.tsx, so CSS entry points (tokens.css, styles.css, reset.css)
// need a separate step before the package is publish-ready.
const packageDir = process.argv[2];
if (!packageDir) {
  throw new Error("Usage: node copy-package-css.mjs <package-dir>");
}

const srcDir = join(packageDir, "src");
const distDir = join(packageDir, "dist");

async function copyCssFiles(dir, base) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await copyCssFiles(fullPath, base);
      continue;
    }
    if (entry.name.endsWith(".css")) {
      const relative = fullPath.slice(base.length + 1);
      const target = join(distDir, relative);
      await mkdir(join(target, ".."), { recursive: true });
      await copyFile(fullPath, target);
      console.log(`copied ${relative}`);
    }
  }
}

await copyCssFiles(srcDir, srcDir);
