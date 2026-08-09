"use client";

import { Alert } from "@equipoit4845/ui";
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "../components/auth-shell";
import { InviteAcceptForm } from "../forms/invite-accept-form";

/**
 * No auth-status gate here unlike login/register — accepting an invitation
 * doesn't require being signed out (an admin's own account could, in
 * principle, hold an open tab with an invite link for someone else), and
 * `POST /auth/invitations/accept` doesn't touch the caller's own session
 * either way (`security: []`, no bearer token involved).
 */
export function InviteAcceptContainer({ token }: { token: string }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <AuthShell
      title="Aceptar invitación"
      description={
        accepted
          ? undefined
          : "Definí una contraseña para crear tu cuenta y vincularla a tu membresía."
      }
    >
      {accepted ? (
        <>
          <Alert
            tone="success"
            title="Tu cuenta fue creada."
            description="Ya podés iniciar sesión con la contraseña que elegiste."
          />
          <p style={{ margin: 0 }}>
            <Link href="/login">Ir a ingresar</Link>
          </p>
        </>
      ) : (
        <InviteAcceptForm token={token} onSuccess={() => setAccepted(true)} />
      )}
    </AuthShell>
  );
}
