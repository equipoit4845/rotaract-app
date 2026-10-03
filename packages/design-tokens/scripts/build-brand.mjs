#!/usr/bin/env node
/**
 * Brand assets of Rotaract Distrito 4845, all derived from ONE source:
 * assets/logo-rotaract-distrito-4845.svg (the official lockup, tightly
 * cropped, cranberry #d41a68, grouped as #wordmark / #wheel / #district).
 *
 * Nothing is redrawn: every output copies the source's path data and
 * transforms verbatim and only changes the viewBox (crop) or the fill.
 *
 *   node packages/design-tokens/scripts/build-brand.mjs
 *
 * writes
 *   assets/logo-rotaract-distrito-4845-mono.svg  lockup in currentColor
 *   assets/logo-rotaract-mark.svg                the wheel alone (cranberry)
 *   assets/icon.svg                              the wheel with a little air, for favicons
 *   <app>/…/logo.tsx                             one self-contained <Logo /> per front-end
 *                                                (see COMPONENT_TARGETS), plus packages/icons
 *
 *   node packages/design-tokens/scripts/build-brand.mjs --png
 *
 * also rasterizes them (favicons, app icons, the e-mail header, the portal's
 * Open Graph image) with headless Chromium in Docker (zenika/alpine-chrome:
 * there is no native SVG rasterizer on the VPS) and copies each file to the
 * apps (see PNG_TARGETS).
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const repo = resolve(pkg, "../..");
const assets = join(pkg, "assets");

export const BRAND_COLOR = "#d41a68";
/** Tight crop of the lockup (artwork spans x 23.73–213.40, y 24.62–90.85). */
export const LOCKUP_BOX = [23.2, 24.1, 190.7, 67.3];
/** Tight square around the wheel (x 152.96–213.40, y 24.62–85.07). */
export const MARK_BOX = [152.58, 24.25, 61.2, 61.2];
/** The wheel with ~2.5% air on every side, for favicons and app icons. */
export const ICON_BOX = [151.18, 22.85, 64, 64];

const COMPONENT_TARGETS = [
  "apps/mirotaract-web/src/components/brand.tsx",
  "apps/meetings-web/src/components/layout/Logo.tsx",
  "apps/developers-portal/src/components/logo.tsx",
  "packages/icons/src/icons/logo.tsx",
];

