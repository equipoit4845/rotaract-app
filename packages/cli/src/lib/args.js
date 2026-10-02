import { parseArgs } from "node:util";

import { CliError } from "./errors.js";

export const TEMPLATES = ["next", "fastapi", "flutter"];
export const DEFAULT_API_PORT = 54321;
export const DEFAULT_WEB_PORT = 54322;

const kernelRepo = {
  type: "string",
  description:
    "Ruta a una copia del repositorio del kernel (o MIROTARACT_KERNEL_REPO).",
  value: "<ruta>",
};
const envFile = {
  type: "string",
  description: "Archivo de variables del proyecto (por defecto .env.local).",
  value: "<archivo>",
};

/**
 * Every command: its options (node:util parseArgs format plus help text),
 * how many positionals it takes and its help.
 */
export const COMMANDS = {
  init: {
    usage: "mirotaract init [carpeta] --template next|fastapi|flutter",
    summary: "Crea una app nueva desde una plantilla.",
    positionals: 1,
    options: {
      template: {
        type: "string",
        short: "t",
        description: `Plantilla: ${TEMPLATES.join(", ")} (por defecto next).`,
        value: "<nombre>",
      },
      name: {
        type: "string",
        description: "Nombre del proyecto (por defecto, el de la carpeta).",
        value: "<nombre>",
      },
      "kernel-repo": {
        ...kernelRepo,
        description:
          "Repositorio del kernel: los SDKs se instalan desde ahí mientras no estén publicados (o MIROTARACT_KERNEL_REPO).",
      },
      force: {
        type: "boolean",
        description: "Escribir aunque la carpeta no esté vacía.",
      },
    },
    details: [
      "Ejemplos:",
      "  mirotaract init mi-app --template next",
      "  mirotaract init asistencia --template fastapi --kernel-repo ~/rotaract-app",
    ],
  },
  "dev up": {
    usage: "mirotaract dev up [opciones]",
    summary:
      "Levanta el kernel local (Docker) con el distrito sintético y escribe .env.local.",
    positionals: 0,
    options: {
      "kernel-repo": kernelRepo,
      "api-port": {
        type: "string",
        description: `Puerto de la API del kernel (por defecto ${DEFAULT_API_PORT}).`,
        value: "<puerto>",
      },
      "web-port": {
        type: "string",
        description: `Puerto de la web de Mi Rotaract (por defecto ${DEFAULT_WEB_PORT}).`,
        value: "<puerto>",
      },
      "app-url": {
        type: "string",
        description:
          "URL de tu app; se registra <url>/auth/callback como dirección de regreso (por defecto http://localhost:3000).",
        value: "<url>",
      },
      "redirect-uri": {
        type: "string",
        multiple: true,
        description:
          "Dirección de regreso extra para la app local (repetible).",
        value: "<url>",
      },
      "env-file": envFile,
      "no-build": {
        type: "boolean",
        description:
          "No reconstruir las imágenes (usa las que ya existen o MIROTARACT_API_IMAGE / MIROTARACT_WEB_IMAGE).",
      },
      "no-web": {
        type: "boolean",
        description: "No levantar la web (pantalla de login y consentimiento).",
      },
    },
    details: [
      "Qué hace: construye las imágenes desde el repo del kernel, levanta postgres, nats,",
      "la API y la web en el proyecto Docker 'mirotaract-dev', aplica las migraciones,",
      "carga el seed base y el distrito sintético 'Distrito 9999 (sandbox)', registra",
      "una app local y escribe sus credenciales en .env.local.",
    ],
  },
  "dev down": {
    usage: "mirotaract dev down [--volumes]",
    summary: "Detiene el kernel local (los datos se conservan).",
    positionals: 0,
    options: {
      volumes: {
        type: "boolean",
        description: "Borrar también la base de datos del kernel local.",
      },
    },
  },
  "dev reset": {
    usage: "mirotaract dev reset [opciones de dev up]",
    summary:
      "Borra los datos del kernel local y lo vuelve a levantar desde cero.",
    positionals: 0,
    options: {},
  },
  "dev status": {
    usage: "mirotaract dev status",
    summary:
      "Muestra si el kernel local está corriendo, sus URLs y las cuentas de prueba.",
    positionals: 0,
    options: {
      json: { type: "boolean", description: "Salida en JSON." },
    },
  },
  "gen types": {
    usage: "mirotaract gen types [--lang ts|python] [--out <archivo>]",
    summary:
      "Genera tipos de la API (OpenAPI) y del catálogo de eventos del kernel.",
    positionals: 0,
    options: {
      lang: {
        type: "string",
        description: "ts (por defecto) o python.",
        value: "<lenguaje>",
      },
      out: {
        type: "string",
        short: "o",
        description:
          "Archivo de salida (por defecto src/mirotaract.d.ts o mirotaract_types.py).",
        value: "<archivo>",
      },
      "base-url": {
        type: "string",
        description:
          "URL de la API del kernel (por defecto MIROTARACT_BASE_URL de .env.local o el kernel local).",
        value: "<url>",
      },
      spec: {
        type: "string",
        description:
          "Archivo o URL del contrato OpenAPI (si no, el que sirve el kernel).",
        value: "<ruta|url>",
      },
      "kernel-repo": {
        ...kernelRepo,
        description:
          "Si el kernel no responde, usa <ruta>/kernel-openapi.yaml (o MIROTARACT_KERNEL_REPO).",
      },
      "env-file": envFile,
    },
  },
  "webhooks listen": {
    usage:
      "mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks [--events a,b]",
    summary:
      "Recibe los eventos de tu app desde el kernel y los reenvía, firmados, a tu servidor local.",
    positionals: 0,
    options: {
      "forward-to": {
        type: "string",
        short: "f",
        description: "URL de tu endpoint de webhooks (obligatoria).",
        value: "<url>",
      },
      events: {
        type: "string",
        short: "e",
        description:
          "Solo estos tipos, separados por coma (por defecto, todos).",
        value: "<a,b>",
      },
      "base-url": {
        type: "string",
        description:
          "URL de la API del kernel (por defecto MIROTARACT_BASE_URL).",
        value: "<url>",
      },
      "app-id": {
        type: "string",
        description: "Id de la app (por defecto MIROTARACT_APP_ID).",
        value: "<id>",
      },
      "client-id": {
        type: "string",
        description: "client_id de la app (por defecto MIROTARACT_CLIENT_ID).",
        value: "<mra_…>",
      },
      "client-secret": {
        type: "string",
        description:
          "Secreto de la app (por defecto MIROTARACT_CLIENT_SECRET; preferí la variable).",
        value: "<mrs_…>",
      },
      "env-file": envFile,
    },
    details: [
      "La firma de cada evento usa un secreto propio de esta conexión, que se",
      "muestra al conectar: configuralo como secreto de webhooks de tu app local.",
      "Ctrl-C para salir.",
    ],
  },
};

