import {
  ArrowRight,
  BookOpen,
  Boxes,
  FlaskConical,
  KeyRound,
  ListTree,
  Radio,
  ScrollText,
  Terminal,
} from "lucide-react";
import Link from "next/link";

import { QUICKSTARTS, meta } from "@/lib/content";
import { allTags } from "@/lib/openapi";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Ingresar con Mi Rotaract",
    text: "OAuth 2.0 + OpenID Connect con PKCE: la gente entra a tu app con su cuenta del distrito.",
    href: "/docs/ingresar-con-mi-rotaract",
  },
  {
    icon: ListTree,
    title: "API de datos",
    text: "Padrón, autoridades, períodos y permisos, con paginación, ETag y sincronización incremental.",
    href: "/docs/api-de-datos",
  },
  {
    icon: Radio,
    title: "Webhooks firmados",
    text: "Enterate al instante de altas, bajas y cambios de autoridades, con firma HMAC verificable.",
    href: "/docs/webhooks",
  },
  {
    icon: Terminal,
    title: "CLI y kernel local",
    text: "mirotaract init y dev up: una app andando contra un distrito sintético, sin datos reales.",
    href: "/docs/cli",
  },
  {
    icon: FlaskConical,
    title: "Probar desde el navegador",
    text: "Cada operación de la referencia tiene un panel para mandarla a tu kernel local con tu token.",
    href: "/referencia",
  },
  {
    icon: ScrollText,
    title: "Registros y avisos",
    text: "Los requests de tu app en la consola, por código de error y traceId; changelog y deprecaciones con 6 meses de aviso.",
    href: "/changelog",
  },
];

export default function Home() {
  const operations = allTags().reduce(
    (total, tag) => total + tag.operations.length,
    0,
  );
  return (
    <>
      <section className="relative overflow-hidden px-4 pt-16 pb-16 md:pt-24 md:pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[28rem] max-w-4xl rounded-full bg-primary/15 blur-3xl"
        />
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wider text-primary uppercase">
            Plataforma para desarrolladores · Distrito 4845
          </p>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-balance text-foreground md:text-5xl lg:text-6xl">
            Construí apps conectadas a Mi Rotaract.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-pretty text-muted-foreground">
            El kernel de Mi Rotaract sabe quién es quién en el distrito. Tu app
            lo consulta por una API con permisos acotados, deja entrar a la
            gente con su cuenta y se entera de los cambios por webhooks.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/quickstarts"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90 sm:w-auto"
            >
              Empezar en 15 minutos
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/referencia"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 font-medium transition-colors hover:bg-muted sm:w-auto"
            >
              Referencia de la API
            </Link>
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-6xl px-4 md:px-6"
        aria-labelledby="quickstarts"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2
              id="quickstarts"
              className="text-2xl font-semibold tracking-tight"
            >
              Quickstarts
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Código copiable y probado en CI, contra un kernel local con datos
              sintéticos.
            </p>
          </div>
          <Link
            href="/quickstarts"
            className="hidden text-sm font-medium text-primary hover:underline sm:block"
          >
            Ver todos
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICKSTARTS.map((quickstart) => (
            <Link
              key={quickstart.slug}
              href={`/docs/${quickstart.slug}`}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {quickstart.lang}
              </p>
              <p className="mt-1 text-lg font-semibold group-hover:text-primary">
                {quickstart.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {quickstart.blurb}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section
        className="mx-auto mt-16 max-w-6xl px-4 md:px-6"
        aria-labelledby="capacidades"
      >
        <h2
          id="capacidades"
          className="mb-6 text-2xl font-semibold tracking-tight"
        >
          Qué podés usar
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden />
              </span>
              <p className="font-semibold">{feature.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {feature.text}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-6xl gap-4 px-4 md:grid-cols-3 md:px-6">
        <Link
          href="/docs"
          className="rounded-xl border border-border p-5 hover:bg-muted/50"
        >
          <BookOpen className="mb-3 size-5 text-primary" aria-hidden />
          <p className="font-semibold">Guías</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conceptos, autenticación, errores, seguridad y preguntas frecuentes.
          </p>
        </Link>
        <Link
          href="/referencia"
          className="rounded-xl border border-border p-5 hover:bg-muted/50"
        >
          <ListTree className="mb-3 size-5 text-primary" aria-hidden />
          <p className="font-semibold">{operations} operaciones</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Generadas del contrato OpenAPI, con ejemplos en curl, TypeScript y
            Python.
          </p>
        </Link>
        <Link
          href="/r"
          className="rounded-xl border border-border p-5 hover:bg-muted/50"
        >
          <Boxes className="mb-3 size-5 text-primary" aria-hidden />
          <p className="font-semibold">Componentes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.registryItems > 0
              ? `${meta.registryItems} componentes de Mi Rotaract para npx shadcn add.`
              : "El kit de UI de Mi Rotaract para npx shadcn add."}
          </p>
        </Link>
      </section>
    </>
  );
}
