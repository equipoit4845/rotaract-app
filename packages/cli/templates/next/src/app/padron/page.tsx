import { MiRotaractApiError } from "@mirotaract/sdk";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { rostersFor, type ClubRoster } from "@/lib/clubs";
import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { ACTIVE: "Activo/a", ON_LEAVE: "De licencia" };

export default async function Padron() {
  const session = await miRotaractSession().getSession(await cookies());
  if (!session) redirect("/auth/login?returnTo=/padron");

  let rosters: ClubRoster[];
  try {
    rosters = await rostersFor(session.user.sub);
  } catch (error) {
    // Nunca muestres detalles internos; el traceId sirve para pedir ayuda al RDR.
    const detail = error instanceof MiRotaractApiError ? ` (HTTP ${error.status}, traceId ${error.traceId ?? "-"})` : "";
    return (
      <>
        <h1>Padrón</h1>
        <p className="error">No pudimos leer el padrón{detail}.</p>
        <Link href="/">Volver</Link>
      </>
    );
  }

  return (
    <>
      <p>
        <Link href="/">← Inicio</Link>
      </p>
      <h1>Padrón de mi club</h1>
      {rosters.length === 0 && (
        <p className="muted">No tenés una membresía activa en ningún club de esta app.</p>
      )}
      {rosters.map(({ club, members }) => (
        <section key={club.organizationId}>
          <h2>{club.organizationName}</h2>
          <p className="muted">{members.length} socios/as</p>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>N.º</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membershipId}>
                  <td>{member.person.displayName}</td>
                  <td>{member.memberNumber ?? "—"}</td>
                  <td>{STATUS[member.status] ?? member.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
