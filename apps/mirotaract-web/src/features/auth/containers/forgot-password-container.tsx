"use client";

import { Alert } from "@equipoit4845/ui";
import Link from "next/link";
import { useState } from "react";

import { AuthShell } from "../components/auth-shell";
import { ForgotPasswordForm } from "../forms/forgot-password-form";

export function ForgotPasswordContainer() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <AuthShell
      title="Recuperar contraseña"
      description={
        submitted ? undefined : "Ingresá tu email para recibir instrucciones."
      }
    >
      {submitted ? (
        <Alert
          tone="info"
          title="Si existe una cuenta asociada, recibirás instrucciones."
        />
      ) : (
        <ForgotPasswordForm onSuccess={() => setSubmitted(true)} />
      )}
      <p style={{ margin: 0, fontSize: "0.875rem" }}>
        <Link href="/login">Volver a ingresar</Link>
      </p>
    </AuthShell>
  );
}
