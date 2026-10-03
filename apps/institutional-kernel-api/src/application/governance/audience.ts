/**
 * E11.4 — who sees an app in the members' panel (docs/18-data-governance.md
 * §"Catálogo de apps del distrito"). Pure and unit-tested: the service loads
 * the person's ACTIVE memberships and appointments inside the app's
 * organization tree and asks `matchesAudience`.
 */

export const AUDIENCES = [
  "DISTRICT_MEMBERS",
  "CLUB_PRESIDENTS",
  "CLUB_AUTHORITIES",
  "DISTRICT_AUTHORITIES",
  "POSITIONS",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  DISTRICT_MEMBERS: "Todas las personas del distrito",
  CLUB_PRESIDENTS: "Presidencias de club",
  CLUB_AUTHORITIES: "Autoridades de club (cualquier cargo)",
  DISTRICT_AUTHORITIES: "Autoridades del distrito",
  POSITIONS: "Cargos específicos",
};

export const CLUB_PRESIDENT_POSITION = "CLUB_PRESIDENT";

export type PersonContexts = {
  /** ACTIVE memberships inside the app's tree. */
  memberships: Array<{ organizationId: string; organizationType: string }>;
  /** ACTIVE appointments inside the app's tree. */
  appointments: Array<{
    organizationId: string;
    organizationType: string;
    positionCode: string;
  }>;
};

export type AudienceRule = {
  audiences: string[];
  positionCodes: string[];
};

/**
 * Union of the selected audiences. Contexts in `hiddenOrganizationIds`
 * (clubs where the app's module is installed but not active) don't count.
 */
export function matchesAudience(
  rule: AudienceRule,
  person: PersonContexts,
  hiddenOrganizationIds: ReadonlySet<string> = new Set(),
): boolean {
  const memberships = person.memberships.filter(
    (m) => !hiddenOrganizationIds.has(m.organizationId),
  );
  const appointments = person.appointments.filter(
    (a) => !hiddenOrganizationIds.has(a.organizationId),
  );
  return rule.audiences.some((audience) => {
    switch (audience) {
      case "DISTRICT_MEMBERS":
        return memberships.length > 0 || appointments.length > 0;
      case "CLUB_PRESIDENTS":
        return appointments.some(
          (a) =>
            a.organizationType === "CLUB" &&
            a.positionCode === CLUB_PRESIDENT_POSITION,
        );
      case "CLUB_AUTHORITIES":
        return appointments.some((a) => a.organizationType === "CLUB");
      case "DISTRICT_AUTHORITIES":
        return appointments.some((a) => a.organizationType === "DISTRICT");
      case "POSITIONS":
        return appointments.some((a) =>
          rule.positionCodes.includes(a.positionCode),
        );
      default:
        return false;
    }
  });
}

const LUCIDE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidIcon(icon: string): boolean {
  if (icon.length <= 64 && LUCIDE_NAME.test(icon)) return true;
  return isHttpsUrl(icon);
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !value.includes("#");
  } catch {
    return false;
  }
}

/** https, or http only for localhost (the local kernel). */
export function isValidLaunchUrl(value: string): boolean {
  if (isHttpsUrl(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/** Origin of the first redirect URI that can be launched, e.g. https://reuniones.rotaract4845.com */
export function defaultLaunchUrl(redirectUris: string[]): string | null {
  for (const uri of redirectUris)
    if (isValidLaunchUrl(uri)) return new URL(uri).origin;
  return null;
}
