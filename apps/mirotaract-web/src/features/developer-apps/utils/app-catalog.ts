import type {
  DeveloperApp,
  DeveloperAppGrantType,
  DeveloperAppType,
} from "@/lib/api";

/**
 * Plain-language catalog for the developer console. Mirrors the labels of
 * `apps/institutional-kernel-api/src/application/oauth/scopes.ts` so the
 * district reads the same words the consent screen shows people. The codes
 * are only sent to the Kernel; the screens show the labels.
 */
export const LOGIN_DATA = [
  { code: "openid", label: "Saber que sos vos (identificador de tu cuenta)" },
  { code: "profile", label: "Tu nombre y foto" },
  { code: "email", label: "Tu correo electrónico" },
  { code: "memberships", label: "Los clubes a los que pertenecés" },
  { code: "positions", label: "Tus cargos vigentes" },
] as const;

export const APP_OWN_DATA = [
  {
    code: "kernel.service.users.read",
    label: "Leer el contexto de una cuenta",
  },
  { code: "kernel.service.persons.read", label: "Leer datos de personas" },
  {
    code: "kernel.service.persons.contact.read",
    label: "Leer email, teléfono y fecha de nacimiento de personas",
  },
  {
    code: "kernel.service.organizations.read",
    label: "Leer clubes y distrito",
  },
  {
    code: "kernel.service.memberships.read",
    label: "Leer el padrón de socios",
  },
  {
    code: "kernel.service.authorities.read",
    label: "Leer autoridades vigentes",
  },
  { code: "kernel.service.periods.read", label: "Leer períodos" },
  {
    code: "kernel.service.authorization.check",
    label: "Consultar permisos de una persona",
  },
  {
    code: "kernel.service.modules.read",
    label: "Leer instalaciones de módulos",
  },
  {
    code: "kernel.service.tokens.introspect",
    label: "Validar tokens de sesión",
  },
] as const;

/** Always granted with "Ingresar con Mi Rotaract" (the Kernel requires it). */
export const LOGIN_REQUIRED_DATA = "openid";

const LOGIN_CODES = new Set<string>(LOGIN_DATA.map((item) => item.code));
const APP_OWN_CODES = new Set<string>(APP_OWN_DATA.map((item) => item.code));

export function isLoginData(code: string): boolean {
  return LOGIN_CODES.has(code);
}

export function isAppOwnData(code: string): boolean {
  return APP_OWN_CODES.has(code);
}

export function dataLabel(code: string): string {
  return (
    [...LOGIN_DATA, ...APP_OWN_DATA].find((item) => item.code === code)
      ?.label ?? "Otro dato"
  );
}

export const APP_TYPE_LABEL: Record<DeveloperAppType, string> = {
  CONFIDENTIAL: "Servidor",
  PUBLIC: "Web o móvil",
};

export const APP_TYPE_HINT: Record<DeveloperAppType, string> = {
  CONFIDENTIAL:
    "Corre en un servidor propio y puede guardar un secreto de forma segura.",
  PUBLIC: "Corre en el navegador o en un teléfono: no puede guardar secretos.",
};

/** What an app is allowed to do, as the district reads it. */
export const CAPABILITY = {
  login: {
    label: "Permitir que las personas ingresen con Mi Rotaract",
    grants: ["authorization_code", "refresh_token"] as DeveloperAppGrantType[],
  },
  ownAccess: {
    label: "Acceso propio de la app a datos del distrito (servidor)",
    grants: ["client_credentials"] as DeveloperAppGrantType[],
  },
} as const;

export function allowsLogin(app: Pick<DeveloperApp, "grantTypes">): boolean {
  return app.grantTypes.includes("authorization_code");
}

export function allowsOwnAccess(
  app: Pick<DeveloperApp, "grantTypes">,
): boolean {
  return app.grantTypes.includes("client_credentials");
}

/** Grants in plain language, one sentence per capability. */
export function describeCapabilities(
  app: Pick<DeveloperApp, "grantTypes">,
): string[] {
  const lines: string[] = [];
  if (allowsLogin(app)) {
    lines.push(
      app.grantTypes.includes("refresh_token")
        ? "Las personas ingresan con Mi Rotaract y la sesión se mantiene abierta"
        : "Las personas ingresan con Mi Rotaract",
    );
  }
  if (allowsOwnAccess(app)) {
    lines.push("La app consulta datos del distrito por su cuenta");
  }
  return lines;
}

/** One redirect URI per line; blank lines ignored, duplicates removed. */
export function parseRedirectUris(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Mirrors the Kernel rule (absolute, no fragment, https — or http only for
 * localhost/127.0.0.1). The Kernel stays the authority; this only catches
 * typos before the request.
 */
export function redirectUriProblem(uri: string): string | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `"${uri}" no es una dirección completa (debe empezar con https://).`;
  }
  if (url.hash || uri.includes("#")) {
    return `"${uri}" no puede tener un "#".`;
  }
  if (url.protocol === "https:") return undefined;
  if (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) {
    return undefined;
  }
  return `"${uri}" tiene que usar https:// (http:// solo para pruebas en localhost).`;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
