"use client";

import { Alert } from "@/components/ui";
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
      <p className="text-center text-sm text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline">
        <Link href="/login">Volver a ingresar</Link>
      </p>
    </AuthShell>
  );
}
