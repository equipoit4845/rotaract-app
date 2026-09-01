"use client";

import { useMemo } from "react";

import { useCurrentUser } from "../auth/auth.hooks";
import { useRoleAssignments, useRoles } from "../authorization/authorization.hooks";
import { useOrganizationMembershipDirectories } from "../memberships/memberships.hooks";
import { useAllOrganizations } from "../organizations/organizations.hooks";
import { useAllPersons } from "../persons/persons.hooks";

export type AdministrativeUserDirectoryItem = {
  id: string;
  displayName: string;
  email: string | null;
  archived: boolean;
  clubs: string[];
  roles: string[];
};

/**
 * Superadmin read model composed only from existing Kernel resources. The
 * Kernel remains the authority for people, memberships and role assignments;
 * this hook merely joins those read models for the administrative screen.
 */
export function useAdministrativeUserDirectory(enabled: boolean) {
  const { data: currentUser } = useCurrentUser();
  const persons = useAllPersons({}, { enabled });
  const organizations = useAllOrganizations({ type: "CLUB" }, { enabled });
  const roles = useRoles({ enabled });
  const assignments = useRoleAssignments({}, { enabled });
  const membershipQueries = useOrganizationMembershipDirectories(
    organizations.items.map((organization) => organization.id),
    { enabled: enabled && !organizations.isLoading },
  );

  const isLoading =
    persons.isLoading ||
    organizations.isLoading ||
    roles.isLoading ||
    assignments.isLoading ||
    membershipQueries.some((query) => query.isLoading);
  const isError =
    persons.isError ||
    organizations.isError ||
    roles.isError ||
    assignments.isError ||
    membershipQueries.some((query) => query.isError);
  const error =
    persons.error ??
    organizations.error ??
    roles.error ??
    assignments.error ??
    membershipQueries.find((query) => query.error)?.error;

  const items = useMemo<AdministrativeUserDirectoryItem[]>(() => {
    const clubsById = new Map(
      organizations.items.map((organization) => [organization.id, organization]),
    );
    const roleNamesById = new Map(
      (roles.data ?? []).map((role) => [role.id, role.name || role.code]),
    );
    const activeMembershipsByPerson = new Map<string, Set<string>>();

    membershipQueries.forEach((query) => {
      for (const membership of query.data?.items ?? []) {
        if (membership.status !== "ACTIVE") continue;
        const club = clubsById.get(membership.organizationId);
        if (!club) continue;
        const names = activeMembershipsByPerson.get(membership.personId) ?? new Set<string>();
        names.add(club.name);
        activeMembershipsByPerson.set(membership.personId, names);
      }
    });

    const now = Date.now();
    const effectiveRolesByPerson = new Map<string, Set<string>>();
    for (const assignment of assignments.data ?? []) {
      if (
        assignment.effect !== "ALLOW" ||
        assignment.revokedAt ||
        new Date(assignment.validFrom).getTime() > now ||
        (assignment.validUntil && new Date(assignment.validUntil).getTime() <= now)
      ) {
        continue;
      }
      const roleName = roleNamesById.get(assignment.roleDefinitionId);
      if (!roleName) continue;
      const scope = assignment.organizationId
        ? clubsById.get(assignment.organizationId)?.name
        : undefined;
      const labels = effectiveRolesByPerson.get(assignment.personId) ?? new Set<string>();
      labels.add(scope ? `${roleName} · ${scope}` : roleName);
      effectiveRolesByPerson.set(assignment.personId, labels);
    }

    return persons.items
      .map((person) => {
        const rolesForPerson = new Set(
          effectiveRolesByPerson.get(person.id) ?? [],
        );
        // The public read contract exposes platformRole only for the current
        // authenticated account. We surface it accurately for that row rather
        // than fabricating platform roles for other people.
        if (person.id === currentUser?.personId && currentUser.platformRole === "SUPERADMIN") {
          rolesForPerson.add("SUPERADMIN");
        }
        return {
          id: person.id,
          displayName: [person.firstName, person.lastName].filter(Boolean).join(" ") || person.primaryEmail || "Sin nombre",
          email: person.primaryEmail ?? null,
          archived: Boolean(person.archivedAt),
          clubs: [...(activeMembershipsByPerson.get(person.id) ?? [])].sort(),
          roles: [...rolesForPerson].sort(),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  }, [assignments.data, currentUser, membershipQueries, organizations.items, persons.items, roles.data]);

  return { items, isLoading, isError, error };
}
