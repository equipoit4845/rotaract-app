import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_API_PORT,
  DEFAULT_WEB_PORT,
  parsePort,
  parseUrl,
} from "../lib/args.js";
import { isGitIgnored, mergeEnvFile, readEnvFile } from "../lib/env-file.js";
import { CliError } from "../lib/errors.js";
import { run as defaultRun } from "../lib/process.js";
import { devDir, ensureSecrets, loadState, saveState } from "../lib/state.js";

export const PROJECT_NAME = "mirotaract-dev";
/** Ports of the production stack on the VPS (and common local services). */
const RESERVED_PORTS = new Set([3000, 3001, 4222, 5432, 6379, 8222]);
const COMPOSE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../compose",
);
const SANDBOX_MARKER = "MIROTARACT_SANDBOX_JSON=";

/** Keys `dev up` owns in the project's .env.local. */
export const MANAGED_ENV_KEYS = [
  "MIROTARACT_ISSUER",
  "MIROTARACT_BASE_URL",
  "MIROTARACT_WEB_URL",
  "MIROTARACT_APP_ID",
  "MIROTARACT_CLIENT_ID",
  "MIROTARACT_CLIENT_SECRET",
  "MIROTARACT_PUBLIC_CLIENT_ID",
  "MIROTARACT_ORGANIZATION_ID",
];

export function resolveKernelRepo(values, env) {
  const raw = values["kernel-repo"] ?? env.MIROTARACT_KERNEL_REPO;
  if (!raw) return null;
  const path = resolve(raw.replace(/^~(?=$|\/)/, env.HOME ?? "~"));
  for (const required of [
    "infra/docker/api.Dockerfile",
    "prisma/schema.prisma",
  ])
    if (!existsSync(join(path, required)))
      throw new CliError(
        `${path} no parece el repositorio del kernel (falta ${required}).`,
        {
          hint: "Pasá la ruta al checkout de rotaract-app con --kernel-repo o MIROTARACT_KERNEL_REPO.",
        },
      );
  if (!existsSync(join(path, "prisma/seed-synthetic.ts")))
    throw new CliError(
      `El kernel en ${path} no tiene prisma/seed-synthetic.ts.`,
      {
        hint: "Actualizá ese checkout: el distrito sintético llegó con la CLI (E6).",
      },
    );
  return path;
}

/** Options of `dev up` → a validated plan (no side effects). */
export function planDevUp(values, { cwd, env, state }) {
  const apiPort = parsePort(
    values["api-port"],
    state?.apiPort ?? DEFAULT_API_PORT,
    "--api-port",
  );
  const webPort = parsePort(
    values["web-port"],
    state?.webPort ?? DEFAULT_WEB_PORT,
    "--web-port",
  );
  if (apiPort === webPort)
    throw new CliError("--api-port y --web-port no pueden ser iguales.");
  for (const port of [apiPort, webPort])
    if (RESERVED_PORTS.has(port))
      throw new CliError(
        `El puerto ${port} está reservado (producción o servicios del kernel).`,
        {
          hint: `Usá otro, por ejemplo los de siempre: ${DEFAULT_API_PORT} y ${DEFAULT_WEB_PORT}.`,
        },
      );
  const envFile = resolve(cwd, values["env-path"] ?? ".env.local");
  const projectEnv = readEnvFile(envFile);
  const appUrl = parseUrl(
    values["app-url"] ?? projectEnv.APP_URL ?? "http://localhost:3000",
    "--app-url",
  );
  const redirectUris = [
    ...new Set([`${appUrl}/auth/callback`, ...(values["redirect-uri"] ?? [])]),
  ];
  for (const uri of redirectUris) {
    const url = new URL(parseUrl(uri, "--redirect-uri"));
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new CliError(`La dirección de regreso ${uri} no es local.`, {
        hint: "El kernel local solo registra http://localhost:<puerto>/… o http://127.0.0.1:<puerto>/….",
      });
  }
  const origins = [
    ...new Set([
      new URL(appUrl).origin,
      ...redirectUris.map((u) => new URL(u).origin),
    ]),
  ];
  const kernelRepo = values["no-build"] ? null : resolveKernelRepo(values, env);
  return {
    apiPort,
    webPort,
    envFile,
    appUrl,
    redirectUris,
    origins,
    kernelRepo,
    build: Boolean(kernelRepo),
    web: !values["no-web"],
    apiUrl: `http://localhost:${apiPort}/api/kernel/v1`,
    webUrl: `http://localhost:${webPort}`,
  };
}

