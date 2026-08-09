"use client";

import { useAuthStatus } from "@/lib/api";
import { Alert, Spinner } from "@equipoit4845/ui";
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
        style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}
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
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            ¿Ya tenés cuenta? <Link href="/login">Ingresá</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
