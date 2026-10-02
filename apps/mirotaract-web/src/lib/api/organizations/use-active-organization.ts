"use client";

import { useCallback, useEffect, useState } from "react";

import { useCurrentUser } from "../auth/auth.hooks";
import { useOrganization } from "./organizations.hooks";

const STORAGE_KEY = "mirotaract.activeOrganizationId";

function readPersistedId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
}

function persistId(id: string | undefined): void {
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * The organization the signed-in person is currently acting in. A person
 * can work in several organizations (`UserContext.workspaces`) through an
 * active membership or a scoped role such as DISTRICT_RDR. This only
 * persists the chosen *id*, never a copy of the organization object.
 *
 * Falls back to the first available workspace whenever the current selection
 * is no longer authorized. This allows a district officer to switch between
 * the district workspace and its clubs without inventing district
 * memberships in the Kernel data model.
 */
export function useActiveOrganization() {
  const { data: currentUser } = useCurrentUser();
  const [organizationId, setOrganizationIdState] = useState<string | undefined>(
    readPersistedId,
  );

  useEffect(() => {
    if (!currentUser) return;
    const workspaces =
      currentUser.workspaces ??
      currentUser.memberships
        .filter((membership) => membership.status === "ACTIVE")
        .map((membership) => ({ organizationId: membership.organizationId }));
    if (
      workspaces.some(
        (workspace) => workspace.organizationId === organizationId,
      )
    )
      return;

    const fallback = workspaces[0]?.organizationId;
    setOrganizationIdState(fallback);
    persistId(fallback);
  }, [organizationId, currentUser]);

  const setActiveOrganizationId = useCallback((id: string) => {
    setOrganizationIdState(id);
    persistId(id);
  }, []);

  const isAvailableWorkspace =
    currentUser?.workspaces?.some(
      (workspace) => workspace.organizationId === organizationId,
    ) ??
    currentUser?.memberships.some(
      (membership) =>
        membership.organizationId === organizationId &&
        membership.status === "ACTIVE",
    ) ??
    true;
  const organizationQuery = useOrganization(
    isAvailableWorkspace ? organizationId : undefined,
  );

  return {
    organizationId,
    organization: organizationQuery.data,
    isLoading: organizationQuery.isLoading,
    availableMemberships: currentUser?.memberships ?? [],
    availableWorkspaces: currentUser?.workspaces ?? [],
    setActiveOrganizationId,
  };
}
