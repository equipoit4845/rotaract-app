"use client";

import { useVerifyEmail } from "@/lib/api";
import { Alert, Spinner } from "@equipoit4845/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { AuthShell } from "../components/auth-shell";
import { describeVerifyEmailError } from "../adapters/auth-mutation-errors";

/**
 * The token arrives already embedded in the emailed link
 * (`/verify-email/[token]`) — there's nothing for a person to type, so this
 * fires `POST /auth/verify-email` once on mount instead of behind a submit
 * button. `fired` guards against Strict Mode's double-effect re-running the
 * single-use token twice.
 */
export function VerifyEmailContainer({ token }: { token: string }) {
  const verifyEmail = useVerifyEmail();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    verifyEmail.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell title="Verificación de email">
      {verifyEmail.isPending || verifyEmail.isIdle ? (
        <div
          role="status"
          aria-label="Verificando"
          style={{ display: "flex", justifyContent: "center" }}
        >
          <Spinner size={24} label="Verificando tu email…" />
        </div>
      ) : null}

      {verifyEmail.isSuccess ? (
        <>
          <Alert
            tone="success"
            title="Tu email fue verificado."
            description="Ya podés iniciar sesión."
          />
          <p style={{ margin: 0 }}>
            <Link href="/login">Ir a ingresar</Link>
          </p>
        </>
      ) : null}

      {verifyEmail.isError ? (
        <Alert tone="danger" {...describeVerifyEmailError(verifyEmail.error)} />
      ) : null}
    </AuthShell>
  );
}
