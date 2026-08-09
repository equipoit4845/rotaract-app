"use client";

import type { Person } from "@/lib/api";
import { useCan, useCurrentUser } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import Link from "next/link";

import { ArchivePersonDialog } from "../forms/archive-person-dialog";
import { InvitePersonDialog } from "../forms/invite-person-dialog";

/**
 * Edit visibility mirrors the documented contract exactly (see
 * docs/09-administrative-web.md): `kernel.person.manage`, OR
 * `kernel.person.update.self` when this is the signed-in actor's own
 * Person record — not an invented self/non-self policy, the OpenAPI
 * description for `updatePerson` says this literally.
 */
export function PersonActionsRow({ person }: { person: Person }) {
  const { data: currentUser } = useCurrentUser();
  const canManage = useCan("kernel.person.manage");
  const canUpdateSelf = useCan("kernel.person.update.self");
  const isOwnPerson = currentUser?.personId === person.id;
  const canEdit = canManage || (isOwnPerson && canUpdateSelf);

  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      {canEdit ? (
        <Link href={`/persons/${person.id}/edit`}>
          <Button variant="secondary">Editar</Button>
        </Link>
      ) : null}
      <InvitePersonDialog person={person} />
      <ArchivePersonDialog person={person} />
    </div>
  );
}
