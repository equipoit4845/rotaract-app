/**
 * Scopes a developer app can request (docs/11-developer-platform-auth.md).
 *
 * OIDC scopes are granted by a person through "Ingresar con Mi Rotaract"
 * (authorization_code); service scopes are granted to the app itself by the
 * district when it registers the app (client_credentials). Labels are what
 * people read on the consent screen and in the console.
 */
export const OIDC_SCOPES = {
  openid: "Saber que sos vos (identificador de tu cuenta)",
  profile: "Tu nombre y foto",
  email: "Tu correo electrónico",
  memberships: "Los clubes a los que pertenecés",
  positions: "Tus cargos vigentes",
} as const;

export type OidcScope = keyof typeof OIDC_SCOPES;

export const SERVICE_SCOPE_LABELS = {
  "kernel.service.users.read": "Leer el contexto de una cuenta",
  "kernel.service.persons.read": "Leer datos de personas",
  "kernel.service.persons.contact.read":
    "Leer email, teléfono y fecha de nacimiento de personas",
  "kernel.service.organizations.read": "Leer clubes y distrito",
  "kernel.service.memberships.read": "Leer el padrón de socios",
  "kernel.service.authorities.read": "Leer autoridades vigentes",
  "kernel.service.periods.read": "Leer períodos",
  "kernel.service.authorization.check": "Consultar permisos de una persona",
  "kernel.service.modules.read": "Leer instalaciones de módulos",
  "kernel.service.tokens.introspect": "Validar tokens de sesión",
} as const;

export type ServiceScope = keyof typeof SERVICE_SCOPE_LABELS;
export const SERVICE_SCOPES = Object.keys(
  SERVICE_SCOPE_LABELS,
) as ServiceScope[];

export const GRANT_TYPES = [
  "client_credentials",
  "authorization_code",
  "refresh_token",
] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export function isOidcScope(scope: string): scope is OidcScope {
  return Object.prototype.hasOwnProperty.call(OIDC_SCOPES, scope);
}

export function isServiceScope(scope: string): scope is ServiceScope {
  return Object.prototype.hasOwnProperty.call(SERVICE_SCOPE_LABELS, scope);
}

export function scopeLabel(scope: string): string {
  if (isOidcScope(scope)) return OIDC_SCOPES[scope];
  if (isServiceScope(scope)) return SERVICE_SCOPE_LABELS[scope];
  return scope;
}

/** Space-delimited scope string -> unique list (RFC 6749 §3.3). */
export function parseScope(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(" ").filter(Boolean))];
}

/** Token lifetimes, in seconds. */
export const TOKEN_TTL = {
  serviceAccessToken: 600,
  userAccessToken: 600,
  idToken: 600,
  authorizationCode: 60,
  refreshToken: 30 * 24 * 60 * 60,
} as const;

/** `aud` of tokens that call the Kernel's own APIs. */
export const KERNEL_AUDIENCE = "institutional-kernel";
