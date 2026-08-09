"use client";

import { useRouter } from "next/navigation";

import { AuthShell } from "../components/auth-shell";
import { ResetPasswordForm } from "../forms/reset-password-form";

/**
 * Product spec §23: on success, redirect straight to `/login` — the Kernel
 * already invalidated the reset token server-side, there's nothing left
 * for this screen to hold onto (no local copy of the token survives past
 * the submit call).
 */
export function ResetPasswordContainer({ token }: { token: string }) {
  const router = useRouter();

  return (
    <AuthShell
      title="Restablecer contraseña"
      description="Elegí una nueva contraseña para tu cuenta."
    >
      <ResetPasswordForm
        token={token}
        onSuccess={() => router.replace("/login")}
      />
    </AuthShell>
  );
}
