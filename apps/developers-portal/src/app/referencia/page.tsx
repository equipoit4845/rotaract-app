import Link from "next/link";

import { MethodBadge } from "@/components/operation-card";
import { ReferenceSidebar } from "@/components/reference-sidebar";
import { ConnectionBar } from "@/components/try-panel";
import { DEVELOPER_TAGS, allTags, contractVersion } from "@/lib/openapi";

export const metadata = {
  title: "Referencia de la API",
  description:
    "Todas las operaciones del kernel de Mi Rotaract, generadas del contrato OpenAPI, con ejemplos y un panel para probarlas.",
};

export default function ReferenceIndex() {
  const tags = allTags();
  const forApps = tags.filter((tag) => DEVELOPER_TAGS.includes(tag.name));
  const platform = tags.filter((tag) => !DEVELOPER_TAGS.includes(tag.name));
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
          <ReferenceSidebar tags={tags} />
        </div>
      </aside>
      <div className="min-w-0 space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">
            Referencia de la API
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Generada de{" "}
            <a className="text-primary hover:underline" href="/openapi.yaml">
              kernel-openapi.yaml
            </a>{" "}
            (v{contractVersion}). La base es{" "}
            <code className="rounded bg-muted px-1 font-mono text-sm">
              https://api.rotaract4845.com/api/kernel/v1
            </code>
            . Los errores siguen{" "}
            <Link className="text-primary hover:underline" href="/docs/errores">
              Problem Details
            </Link>{" "}
            y siempre traen un <code>traceId</code>.
          </p>
        </header>
        <ConnectionBar />
        {[
          {
            title: "Para apps",
            items: forApps,
            text: "Lo que usa una app de un comité: tokens, API de datos, eventos y su propia configuración.",
          },
          {
            title: "Plataforma",
            items: platform,
            text: "Operaciones de la consola de Mi Rotaract. Necesitan el token de una sesión de una persona con permisos; una app no las usa con su token de servicio.",
          },
        ].map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{section.text}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {section.items.map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/referencia/${tag.slug}`}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <p className="flex items-center justify-between font-semibold">
                    {tag.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      {tag.operations.length} operaciones
                    </span>
                  </p>
                  {tag.description ? (
                    <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">
                      {tag.description}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-1">
                    {tag.operations.slice(0, 3).map((operation) => (
                      <li
                        key={operation.operationId}
                        className="flex items-center gap-2 text-xs"
                      >
                        <MethodBadge method={operation.method} />
                        <code className="truncate font-mono">
                          {operation.path}
                        </code>
                      </li>
                    ))}
                  </ul>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
