"use client";

import { useMembershipApplications } from "@/lib/api";
import { DataState } from "@/components/layout";
import { buttonVariants } from "@/components/ui";
import Link from "next/link";

/**
 * What a signed-in person without any club sees. If they already asked to
 * join one (from `/join-club` or at registration), the request is waiting
 * for the club presidency: point them to it instead of to the directory.
 * `kernel.application.read.self` limits the list to their own requests.
 */
export function NoClubState({ personId }: { personId?: string }) {
  const pending = useMembershipApplications(
    { personId, status: "SUBMITTED" },
    { enabled: Boolean(personId) },
  );
  const application = pending.data?.[0];

  if (application) {
    return (
      <DataState
        kind="empty"
        title="Tu solicitud está en revisión"
        description="La presidencia del club ya recibió tu solicitud. Te avisamos por email cuando la revise."
        action={
          <Link
            href={`/applications/${application.id}`}
            className={buttonVariants()}
          >
            Ver mi solicitud
          </Link>
        }
      />
    );
  }

  return (
    <DataState
      kind="empty"
      title="Todavía no pertenecés a un club"
      description="Buscá tu club y enviá una solicitud. La presidencia del club la revisará antes de habilitar tu espacio de socio."
      action={
        <Link href="/join-club" className={buttonVariants()}>
          Buscar mi club
        </Link>
      }
    />
  );
}