/** Variables for docker compose (written to ~/.mirotaract/dev/dev.env). */
export function composeEnv(plan, secrets, env = process.env) {
  return {
    MIROTARACT_DEV_API_PORT: String(plan.apiPort),
    MIROTARACT_DEV_WEB_PORT: String(plan.webPort),
    MIROTARACT_DEV_DB_PASSWORD: secrets.dbPassword,
    MIROTARACT_DEV_JWT_SECRET: secrets.jwtSecret,
    MIROTARACT_DEV_SIGNING_KEY_SECRET: secrets.signingKeySecret,
    MIROTARACT_DEV_REDIRECT_URIS: plan.redirectUris.join(","),
    MIROTARACT_DEV_APP_ORIGINS: plan.origins.join(","),
    ...(plan.kernelRepo ? { MIROTARACT_KERNEL_REPO: plan.kernelRepo } : {}),
    ...(env.MIROTARACT_API_IMAGE
      ? { MIROTARACT_API_IMAGE: env.MIROTARACT_API_IMAGE }
      : {}),
    ...(env.MIROTARACT_WEB_IMAGE
      ? { MIROTARACT_WEB_IMAGE: env.MIROTARACT_WEB_IMAGE }
      : {}),
  };
}

export function composeArgs({ build, envFilePath }) {
  return [
    "compose",
    "-p",
    PROJECT_NAME,
    "--project-directory",
    COMPOSE_DIR,
    "-f",
    join(COMPOSE_DIR, "docker-compose.yml"),
    ...(build ? ["-f", join(COMPOSE_DIR, "docker-compose.build.yml")] : []),
    "--env-file",
    envFilePath,
  ];
}

/** Last `MIROTARACT_SANDBOX_JSON=` line of the setup output. */
export function parseSandboxOutput(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith(SANDBOX_MARKER));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(SANDBOX_MARKER.length));
  } catch {
    return null;
  }
}

/** What `dev up` writes to the project's .env.local. */
export function projectEnvValues(plan, sandbox) {
  return {
    MIROTARACT_ISSUER: plan.apiUrl,
    MIROTARACT_BASE_URL: plan.apiUrl,
    MIROTARACT_WEB_URL: plan.webUrl,
    MIROTARACT_APP_ID: sandbox.app.id,
    MIROTARACT_CLIENT_ID: sandbox.app.clientId,
    MIROTARACT_CLIENT_SECRET: sandbox.app.clientSecret,
    MIROTARACT_PUBLIC_CLIENT_ID: sandbox.publicApp?.clientId,
    MIROTARACT_ORGANIZATION_ID: sandbox.district.id,
    APP_URL: plan.appUrl,
    SESSION_SECRET: randomBytes(32).toString("base64url"),
  };
}

export function writeProjectEnv(plan, sandbox) {
  const changed = mergeEnvFile(plan.envFile, projectEnvValues(plan, sandbox), {
    header:
      "Kernel local de Mi Rotaract (escrito por `mirotaract dev up`).\nDatos sintéticos: no uses estos valores en producción.",
    keepExisting: ["APP_URL", "SESSION_SECRET"],
  });
  const gitignore = join(dirname(plan.envFile), ".gitignore");
  const name = plan.envFile.slice(dirname(plan.envFile).length + 1);
  const warnings = [];
  if (
    existsSync(gitignore) &&
    !isGitIgnored(readFileSync(gitignore, "utf8"), name)
  )
    warnings.push(
      `${name} no está en .gitignore: agregalo antes de hacer commit (tiene un secreto).`,
    );
  return { changed, warnings };
}

function portInUse(port) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(true));
    server.once("listening", () => server.close(() => resolvePromise(false)));
    server.listen(port, "127.0.0.1");
  });
}

async function ourPublishedPorts(runner) {
  const result = await runner(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.docker.compose.project=${PROJECT_NAME}`,
      "--format",
      "{{.Ports}}",
    ],
    { capture: true, quiet: true },
  );
  return parsePublishedPorts(result.stdout);
}

/** `docker ps` "Ports" column → host ports ("127.0.0.1:54321-54322->54321-54322/tcp" is a range). */
export function parsePublishedPorts(text) {
  const ports = new Set();
  for (const match of text.matchAll(/:(\d+)(?:-(\d+))?->/g)) {
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    for (let port = from; port <= to && port - from < 1000; port++)
      ports.add(port);
  }
  return ports;
}

async function ensureDocker(runner) {
  const result = await runner("docker", ["compose", "version"], {
    capture: true,
    quiet: true,
  });
  if (result.code !== 0)
    throw new CliError(
      "Docker no está disponible o no tiene el plugin compose v2.",
      {
        hint: "Instalá Docker Desktop / Docker Engine con `docker compose` y verificá que el daemon esté corriendo.",
      },
    );
}

async function compose(ctx, base, args, options = {}) {
  const result = await ctx.run(
    "docker",
    [...composeArgs(base), ...args],
    options,
  );
  if (result.code !== 0 && !options.allowFailure)
    throw new CliError(
      `Falló \`docker compose ${args.join(" ")}\` (código ${result.code}).`,
      {
        hint:
          options.hint ??
          "Revisá la salida de arriba. `mirotaract dev status` muestra el estado.",
      },
    );
  return result;
}

