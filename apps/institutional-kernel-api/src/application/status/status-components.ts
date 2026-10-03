/**
 * E12.1 — the components shown on the public status page
 * (docs/19-operations-e12.md) and how the worker probes each one.
 *
 * Every probe target is configurable with `KERNEL_STATUS_PROBE_<KEY>_URLS`
 * (comma-separated). The defaults are the in-network names of the
 * production compose project, so the worker container reaches them without
 * leaving the VPS. `off` disables a component (it disappears from the page).
 * The sandbox only shows up once `KERNEL_STATUS_PROBE_SANDBOX_URLS` is set.
 */
export type StatusComponentKey =
  "web" | "api" | "oidc" | "webhooks" | "meetings" | "portal" | "sandbox";

export type ProbeKind = "http" | "oidc" | "webhooks";

export type StatusComponentDefinition = {
  key: StatusComponentKey;
  name: string;
  description: string;
  probe: ProbeKind;
  /** Default probe targets; empty = not probed unless configured. */
  defaultUrls: string[];
};

export const STATUS_COMPONENTS: readonly StatusComponentDefinition[] = [
  {
    key: "web",
    name: "Mi Rotaract (web)",
    description: "app.rotaract4845.com: el panel de socios, clubes y distrito.",
    probe: "http",
    defaultUrls: ["http://web:3000/login"],
  },
  {
    key: "api",
    name: "API del kernel",
    description:
      "api.rotaract4845.com: la API de datos y de servicio que usan las apps.",
    probe: "http",
    defaultUrls: ["http://api:3001/health/ready"],
  },
  {
    key: "oidc",
    name: "Inicio de sesión (OIDC)",
    description:
      "«Ingresar con Mi Rotaract»: descubrimiento OpenID, claves públicas y emisión de tokens.",
    probe: "oidc",
    defaultUrls: ["http://api:3001/api/kernel/v1"],
  },
  {
    key: "webhooks",
    name: "Webhooks",
    description:
      "Reparto y entrega de eventos firmados a las apps (cola del worker).",
    probe: "webhooks",
    defaultUrls: [],
  },
  {
    key: "meetings",
    name: "Reuniones",
    description: "reuniones.rotaract4845.com: la app de reuniones distritales.",
    probe: "http",
    defaultUrls: [
      "http://meetings-api:3003/meetings-api/health",
      "http://meetings-web:3002/",
    ],
  },
  {
    key: "portal",
    name: "Portal para desarrolladores",
    description: "developers.rotaract4845.com: documentación y referencia.",
    probe: "http",
    defaultUrls: ["http://developers-portal:3004/"],
  },
  {
    key: "sandbox",
    name: "Sandbox",
    description:
      "api.sandbox.rotaract4845.com: el kernel de pruebas con el Distrito 9999.",
    probe: "http",
    defaultUrls: [],
  },
];

export const STATUS_COMPONENT_KEYS = STATUS_COMPONENTS.map((c) => c.key);

export function isStatusComponentKey(
  value: unknown,
): value is StatusComponentKey {
  return (
    typeof value === "string" &&
    (STATUS_COMPONENT_KEYS as string[]).includes(value)
  );
}

export type ConfiguredComponent = StatusComponentDefinition & {
  urls: string[];
};

type Env = Record<string, string | undefined>;

/**
 * Components that are actually monitored with their resolved targets. The
 * webhook pipeline needs no URL (it is read from the database); everything
 * else needs at least one target.
 */
export function configuredComponents(
  env: Env = process.env,
): ConfiguredComponent[] {
  const result: ConfiguredComponent[] = [];
  for (const component of STATUS_COMPONENTS) {
    const raw = env[`KERNEL_STATUS_PROBE_${component.key.toUpperCase()}_URLS`];
    if (raw !== undefined && raw.trim().toLowerCase() === "off") continue;
    const urls =
      raw !== undefined && raw.trim() !== ""
        ? raw
            .split(",")
            .map((url) => url.trim())
            .filter(Boolean)
        : component.defaultUrls;
    if (component.probe !== "webhooks" && urls.length === 0) continue;
    result.push({ ...component, urls });
  }
  return result;
}

export function componentName(key: string): string {
  return STATUS_COMPONENTS.find((c) => c.key === key)?.name ?? key;
}
