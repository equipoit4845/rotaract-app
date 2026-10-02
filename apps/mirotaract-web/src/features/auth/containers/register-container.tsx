"use client";

import { useAuthStatus } from "@/lib/api";
import { Alert, Spinner } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "../components/auth-shell";
import { RegisterForm } from "../forms/register-form";

export function RegisterContainer() {
  const status = useAuthStatus();
  const router = useRouter();
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (status === "AUTHENTICATED") router.replace("/dashboard");
  }, [status, router]);

  if (status !== "UNAUTHENTICATED") {
    return (
      <div
        role="status"
        aria-label="Cargando"
        className="grid min-h-screen place-items-center"
      >
        <Spinner size={28} label="Cargando" />
      </div>
    );
  }

  return (
    <AuthShell
      title="Crear cuenta"
      description="Registrate para después solicitar unirte a un club o distrito."
    >
      {registered ? (
        <Alert
          tone="success"
          title="Revisá tu email"
          description="Te enviamos un enlace para verificar tu cuenta antes de poder iniciar sesión."
        />
      ) : (
        <>
          <RegisterForm onSuccess={() => setRegistered(true)} />
          <p className="text-center text-sm text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline">
            ¿Ya tenés cuenta? <Link href="/login">Ingresá</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