export function readSource() {
  const svg = readFileSync(
    join(assets, "logo-rotaract-distrito-4845.svg"),
    "utf8",
  );
  const group = (id) => {
    const match = svg.match(new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`));
    if (!match) throw new Error(`source SVG has no <g id="${id}">`);
    return [
      ...match[1].matchAll(/<path transform="([^"]+)" d="([^"]+)"\/>/g),
    ].map((m) => [m[1], m[2]]);
  };
  return {
    wordmark: group("wordmark"),
    wheel: group("wheel"),
    district: group("district"),
  };
}

const box = (b) => b.join(" ");
const paths = (list) =>
  list.map(([t, d]) => `<path transform="${t}" d="${d}"/>`).join("\n");

function svgFile(viewBox, fill, body, title) {
  const [, , w, h] = viewBox;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box(viewBox)}">\n` +
    `<title>${title}</title>\n<g fill="${fill}">\n${body}\n</g>\n</svg>\n`
  );
}

function component({ wordmark, wheel, district }) {
  const list = (items) =>
    `[\n${items.map(([t, d]) => `  [${JSON.stringify(t)}, ${JSON.stringify(d)}],`).join("\n")}\n]`;
  return `/**
 * Logo oficial de Rotaract Distrito 4845.
 *
 * GENERADO por packages/design-tokens/scripts/build-brand.mjs desde
 * packages/design-tokens/assets/logo-rotaract-distrito-4845.svg: no lo
 * edites a mano (los trazos son los del archivo oficial, sin redibujar).
 *
 * - variant="lockup" (por defecto): "Rotaract", la rueda y "Distrito 4845".
 * - variant="mark": la rueda sola, para lugares chicos.
 * - tone="brand" (por defecto): arándano #d41a68, o el valor de la variable
 *   CSS --brand-logo (el tema la pone en blanco en modo oscuro).
 * - tone="current": currentColor, para fondos de color (texto blanco).
 *
 * size es el alto en px; el ancho sale de la proporción del dibujo.
 */
import type { SVGProps } from "react";

type Path = readonly [transform: string, d: string];

const WORDMARK: readonly Path[] = ${list(wordmark)};

const WHEEL: readonly Path[] = ${list(wheel)};

const DISTRICT: readonly Path[] = ${list(district)};

const LOCKUP_BOX = [${LOCKUP_BOX.join(", ")}] as const;
const MARK_BOX = [${MARK_BOX.join(", ")}] as const;

export type LogoProps = Omit<
  SVGProps<SVGSVGElement>,
  "viewBox" | "children" | "width" | "height" | "fill" | "ref"
> & {
  variant?: "lockup" | "mark";
  /** Alto en px. */
  size?: number;
  tone?: "brand" | "current";
  title?: string;
};

export function Logo({
  variant = "lockup",
  size = 32,
  tone = "brand",
  title = "Rotaract Distrito 4845",
  style,
  ...props
}: LogoProps) {
  const lockup = variant === "lockup";
  const [x, y, w, h] = lockup ? LOCKUP_BOX : MARK_BOX;
  const shapes = lockup ? [...WORDMARK, ...WHEEL, ...DISTRICT] : WHEEL;
  const decorative =
    props["aria-hidden"] === true || props["aria-hidden"] === "true";
  return (
    <svg
      {...props}
      width={Math.round((size * w * 100) / h) / 100}
      height={size}
      viewBox={\`\${x} \${y} \${w} \${h}\`}
      fill="currentColor"
      focusable="false"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      style={
        tone === "brand"
          ? { color: "var(--brand-logo, ${BRAND_COLOR})", ...style }
          : style
      }
    >
      {decorative ? null : <title>{title}</title>}
      {shapes.map(([transform, d], index) => (
        <path key={index} transform={transform} d={d} />
      ))}
    </svg>
  );
}
`;
}

export function build() {
  const source = readSource();
  const all = [...source.wordmark, ...source.wheel, ...source.district];
  const outputs = {
    [join(assets, "logo-rotaract-distrito-4845-mono.svg")]: svgFile(
      LOCKUP_BOX,
      "currentColor",
      paths(all),
      "Rotaract Distrito 4845",
    ),
    [join(assets, "logo-rotaract-mark.svg")]: svgFile(
      MARK_BOX,
      BRAND_COLOR,
      paths(source.wheel),
      "Rotaract",
    ),
    [join(assets, "icon.svg")]: svgFile(
      ICON_BOX,
      BRAND_COLOR,
      paths(source.wheel),
      "Rotaract",
    ),
  };
  const tsx = component(source);
  for (const target of COMPONENT_TARGETS) outputs[join(repo, target)] = tsx;
  for (const [file, content] of Object.entries(outputs))
    writeFileSync(file, content);
  // The apps lint with prettier --check.
  const format = spawnSync(
    join(repo, "node_modules/.bin/prettier"),
    ["--write", ...COMPONENT_TARGETS.map((target) => join(repo, target))],
    { encoding: "utf8" },
  );
  if (format.status !== 0)
    console.warn(`prettier did not run:\n${format.stderr ?? format.error}`);
  return Object.keys(outputs);
}

// --- PNG ------------------------------------------------------------------

/**
 * Rasters, written to assets/. `scale` is the share of the canvas the
 * drawing's box takes (centered); `bg` fills the canvas first (app icons are
 * opaque: iOS paints transparent pixels black).
 */
const PNGS = [
  { name: "icon-16.png", svg: "icon.svg", w: 16, h: 16 },
  { name: "icon-32.png", svg: "icon.svg", w: 32, h: 32 },
  { name: "icon-48.png", svg: "icon.svg", w: 48, h: 48 },
  ...[180, 192, 512].map((size) => ({
    name: `icon-${size}.png`,
    svg: "logo-rotaract-mark.svg",
    w: size,
    h: size,
    scale: 0.72,
    bg: "#ffffff",
  })),
  // E-mail header: 200 px wide in the message, rendered at 2x.
  {
    name: "logo-rotaract-distrito-4845.png",
    svg: "logo-rotaract-distrito-4845.svg",
    w: 400,
    h: Math.round((400 * LOCKUP_BOX[3]) / LOCKUP_BOX[2]),
  },
  {
    name: "opengraph-image.png",
    svg: "logo-rotaract-distrito-4845.svg",
    w: 1200,
    h: 630,
    scale: 0.6,
    bg: "#ffffff",
  },
];

/** assets/<file> → where each app picks it up (Next.js file conventions). */
const PNG_TARGETS = {
  "icon.svg": [
    "apps/mirotaract-web/src/app/icon.svg",
    "apps/meetings-web/src/app/icon.svg",
    "apps/developers-portal/src/app/icon.svg",
  ],
  "favicon.ico": [
    "apps/mirotaract-web/src/app/favicon.ico",
    "apps/meetings-web/src/app/favicon.ico",
    "apps/developers-portal/src/app/favicon.ico",
  ],
  "icon-180.png": [
    "apps/mirotaract-web/src/app/apple-icon.png",
    "apps/meetings-web/src/app/apple-icon.png",
    "apps/developers-portal/src/app/apple-icon.png",
  ],
  "icon-192.png": ["apps/mirotaract-web/public/brand/icon-192.png"],
  "icon-512.png": ["apps/mirotaract-web/public/brand/icon-512.png"],
  "logo-rotaract-distrito-4845.png": [
    "apps/mirotaract-web/public/brand/logo-rotaract-distrito-4845.png",
  ],
  "opengraph-image.png": ["apps/developers-portal/src/app/opengraph-image.png"],
};

function renderPage() {
  return `<!doctype html><html><body><script>
const specs = ${JSON.stringify(
    PNGS.map((spec) => ({
      ...spec,
      ratio: spec.svg.startsWith("logo-rotaract-distrito")
        ? LOCKUP_BOX[2] / LOCKUP_BOX[3]
        : 1,
    })),
  )};
const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
(async () => {
  for (const s of specs) {
    const img = await load(s.svg);
    const c = document.createElement("canvas"); c.width = s.w; c.height = s.h;
    const x = c.getContext("2d");
    if (s.bg) { x.fillStyle = s.bg; x.fillRect(0, 0, s.w, s.h); }
    const scale = s.scale ?? 1;
    const ratio = s.ratio;
    let dw = s.w * scale, dh = dw / ratio;
    if (dh > s.h * scale) { dh = s.h * scale; dw = dh * ratio; }
    x.drawImage(img, (s.w - dw) / 2, (s.h - dh) / 2, dw, dh);
    const out = document.createElement("pre"); out.id = s.name;
    out.textContent = c.toDataURL("image/png").split(",")[1];
    document.body.append(out);
  }
  document.body.append(Object.assign(document.createElement("i"), { id: "done" }));
})();
</script></body></html>`;
}

/** A .ico that embeds PNGs (supported by every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

export function rasterize() {
  const work = mkdtempSync(join(tmpdir(), "brand-png-"));
  try {
    for (const svg of new Set(PNGS.map((spec) => spec.svg)))
      copyFileSync(join(assets, svg), join(work, svg));
    writeFileSync(join(work, "render.html"), renderPage());
    const run = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "-v",
        `${work}:/w:ro`,
        "--entrypoint",
        "chromium-browser",
        "zenika/alpine-chrome:latest",
        "--no-sandbox",
        "--headless",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--allow-file-access-from-files",
        "--disable-web-security",
        "--user-data-dir=/tmp/cr",
        "--virtual-time-budget=10000",
        "--dump-dom",
        "file:///w/render.html",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (!run.stdout.includes('id="done"'))
      throw new Error(`Chromium did not finish:\n${run.stderr}`);
    for (const spec of PNGS) {
      const match = run.stdout.match(
        new RegExp(
          `<pre id="${spec.name.replace(/\./g, "\\.")}">([^<]+)</pre>`,
        ),
      );
      if (!match) throw new Error(`no output for ${spec.name}`);
      writeFileSync(join(assets, spec.name), Buffer.from(match[1], "base64"));
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  writeFileSync(
    join(assets, "favicon.ico"),
    ico(
      [16, 32, 48].map((size) => ({
        size,
        data: readFileSync(join(assets, `icon-${size}.png`)),
      })),
    ),
  );
  const written = [];
  for (const [file, targets] of Object.entries(PNG_TARGETS))
    for (const target of targets) {
      mkdirSync(dirname(join(repo, target)), { recursive: true });
      copyFileSync(join(assets, file), join(repo, target));
      written.push(join(repo, target));
    }
  return [
    ...PNGS.map((spec) => join(assets, spec.name)),
    join(assets, "favicon.ico"),
    ...written,
  ];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const files = build();
  if (process.argv.includes("--png")) files.push(...rasterize());
  for (const file of files) console.log(file.replace(`${repo}/`, ""));
}
