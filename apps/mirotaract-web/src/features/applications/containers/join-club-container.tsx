"use client";

import {
  useCreateMembershipApplication,
  useOrganizations,
  useSubmitMembershipApplication,
} from "@/lib/api";
import { DataState, PageHeader } from "@/components/layout";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Input,
  Skeleton,
} from "@/components/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";
import { cn } from "@/lib/cn";

/**
 * Self-service entry point brought from the legacy product flow:
 * account -> choose a club -> submitted request -> president review.
 *
 * It only composes existing Kernel hooks.  The client never creates a
 * membership itself: approval remains the sole server-side transition that
 * makes the applicant an active club member.
 */
export function JoinClubContainer() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedClubId, setSelectedClubId] = useState<string>();
  const clubs = useOrganizations({ type: "CLUB", status: "ACTIVE" });
  const create = useCreateMembershipApplication();
  const submit = useSubmitMembershipApplication();

  const items = useMemo(
    () =>
      (clubs.data?.pages.flatMap((page) => page.items) ?? [])
        .filter((club): club is NonNullable<typeof club> => Boolean(club))
        .filter((club) =>
          `${club.name} ${club.code}`
            .toLocaleLowerCase("es")
            .includes(search.trim().toLocaleLowerCase("es")),
        ),
    [clubs.data, search],
  );
  const selectedClub = items.find((club) => club.id === selectedClubId);
  const error = create.error ?? submit.error;

  function requestToJoin() {
    if (!selectedClubId) return;
    create.mutate(
      { organizationId: selectedClubId },
      {
        onSuccess: (application) =>
          submit.mutate(application.id, {
            onSuccess: (submitted) =>
              router.push(`/applications/${submitted.id}`),
          }),
      },
    );
  }

  if (clubs.isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-12" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (clubs.isError)
    return <DataState kind="error" {...describeKernelError(clubs.error)} />;

  return (
    <>
      <PageHeader
        title="Encontrá tu club"
        description="Elegí el club al que querés sumarte. La presidencia recibirá tu solicitud y deberá aprobarla."
      />
      <Card>
        <CardContent className="grid gap-3 pt-4">
          <Input
            aria-label="Buscar club"
            placeholder="Buscar por nombre o código"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {items.length === 0 ? (
            <DataState
              title="No encontramos clubes"
              description="Probá con otro nombre o contactá al Distrito 4845."
            />
          ) : (
            <div
              role="listbox"
              aria-label="Clubes disponibles"
              className="grid gap-2"
            >
              {items.map((club) => {
                const selected = selectedClubId === club.id;
                return (
                  <button
                    key={club.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setSelectedClubId(club.id)}
                    className={cn(
                      "w-full cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    <strong>{club.name}</strong>
                    <span className="block text-muted-foreground">
                      {club.code}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {error ? (
            <Alert tone="danger" {...describeKernelError(error)} />
          ) : null}

          <Button
            onClick={requestToJoin}
            disabled={!selectedClubId || create.isPending || submit.isPending}
          >
            {create.isPending || submit.isPending
              ? "Enviando solicitud…"
              : selectedClub
                ? `Solicitar ingreso a ${selectedClub.name}`
                : "Elegí un club"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