function writeComposeEnv(values) {
  const dir = devDir(values.__env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "dev.env");
  const { __env, ...vars } = values;
  writeFileSync(
    path,
    `${Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
  return path;
}

async function imageExists(ctx, image) {
  const result = await ctx.run("docker", ["image", "inspect", image], {
    capture: true,
    quiet: true,
  });
  return result.code === 0;
}

async function waitForKernel(ctx, apiUrl, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await ctx.fetch(
        `${apiUrl}/.well-known/openid-configuration`,
      );
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new CliError(`El kernel no respondió en ${apiUrl} (${lastError}).`, {
    hint: "Mirá los logs con `docker compose -p mirotaract-dev logs api`.",
  });
}

export async function devUp(values, ctx) {
  const state = loadState(ctx.env);
  const plan = planDevUp(values, { cwd: ctx.cwd, env: ctx.env, state });
  await ensureDocker(ctx.run);

  if (!plan.build) {
    const apiImage =
      ctx.env.MIROTARACT_API_IMAGE ?? "mirotaract-dev/kernel-api:local";
    if (!ctx.env.MIROTARACT_API_IMAGE && !(await imageExists(ctx, apiImage)))
      throw new CliError(
        "Falta el repositorio del kernel para construir las imágenes.",
        {
          hint: "Pasá --kernel-repo <ruta-a-rotaract-app> (o MIROTARACT_KERNEL_REPO), o definí MIROTARACT_API_IMAGE / MIROTARACT_WEB_IMAGE con imágenes publicadas.",
        },
      );
  }

  const ours = await ourPublishedPorts(ctx.run);
  for (const port of [plan.apiPort, plan.webPort])
    if (!ours.has(port) && (await portInUse(port)))
      throw new CliError(
        `El puerto ${port} ya está en uso por otro programa.`,
        {
          hint: "Elegí otros con --api-port / --web-port.",
        },
      );

  const secrets = ensureSecrets(state);
  const envFilePath = writeComposeEnv({
    ...composeEnv(plan, secrets, ctx.env),
    __env: ctx.env,
  });
  const base = { build: plan.build, envFilePath };
  const services = plan.web ? ["api", "web"] : ["api"];
  const say = (line) => ctx.err.write(`${line}\n`);

  if (plan.build) {
    say(
      `▸ Construyendo imágenes desde ${plan.kernelRepo} (la primera vez tarda varios minutos)…`,
    );
    await compose(ctx, base, ["build", ...services]);
  }
  say("▸ Levantando postgres y nats…");
  await compose(ctx, base, ["up", "-d", "--wait", "postgres", "nats"]);
  say("▸ Migraciones, seed base y distrito sintético…");
  const setup = await compose(ctx, base, ["run", "--rm", "-T", "setup"], {
    capture: true,
    hint: "Si el seed se negó a correr, la base no es sintética: `mirotaract dev reset` la recrea vacía.",
  });
  const sandbox = parseSandboxOutput(setup.stdout);
  if (!sandbox?.app?.clientSecret)
    throw new CliError(
      "El seed sintético no devolvió las credenciales de la app local.",
      {
        hint: "Revisá la salida de arriba.",
      },
    );
  say(`▸ Levantando ${services.join(" y ")}…`);
  await compose(ctx, base, [
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "300",
    ...services,
  ]);
  await waitForKernel(ctx, plan.apiUrl);

  const { warnings } = writeProjectEnv(plan, sandbox);
  const newState = {
    project: PROJECT_NAME,
    apiPort: plan.apiPort,
    webPort: plan.webPort,
    apiUrl: plan.apiUrl,
    webUrl: plan.webUrl,
    web: plan.web,
    build: plan.build,
    kernelRepo: plan.kernelRepo ?? state?.kernelRepo ?? null,
    envFile: plan.envFile,
    redirectUris: sandbox.app.redirectUris,
    district: sandbox.district,
    clubs: sandbox.clubs,
    password: sandbox.password,
    users: sandbox.users,
    app: { id: sandbox.app.id, clientId: sandbox.app.clientId },
    publicApp: sandbox.publicApp
      ? { id: sandbox.publicApp.id, clientId: sandbox.publicApp.clientId }
      : null,
    secrets,
    updatedAt: new Date().toISOString(),
  };
  saveState(newState, ctx.env);
  ctx.out.write(`${formatStatus(newState, { running: true })}\n`);
  ctx.out.write(`\nCredenciales escritas en ${plan.envFile}\n`);
  for (const warning of warnings) ctx.err.write(`⚠ ${warning}\n`);
  return 0;
}

export function formatStatus(state, { running, services = [] }) {
  const lines = [];
  lines.push(
    `Kernel local (${PROJECT_NAME}): ${running ? "corriendo" : "detenido"}`,
  );
  for (const service of services)
    lines.push(`  ${service.name.padEnd(9)} ${service.state}`);
  if (!state) {
    lines.push(
      "",
      "Todavía no se levantó nunca. Empezá con `mirotaract dev up --kernel-repo <ruta>`.",
    );
    return lines.join("\n");
  }
  lines.push(
    "",
    `API del kernel / issuer: ${state.apiUrl}`,
    `Web (login y consentimiento): ${state.web === false ? "(sin web: --no-web)" : state.webUrl}`,
    `Documentación de la API: ${new URL(state.apiUrl).origin}/docs`,
    "",
    `Distrito: ${state.district?.name} (${state.district?.id})`,
    `App local: client_id ${state.app?.clientId} · id ${state.app?.id}`,
  );
  if (state.publicApp)
    lines.push(`App PUBLIC (móvil/SPA): client_id ${state.publicApp.clientId}`);
  lines.push(
    `Direcciones de regreso: ${(state.redirectUris ?? []).join(", ")}`,
  );
  lines.push(
    "",
    `Cuentas de prueba (contraseña para todas: ${state.password}):`,
  );
  for (const user of state.users ?? [])
    lines.push(`  ${user.email.padEnd(34)} ${user.label}`);
  if (state.envFile)
    lines.push("", `Último .env.local escrito: ${state.envFile}`);
  return lines.join("\n");
}

async function composePs(ctx, base) {
  const result = await ctx.run(
    "docker",
    [...composeArgs(base), "ps", "--all", "--format", "json"],
    {
      capture: true,
      quiet: true,
    },
  );
  if (result.code !== 0) return [];
  const text = result.stdout.trim();
  if (!text) return [];
  const rows = text.startsWith("[")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  return rows.map((row) => ({
    name: row.Service,
    state: row.Status || row.State,
    running: row.State === "running",
  }));
}

function baseFromState(ctx, state) {
  // down/status don't build: the overlay isn't needed, only the variables.
  const secrets = ensureSecrets(state);
  const plan = {
    apiPort: state?.apiPort ?? DEFAULT_API_PORT,
    webPort: state?.webPort ?? DEFAULT_WEB_PORT,
    redirectUris: state?.redirectUris ?? [],
    origins: [],
    kernelRepo: null,
  };
  const envFilePath = writeComposeEnv({
    ...composeEnv(plan, secrets, ctx.env),
    __env: ctx.env,
  });
  return { build: false, envFilePath };
}

export async function devDown(values, ctx, { volumes = false } = {}) {
  await ensureDocker(ctx.run);
  const state = loadState(ctx.env);
  const base = baseFromState(ctx, state);
  await compose(ctx, base, [
    "--profile",
    "setup",
    "down",
    "--remove-orphans",
    ...(volumes ? ["-v"] : []),
  ]);
  ctx.err.write(
    volumes
      ? "Kernel local detenido y datos borrados.\n"
      : "Kernel local detenido (los datos se conservan; `mirotaract dev up` lo vuelve a levantar).\n",
  );
  return 0;
}

export async function devStatus(values, ctx) {
  await ensureDocker(ctx.run);
  const state = loadState(ctx.env);
  const services = await composePs(ctx, baseFromState(ctx, state));
  const running = services.some((s) => s.name === "api" && s.running);
  if (values.json) {
    const { secrets, ...publicState } = state ?? {};
    ctx.out.write(
      `${JSON.stringify({ running, services, ...publicState }, null, 2)}\n`,
    );
  } else ctx.out.write(`${formatStatus(state, { running, services })}\n`);
  return 0;
}

export async function devCommand(sub, values, ctx) {
  const context = { run: defaultRun, fetch: globalThis.fetch, ...ctx };
  switch (sub) {
    case "up":
      return devUp(values, context);
    case "down":
      return devDown(values, context, { volumes: Boolean(values.volumes) });
    case "reset":
      await devDown(values, context, { volumes: true });
      return devUp(values, context);
    case "status":
      return devStatus(values, context);
    default:
      throw new CliError(`Subcomando desconocido: dev ${sub}`);
  }
}
