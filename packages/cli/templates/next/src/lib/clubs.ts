import "server-only";

import type { MemberView, PersonMembershipView } from "@mirotaract/sdk";

import { miRotaractData } from "./mirotaract";

export type ClubRoster = {
  club: Pick<PersonMembershipView, "organizationId" | "organizationName" | "status">;
  members: MemberView[];
};

/** Membresías que habilitan a ver el padrón del club. */
const VISIBLE = new Set(["ACTIVE", "ON_LEAVE"]);

/**
 * Padrón de los clubes de una persona. La regla es de ESTA app: solo ves el
 * padrón de un club si sos socio/a activo/a (o de licencia). Las membresías
 * se consultan al kernel en el momento (no se confía en la sesión, que
 * puede tener horas), con el token de servicio.
 */
export async function rostersFor(personId: string): Promise<ClubRoster[]> {
  const mr = miRotaractData();
  const memberships = await mr.persons.memberships(personId);
  const clubs = memberships.filter(
    (m) => m.organizationType === "CLUB" && VISIBLE.has(m.status),
  );
  return Promise.all(
    clubs.map(async (club) => ({
      club: {
        organizationId: club.organizationId,
        organizationName: club.organizationName,
        status: club.status,
      },
      members: (
        await mr.members.list(club.organizationId, { limit: 100 }).all({ max: 1000 })
      )
        .filter((m) => VISIBLE.has(m.status))
        .sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, "es")),
    })),
  );
}
