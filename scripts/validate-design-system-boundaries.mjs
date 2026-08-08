import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;

// Packages that make up the design system, and what each is allowed to
// import as a bare specifier (relative imports within the package's own
// `src` are always allowed and not checked here).
const PACKAGES = {
  "packages/design-tokens": { allow: [] },
  "packages/icons": { allow: ["react"] },
  "packages/ui": {
    allow: ["react", "react-dom", "@mirotaract/design-tokens", "@radix-ui/"],
  },
  "packages/admin-shell": {
    allow: [
      "react",
      "react-dom",
      "@mirotaract/design-tokens",
      "@mirotaract/ui",
      "@mirotaract/icons",
      "@radix-ui/",
    ],
  },
};

// Regardless of package, these are never allowed: Next.js, the Kernel SDK
// and its contracts, Prisma, auth middleware, and any `apps/*` source.
const BLANKET_BAN = [
  /^next(\/|$)/,
  /^@mirotaract\/kernel-sdk(\/|$)/,
  /^@mirotaract\/kernel-contracts(\/|$)/,
  /^@mirotaract\/auth-middleware(\/|$)/,
  /^@prisma\/client(\/|$)/,
  /(^|\/)apps\//,
];

// Runtime globals a purely-visual package must never touch: they imply
// network/storage/session context that belongs to the Web Shell.
const BANNED_GLOBALS = [
  { pattern: /\bfetch\s*\(/, label: "fetch(...)" },
  { pattern: /\blocalStorage\b/, label: "localStorage" },
  { pattern: /\bsessionStorage\b/, label: "sessionStorage" },
  { pattern: /\bdocument\.cookie\b/, label: "document.cookie" },
];

const IMPORT_RE = /(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']/g;
const BARE_IMPORT_RE = /^import\s+["']([^"']+)["']/gm;

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function isAllowed(specifier, allowList) {
  if (specifier.startsWith(".")) return true;
  return allowList.some((allowed) =>
    allowed.endsWith("/") ? specifier.startsWith(allowed) : specifier === allowed || specifier.startsWith(`${allowed}/`),
  );
}

const violations = [];

for (const [pkgPath, { allow }] of Object.entries(PACKAGES)) {
  const srcDir = join(root, pkgPath, "src");
  const files = await collectSourceFiles(srcDir);

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const rel = relative(root, file);

    const specifiers = new Set();
    for (const match of source.matchAll(IMPORT_RE)) specifiers.add(match[1]);
    for (const match of source.matchAll(BARE_IMPORT_RE)) specifiers.add(match[1]);

    for (const specifier of specifiers) {
      if (BLANKET_BAN.some((pattern) => pattern.test(specifier))) {
        violations.push(`${rel}: forbidden import "${specifier}" (Kernel/Next/Prisma/apps are off-limits to the design system)`);
        continue;
      }
      if (!isAllowed(specifier, allow)) {
        violations.push(`${rel}: import "${specifier}" is not in the allow-list for ${pkgPath} (${allow.join(", ") || "no external deps allowed"})`);
      }
    }

    for (const { pattern, label } of BANNED_GLOBALS) {
      if (pattern.test(source)) {
        violations.push(`${rel}: uses ${label} — design-system packages never touch network/storage directly`);
      }
    }
  }
}

if (violations.length) {
  throw new Error(`Design system boundary violations:\n- ${violations.join("\n- ")}`);
}

const packageCount = Object.keys(PACKAGES).length;
console.log(`Design system boundaries clean across ${packageCount} packages`);