const GROUPS = {
  dev: ["up", "down", "reset", "status"],
  gen: ["types"],
  webhooks: ["listen"],
};

export function mainHelp(version) {
  const rows = Object.entries(COMMANDS).map(
    ([name, spec]) => `  ${name.padEnd(17)} ${spec.summary}`,
  );
  return [
    `mirotaract ${version} — herramientas para desarrollar apps de Mi Rotaract`,
    "",
    "Uso: mirotaract <comando> [opciones]",
    "",
    "Comandos:",
    ...rows,
    "",
    "Opciones generales:",
    "  -h, --help        Muestra la ayuda (también: mirotaract <comando> --help).",
    "  -v, --version     Muestra la versión.",
    "",
    "Primeros pasos:",
    "  mirotaract init mi-app --template next",
    "  cd mi-app && mirotaract dev up --kernel-repo ~/rotaract-app",
    "",
    "Documentación: docs/developers/cli.md",
  ].join("\n");
}

export function commandHelp(name) {
  const spec = COMMANDS[name];
  const options = Object.entries(spec.options).map(([key, option]) => {
    const flag = `${option.short ? `-${option.short}, ` : "    "}--${key}${option.value ? ` ${option.value}` : ""}`;
    return `  ${flag.padEnd(34)} ${option.description}`;
  });
  return [
    `Uso: ${spec.usage}`,
    "",
    spec.summary,
    ...(options.length ? ["", "Opciones:", ...options] : []),
    "  -h, --help                         Muestra esta ayuda.",
    ...(spec.details ? ["", ...spec.details] : []),
  ].join("\n");
}

