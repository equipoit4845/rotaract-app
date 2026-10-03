import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { QUICKSTARTS, getDoc } from "@/lib/content";

export const metadata = {
  title: "Quickstarts",
  description:
    "Login con Mi Rotaract y padrón del club en 15 minutos, en Next.js, Express, FastAPI o Flutter.",
};

export default function Quickstarts() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Quickstarts</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        En 15 minutos: la gente entra con su cuenta de Mi Rotaract y ve el
        padrón de su club, contra un kernel local con un distrito sintético (
        <code className="rounded bg-muted px-1">mirotaract dev up</code>). El
        código es el de las plantillas de la CLI.
      </p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        Los bloques marcados “probado en CI” se compilan contra los SDKs en cada
        cambio (<code>pnpm quickstarts:check</code>).
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {QUICKSTARTS.map((quickstart) => {
          const doc = getDoc(quickstart.slug);
          return (
            <Link
              key={quickstart.slug}
              href={`/docs/${quickstart.slug}`}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {quickstart.lang}
              </p>
              <p className="mt-1 text-xl font-semibold group-hover:text-primary">
                {quickstart.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {doc?.description || quickstart.blurb}
              </p>
            </Link>
          );
        })}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        ¿Otro lenguaje? La API es HTTP + OAuth estándar: empezá por{" "}
        <Link
          className="text-primary hover:underline"
          href="/docs/autenticacion-servidor"
        >
          autenticación de servidor
        </Link>{" "}
        y la{" "}
        <Link className="text-primary hover:underline" href="/referencia">
          referencia
        </Link>
        .
      </p>
    </div>
  );
}
