"use client";

import { useAuthStatus } from "@/lib/api";
import { Spinner } from "@/components/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { AuthShell } from "../components/auth-shell";
import { LoginForm } from "../forms/login-form";
import { resolveSafeNext } from "../utils/safe-redirect";

function LoginLoading() {
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

/**
 * `useSearchParams` (for `next`) requires a Suspense boundary during static
 * prerendering — the actual logic lives in `LoginContainerInner`.
 */
export function LoginContainer() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContainerInner />
    </Suspense>
  );
}

/**
 * `BOOTSTRAPPING` never renders the form — the silent refresh
 * (session-bootstrap.tsx) hasn't resolved yet, and showing a login prompt
 * that then flips to "you're already signed in" a moment later is exactly
 * the flicker product spec §17/§25 rules out. `AUTHENTICATED` redirects
 * away instead of rendering the form at all.
 */
function LoginContainerInner() {
  const status = useAuthStatus();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = resolveSafeNext(searchParams.get("next"));

  useEffect(() => {
    if (status === "AUTHENTICATED") router.replace(next);
  }, [status, next, router]);

  if (status !== "UNAUTHENTICATED") {
    return <LoginLoading />;
  }

  return (
    <AuthShell
      title="Ingresar"
      description="Accedé con la cuenta vinculada a tu organización."
      footer={
        <>
          <p>
            <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </p>
          <p>
            ¿No tenés cuenta? <Link href="/register">Creá una</Link>
          </p>
        </>
      }
    >
      <LoginForm onSuccess={() => router.replace(next)} />
    </AuthShell>
  );
}
