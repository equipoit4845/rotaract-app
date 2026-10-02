"use client";

import type { AuthorizeRequest } from "@/lib/api";
import {
  useAuthorizationContext,
  useAuthorizeOAuthRequest,
  useAuthStatus,
  useCurrentUser,
  useLogout,
} from "@/lib/api";
import { Avatar } from "@/components/layout";
import { Alert, Button, Spinner } from "@/components/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  readAuthorizeParams,
  toAuthorizeRequest,
} from "../utils/authorize-params";
import { externalNavigation } from "../utils/external-navigation";

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-screen place-items-center"
    >
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Spinner size={28} label={label} />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** `useSearchParams` needs a Suspense boundary during static prerendering. */
export function AuthorizeContainer() {
  return (
    <Suspense fallback={<FullScreenSpinner label="Cargando" />}>
      <AuthorizeContainerInner />
    </Suspense>
  );
}

/**
 * `/oauth/authorize` — "Ingresar con Mi Rotaract" (docs/11, E3).
 *
 * 1. Without a session → `/login?next=<this URL>` and back.
 * 2. With a session → the Kernel validates the request
 *    (`GET /oauth/authorize/context`). An invalid request is shown here and
 *    never redirects anywhere: the redirect URI may not be trustworthy.
 * 3. If the person already gave this access, approve silently; otherwise
 *    ask. Either decision follows the Kernel's `redirectTo`.
 */
function AuthorizeContainerInner() {
  const status = useAuthStatus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const currentPath = query ? `${pathname}?${query}` : pathname;

  const params = useMemo(
    () => readAuthorizeParams(new URLSearchParams(query)),
    [query],
  );
  const isAuthenticated = status === "AUTHENTICATED";
  const context = useAuthorizationContext(
    isAuthenticated && params ? params.context : undefined,
  );
  const authorize = useAuthorizeOAuthRequest();
  const { data: currentUser } = useCurrentUser();
  const logout = useLogout();
  const [leaving, setLeaving] = useState(false);
  const autoApproved = useRef(false);

  // Once: the login redirect leaves this page; re-firing on a changed query
  // would replace it with a `next` that no longer points at this request.
  const redirectedToLogin = useRef(false);
  useEffect(() => {
    if (status === "UNAUTHENTICATED" && !redirectedToLogin.current) {
      redirectedToLogin.current = true;
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    }
  }, [status, currentPath, router]);

  const { mutate: submitDecision } = authorize;
  const decide = useCallback(
    (decision: AuthorizeRequest["decision"]) => {
      if (!params) return;
      submitDecision(toAuthorizeRequest(params, decision), {
        onSuccess: ({ redirectTo }) => {
          setLeaving(true);
          externalNavigation.assign(redirectTo);
        },
      });
    },
    [params, submitDecision],
  );

  const alreadyGranted = context.data?.alreadyGranted === true;
  useEffect(() => {
    if (alreadyGranted && !autoApproved.current) {
      autoApproved.current = true;
      decide("approve");
    }
  }, [alreadyGranted, decide]);

  if (!isAuthenticated) return <FullScreenSpinner label="Cargando" />;

  if (!params) {
    return (
      <ProblemScreen
        title="Al pedido de ingreso le faltan datos"
        description="Volvé a la app e intentá de nuevo. Si sigue pasando, avisale a quien la administra."
      />
    );
  }

  if (context.isLoading) {
    return <FullScreenSpinner label="Verificando la app" />;
  }

  if (context.isError || !context.data) {
    const message = describeKernelError(context.error);
    return (
      <ProblemScreen title={message.title} description={message.description} />
    );
  }

  const { app, scopes } = context.data;
  const authorizeError = authorize.isError
    ? describeKernelError(authorize.error)
    : undefined;

  if ((alreadyGranted || leaving) && !authorizeError) {
    return <FullScreenSpinner label={`Volviendo a ${app.name}`} />;
  }

  return (
    <AuthShell
      title={`Ingresar a ${app.name}`}
      description={
        <>
          Una app de <strong>{app.organizationName}</strong> quiere usar tu
          cuenta de Mi Rotaract.
        </>
      }
      footer={
        <p>
          Podés quitarle el acceso cuando quieras desde{" "}
          <Link href="/connected-apps">Apps conectadas</Link>.
        </p>
      }
    >
      {currentUser ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Avatar name={currentUser.displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {currentUser.displayName}
            </p>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              ¿No sos vos? Cambiar de cuenta
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">
          Si continuás, {app.name} va a poder ver:
        </p>
        <ul className="space-y-2">
          {scopes.map((scope) => (
            <li key={scope.scope} className="flex items-start gap-2 text-sm">
              <Check
                className="mt-0.5 size-4 shrink-0 text-success"
                aria-hidden
              />
              {scope.label}
            </li>
          ))}
        </ul>
      </div>

      {authorizeError ? (
        <Alert
          tone="danger"
          title={authorizeError.title}
          description={authorizeError.description}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={authorize.isPending}
          onClick={() => decide("deny")}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={authorize.isPending}
          onClick={() => decide("approve")}
        >
          {authorize.isPending ? "Procesando…" : "Permitir"}
        </Button>
      </div>
    </AuthShell>
  );
}

function ProblemScreen({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <AuthShell
      title="No pudimos continuar"
      footer={
        <p>
          <Link href="/dashboard">Ir a Mi Rotaract</Link>
        </p>
      }
    >
      <Alert tone="danger" title={title} description={description} />
    </AuthShell>
  );
}
