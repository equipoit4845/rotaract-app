"use client";

import type { OrganizationType } from "@/lib/api";
import {
  useOrganizationDescendants,
  useOrganizationMemberships,
} from "@/lib/api";
import { FormField, Select } from "@equipoit4845/ui";
import { useState } from "react";

import { AppointmentMembershipOption } from "./appointment-membership-option";

/**
 * US-APP-04. Kernel-spec.md §6.6.2/6.6.3: for a CLUB (or OTHER) position the
 * enabling membership must belong to exactly that organization; for a
 * DISTRICT position it can belong to any descendant CLUB (no artificial
 * district membership is created). Only `ACTIVE` memberships are offered
 * (invariant 6.6.1: the membership must be ACTIVE at creation) — the Kernel
 * still re-validates this server-side.
 *
 * Both the club-candidate list (`useOrganizationDescendants`, already
 * fetched as a single bounded call) and the per-club membership list
 * (`useOrganizationMemberships`, first page only) are bounded requests —
 * never one request per candidate.
 */
export function AppointmentMembershipPicker({
  organizationId,
  positionOrganizationType,
  value,
  onChange,
  error,
}: {
  organizationId: string;
  positionOrganizationType: OrganizationType | undefined;
  value: string;
  onChange: (membershipId: string) => void;
  error?: string;
}) {
  const [clubId, setClubId] = useState("");
  const isDistrictPosition = positionOrganizationType === "DISTRICT";

  const descendants = useOrganizationDescendants(
    isDistrictPosition ? organizationId : undefined,
  );
  const clubCandidates = (descendants.data ?? []).filter(
    (org) => org.type === "CLUB",
  );

  const membershipOrganizationId = isDistrictPosition ? clubId : organizationId;
  const memberships = useOrganizationMemberships(
    membershipOrganizationId || undefined,
    { status: ["ACTIVE"] },
  );
  const membershipOptions = memberships.data?.pages[0]?.items ?? [];

  return (
    <>
      {isDistrictPosition ? (
        <FormField
          label="Club de la membresía habilitante"
          htmlFor="membershipClubId"
          hint="Para un cargo distrital, la membresía puede pertenecer a cualquier club descendiente (invariante 6.6.3)."
        >
          <Select
            id="membershipClubId"
            value={clubId}
            onChange={(event) => {
              setClubId(event.target.value);
              onChange("");
            }}
          >
            <option value="">Elegí un club</option>
            {clubCandidates.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}

      <FormField
        label="Membresía habilitante"
        htmlFor="membershipId"
        required
        error={error}
        hint={
          isDistrictPosition && !clubId
            ? "Elegí primero un club."
            : membershipOptions.length === 0 && !memberships.isLoading
              ? "Sin membresías activas para esta organización."
              : undefined
        }
      >
        <Select
          id="membershipId"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={isDistrictPosition && !clubId}
        >
          <option value="">Elegí una persona</option>
          {membershipOptions.map((membership) => (
            <AppointmentMembershipOption
              key={membership.id}
              membership={membership}
            />
          ))}
        </Select>
      </FormField>
    </>
  );
}
