"use client";

import { useOrganization } from "@/lib/api";
import { Skeleton } from "@equipoit4845/ui";

/**
 * Resolves a parent's name with one bounded request per distinct
 * `parentId` on the current page (deduplicated by TanStack Query's cache
 * — a page full of clubs sharing one district issues a single request,
 * not one per row). Bounded by the list's page `limit`, never by the
 * total number of organizations, so this isn't the "list clubs → GET
 * per club" pattern the product spec forbids (§18) — it mirrors
 * `AuthorityRow` in `features/dashboard`.
 */
export function OrganizationParentCell({
  parentId,
}: {
  parentId: string | null;
}) {
  const { data: parent, isLoading } = useOrganization(parentId ?? undefined);

  if (!parentId) return <span>—</span>;
  if (isLoading) return <Skeleton style={{ height: "1rem", width: "6rem" }} />;
  return <span>{parent?.name ?? "—"}</span>;
}
