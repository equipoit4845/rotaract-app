/**
 * E11.2 — what the access history records (docs/18-data-governance.md
 * §"Historial de accesos"). One row per person + app + kind of access; no
 * request bodies, tokens, IPs or the data itself — only which kind of data.
 */

export const ACCESS_KINDS = [
  "CONSENT_GRANTED",
  "SIGN_IN",
  "TOKEN_REFRESH",
  "USERINFO",
  "DATA_READ",
  "CONSENT_REVOKED",
] as const;
export type AccessKind = (typeof ACCESS_KINDS)[number];

/** Codes of the data an access touched (stable; labels are in Spanish). */
export const ACCESS_DETAIL_LABELS: Record<string, string> = {
  openid: "tu identificador",
  profile: "tu nombre y foto",
  email: "tu correo",
  memberships: "tus clubes",
  positions: "tus cargos",
  person: "tus datos de perfil",
  contact: "tu correo, teléfono y fecha de nacimiento",
  "person-memberships": "tus membresías",
  "account-context": "tu cuenta, clubes y permisos",
};

export const ACCESS_KIND_LABELS: Record<AccessKind, string> = {
  CONSENT_GRANTED: "Le diste acceso",
  SIGN_IN: "Ingresaste con tu cuenta",
  TOKEN_REFRESH: "Renovó tu sesión",
  USERINFO: "Leyó tus datos de inicio de sesión",
  DATA_READ: "Leyó tus datos desde su servidor",
  CONSENT_REVOKED: "Le quitaste el acceso",
};

/**
 * Repeated accesses of these kinds within the coalescing window collapse
 * into one row (an app refreshing its token every 10 minutes must not fill
 * a year of history); consent changes and sign-ins are always recorded.
 */
export const COALESCED_KINDS: ReadonlySet<AccessKind> = new Set([
  "TOKEN_REFRESH",
  "USERINFO",
  "DATA_READ",
]);

export type AccessEvent = {
  personId: string;
  /** Either the app id or its client_id (resolved when writing). */
  appId?: string;
  clientId?: string;
  kind: AccessKind;
  details: string[];
  createdAt: Date;
};

export function describeAccess(kind: string, details: string[]): string {
  const label = ACCESS_KIND_LABELS[kind as AccessKind] ?? kind;
  const what = details
    .map((detail) => ACCESS_DETAIL_LABELS[detail])
    .filter(Boolean);
  if (what.length === 0) return label;
  const list =
    what.length === 1
      ? what[0]
      : `${what.slice(0, -1).join(", ")} y ${what[what.length - 1]}`;
  return kind === "CONSENT_GRANTED"
    ? `${label} a ${list}`
    : `${label}: ${list}`;
}

export function historyOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  retentionDays: number;
  coalesceMs: number;
  flushIntervalMs: number;
  batchSize: number;
  maxBuffered: number;
} {
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    enabled: env.KERNEL_ACCESS_HISTORY_ENABLED !== "false",
    retentionDays: number(env.KERNEL_ACCESS_HISTORY_RETENTION_DAYS, 365),
    coalesceMs: number(env.KERNEL_ACCESS_HISTORY_COALESCE_MS, 15 * 60_000),
    flushIntervalMs: number(env.KERNEL_ACCESS_HISTORY_FLUSH_MS, 1_000),
    batchSize: number(env.KERNEL_ACCESS_HISTORY_BATCH_SIZE, 200),
    maxBuffered: number(env.KERNEL_ACCESS_HISTORY_MAX_BUFFERED, 10_000),
  };
}
