"use client";

import { useLogout, useLogoutAllSessions } from "@/lib/api";
import { Avatar, ConfirmationDialog } from "@/components/layout";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { describeKernelError } from "./kernel-error-message";

/**
 * "Apps conectadas" (the person's OAuth consents) plus the two session
 * actions the Kernel actually exposes for the current account
 * (`revokeSession`/`revokeAllSessions` via `useLogout`/
 * `useLogoutAllSessions`) — no "Mi perfil" entry, since there's no profile
 * route/screen in this app yet and product spec §30 rules out inventing
 * settings that don't exist.
 */
export function AccountMenu({ displayName }: { displayName: string }) {
  const router = useRouter();
  const logout = useLogout();
  const logoutAll = useLogoutAllSessions();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function goToLandingAfterSignOut() {
    router.push("/");
  }

  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label={`Cuenta de ${displayName}`}
            className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Avatar name={displayName} size="sm" />
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground lg:inline">
              {displayName}
            </span>
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <DropdownLabel>{displayName}</DropdownLabel>
          <DropdownSeparator />
          <DropdownItem onSelect={() => router.push("/connected-apps")}>
            Apps conectadas
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            onSelect={() =>
              logout.mutate(undefined, { onSuccess: goToLandingAfterSignOut })
            }
          >
            Cerrar sesión
          </DropdownItem>
          <DropdownItem onSelect={() => setConfirmOpen(true)}>
            Cerrar todas las sesiones
          </DropdownItem>
        </DropdownContent>
      </Dropdown>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Cerrar todas las sesiones"
        description="Vas a cerrar la sesión en todos los dispositivos donde iniciaste sesión con esta cuenta, incluida esta."
        confirmLabel="Cerrar todas"
        confirmVariant="danger"
        isPending={logoutAll.isPending}
        errorMessage={
          logoutAll.isError ? describeKernelError(logoutAll.error) : undefined
        }
        onConfirm={() =>
          logoutAll.mutate(undefined, {
            onSuccess: () => {
              setConfirmOpen(false);
              goToLandingAfterSignOut();
            },
          })
        }
      />
    </>
  );
}
