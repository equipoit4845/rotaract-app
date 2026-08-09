"use client";

import type { OrganizationMembership } from "@/lib/api";

import { ActivateMembershipDialog } from "../forms/activate-membership-dialog";
import { DeactivateMembershipDialog } from "../forms/deactivate-membership-dialog";
import { GraduateMembershipDialog } from "../forms/graduate-membership-dialog";
import { LeaveMembershipDialog } from "../forms/leave-membership-dialog";
import { ReactivateMembershipDialog } from "../forms/reactivate-membership-dialog";
import { ResumeMembershipDialog } from "../forms/resume-membership-dialog";

/**
 * Each dialog gates itself on `useCan()` + the real state machine
 * (`membership-lifecycle.ts`) and renders nothing when not applicable —
 * this row never hardcodes which actions exist for a given status
 * (product spec §16/§30), it just lays out whatever the six dialogs decide
 * to render.
 */
export function MembershipActionsRow({
  membership,
  personLabel,
}: {
  membership: OrganizationMembership;
  personLabel: string;
}) {
  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      <ActivateMembershipDialog
        membership={membership}
        personLabel={personLabel}
      />
      <LeaveMembershipDialog
        membership={membership}
        personLabel={personLabel}
      />
      <ResumeMembershipDialog
        membership={membership}
        personLabel={personLabel}
      />
      <DeactivateMembershipDialog
        membership={membership}
        personLabel={personLabel}
      />
      <GraduateMembershipDialog
        membership={membership}
        personLabel={personLabel}
      />
      <ReactivateMembershipDialog
        membership={membership}
        personLabel={personLabel}
      />
    </div>
  );
}
