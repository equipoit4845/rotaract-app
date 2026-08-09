"use client";

import { useLogout, useLogoutAllSessions } from "@/lib/api";
import { Avatar } from "@equipoit4845/admin-shell";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmationDialog } from "./confirmation-dialog";
import { describeKernelError } from "./kernel-error-message";

/**
 * Only the two session actions the Kernel actually exposes for the
 * current account (`revokeSession`/`revokeAllSessions` via
 * `useLogout`/`useLogoutAllSessions`) — no "Mi perfil" entry, since there's
 * no profile route/screen in this app yet and product spec §30 rules out
 * inventing settings that don't exist.
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
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <Avatar name={displayName} size="sm" />
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          <DropdownLabel>{displayName}</DropdownLabel>
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
