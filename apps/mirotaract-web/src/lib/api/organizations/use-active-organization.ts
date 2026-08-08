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
 * can hold memberships in several organizations (`UserContext.memberships`,
 * kernel-openapi.yaml) — this only persists the chosen *id*, never a copy
 * of the organization object, so it can't drift from the server record.
 *
 * Falls back to the first ACTIVE membership whenever the current selection
 * isn't (or is no longer) one — on first load, and again if the active
 * organization's membership is later ended, transferred out, or otherwise
 * stops being ACTIVE (not just when there was no selection to begin with).
 */
export function useActiveOrganization() {
  const { data: currentUser } = useCurrentUser();
  const [organizationId, setOrganizationIdState] = useState<string | undefined>(
    readPersistedId,
  );

  useEffect(() => {
    if (!currentUser) return;
    const activeMemberships = currentUser.memberships.filter(
      (m) => m.status === "ACTIVE",
    );
    const stillActive = activeMemberships.some(
      (m) => m.organizationId === organizationId,
    );
    if (stillActive) return;

    const fallback = activeMemberships[0]?.organizationId;
    setOrganizationIdState(fallback);
    persistId(fallback);
  }, [organizationId, currentUser]);

  const setActiveOrganizationId = useCallback((id: string) => {
    setOrganizationIdState(id);
    persistId(id);
  }, []);

  const isActiveMember =
    currentUser?.memberships.some(
      (m) => m.organizationId === organizationId && m.status === "ACTIVE",
    ) ?? true;
  const organizationQuery = useOrganization(
    isActiveMember ? organizationId : undefined,
  );

  return {
    organizationId,
    organization: organizationQuery.data,
    isLoading: organizationQuery.isLoading,
    availableMemberships: currentUser?.memberships ?? [],
    setActiveOrganizationId,
  };
}
