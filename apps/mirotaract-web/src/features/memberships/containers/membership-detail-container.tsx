"use client";

import {
  KernelApiError,
  useMembership,
  useMembershipHistory,
  usePerson,
} from "@/lib/api";
import { Avatar, DataState, EntityHero } from "@/components/layout";
import { StatusBadge } from "@/components/domain/status-badge";
import { Skeleton } from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { personDisplayName } from "../adapters/person-display-name";
import { MembershipActionsRow } from "../components/membership-actions-row";
import { MembershipHistoryTimeline } from "../components/membership-history-timeline";
import { MembershipSummaryCard } from "../components/membership-summary-card";

export function MembershipDetailContainer({
  membershipId,
}: {
  membershipId: string;
}) {
  const membershipQuery = useMembership(membershipId);
  const membership = membershipQuery.data;
  const personQuery = usePerson(membership?.personId);
  const historyQuery = useMembershipHistory(membershipId);

  if (membershipQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (membershipQuery.isError) {
    const error = membershipQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Membresía no encontrada"
          description="No encontramos la membresía que buscás. Puede haber sido eliminada o el enlace estar desactualizado."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  if (!membership) return null;

  const personLabel = personQuery.data
    ? personDisplayName(personQuery.data)
    : "esta persona";

  return (
    <>
      <EntityHero
        badges={<StatusBadge kind="membership" status={membership.status} />}
        image={<Avatar name={personLabel} size="lg" />}
        title={personLabel}
        subtitle="Membresía"
        breadcrumb={[
          { label: "Socios", href: "/memberships" },
          { label: personLabel },
        ]}
        actions={
          <MembershipActionsRow
            membership={membership}
            personLabel={personLabel}
          />
        }
      />
      <div className="flex flex-col gap-4">
        <MembershipSummaryCard membership={membership} />
        {historyQuery.isLoading ? (
          <Skeleton className="h-32" />
        ) : historyQuery.isError ? (
          <DataState
            kind="error"
            {...describeKernelError(historyQuery.error)}
          />
        ) : (
          <MembershipHistoryTimeline transitions={historyQuery.data ?? []} />
        )}
      </div>
    </>
  );
}