/**
 * argv → { command, values, positionals } | { help } | { version }.
 * Throws CliError (with a hint) on anything it doesn't understand.
 */
export function parseCommand(argv) {
  const args = [...argv];
  if (
    args.length === 0 ||
    args[0] === "-h" ||
    args[0] === "--help" ||
    args[0] === "help"
  )
    return args[0] === "help" && args[1]
      ? parseCommand([...args.slice(1), "--help"])
      : { help: null };
  if (args[0] === "-v" || args[0] === "--version") return { version: true };

  let name = args.shift();
  if (GROUPS[name]) {
    const sub = args[0];
    if (!sub || sub === "-h" || sub === "--help")
      return {
        help: null,
        group: name,
      };
    if (!GROUPS[name].includes(sub))
      throw new CliError(`Subcomando desconocido: ${name} ${sub}`, {
        hint: `Opciones: ${GROUPS[name].map((s) => `${name} ${s}`).join(", ")}.`,
      });
    args.shift();
    name = `${name} ${sub}`;
  }
  const spec = COMMANDS[name];
  if (!spec)
    throw new CliError(`Comando desconocido: ${name}`, {
      hint: "Corré `mirotaract --help` para ver los comandos.",
    });

  const options = { help: { type: "boolean", short: "h" } };
  // `dev reset` accepts everything `dev up` accepts.
  const declared =
    name === "dev reset" ? COMMANDS["dev up"].options : spec.options;
  for (const [key, option] of Object.entries(declared))
    options[key] = {
      type: option.type,
      ...(option.short ? { short: option.short } : {}),
      ...(option.multiple ? { multiple: true } : {}),
    };

  let parsed;
  try {
    parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new CliError(translateParseError(error), {
      hint: `Mirá \`mirotaract ${name} --help\`.`,
    });
  }
  if (parsed.values.help) return { help: name };
  if (parsed.positionals.length > spec.positionals)
    throw new CliError(
      `Sobran argumentos: ${parsed.positionals.slice(spec.positionals).join(" ")}`,
      { hint: `Uso: ${spec.usage}` },
    );
  return {
    command: name,
    values: parsed.values,
    positionals: parsed.positionals,
  };
}

function translateParseError(error) {
  const message = String(error?.message ?? error);
  const option = message.match(/'([^']+)'/)?.[1];
  switch (error?.code) {
    case "ERR_PARSE_ARGS_UNKNOWN_OPTION":
      return `Opción desconocida: ${option ?? message}`;
    case "ERR_PARSE_ARGS_INVALID_OPTION_VALUE":
      return `Falta el valor de la opción ${option ?? ""}`.trim();
    case "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL":
      return `Argumento inesperado: ${option ?? message}`;
    default:
      return message;
  }
}

/** "54321" → 54321, with a readable error. */
export function parsePort(value, fallback, flag) {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new CliError(
      `${flag} debe ser un puerto entre 1024 y 65535 (recibí "${value}").`,
    );
  return port;
}

/** Validates an absolute http(s) URL and returns it without a trailing slash. */
export function parseUrl(value, flag) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`${flag} no es una URL válida: "${value}".`);
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new CliError(
      `${flag} tiene que ser http:// o https:// (recibí "${value}").`,
    );
  return value.replace(/\/+$/, "");
}
