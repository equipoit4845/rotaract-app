import { Gem } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import { MIROTARACT_URL } from "@/lib/config";
import { getMiRotaract } from "@/lib/server/mirotaract";

export const dynamic = "force-dynamic";

const LOGIN_ERRORS: Record<string, string> = {
  access_denied: "Cancelaste el ingreso con Mi Rotaract.",
  login_expired: "El intento de ingreso expiró. Probá de nuevo.",
  unavailable:
    "Mi Rotaract no está disponible en este momento. Probá de nuevo en unos minutos.",
};

async function hasSession(): Promise<boolean> {
  try {
    return (await getMiRotaract().getSession(await cookies())) !== null;
  } catch {
    return false;
  }
}

/** `/`: logged in → "Mis reuniones"; otherwise a small landing (same chrome as Mi Rotaract's AuthShell). */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await hasSession()) redirect("/meetings");
  const { error } = await searchParams;
  const errorMessage = error
    ? (LOGIN_ERRORS[error] ??
      "No se pudo completar el ingreso. Probá de nuevo.")
    : null;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-black/10 blur-2xl"
        />
        <a
          href={MIROTARACT_URL}
          className="relative flex items-center gap-2 text-lg font-semibold"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-white/15">
            <Gem size={20} strokeWidth={1.8} aria-hidden />
          </span>
          Mi Rotaract
        </a>
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-balance">
            Reuniones distritales, en vivo.
          </p>
          <p className="mt-4 text-primary-foreground/80">
            Asistencia y quórum, orden del día, pedidos de palabra, mociones,
            votaciones y actas del Distrito 4845.
          </p>
        </div>
        <p className="relative text-sm text-primary-foreground/70">
          Rotaract Distrito 4845
        </p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <span className="flex items-center gap-2 font-semibold text-foreground lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Gem size={18} strokeWidth={1.8} aria-hidden />
            </span>
            Mi Rotaract
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12">
          <div className="w-full max-w-sm">
            <Card className="shadow-sm">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Reuniones
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Ingresá con tu cuenta de Mi Rotaract para ver tus reuniones
                    distritales.
                  </p>
                </div>
                {errorMessage ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMessage}
                  </p>
                ) : null}
                <a
                  href="/auth/login?returnTo=%2Fmeetings"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Gem size={16} strokeWidth={1.8} aria-hidden />
                  Ingresar con Mi Rotaract
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
