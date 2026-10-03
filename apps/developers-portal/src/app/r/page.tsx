import { codeBlockHtml } from "@/lib/markdown";
import { registry } from "@/lib/content";
import { SITE_URL } from "@/lib/site";

export const metadata = {
  title: "Componentes (registro shadcn)",
  description:
    "Los componentes de Mi Rotaract para agregar a tu app con npx shadcn add.",
};

/** E8's shadcn registry, copied to /r at build time (packages/registry/dist/r). */
export default function Registry() {
  const items = registry?.items ?? [];
  const first = items[0]?.name ?? "status-badge";
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Componentes de Mi Rotaract
      </h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Agregá la shell, las tablas, los estados y los diálogos de Mi Rotaract a
        tu app con el CLI de shadcn: el código queda en tu proyecto y se ve como
        el resto de la plataforma. Guía:{" "}
        <a className="text-primary hover:underline" href="/docs/kit-de-ui">
          kit de UI
        </a>
        .
      </p>
      <div
        className="mt-6"
        dangerouslySetInnerHTML={{
          __html: codeBlockHtml(
            `npx shadcn@latest add ${SITE_URL}/r/${first}.json`,
            "bash",
          ),
        }}
      />
      {items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          El registro todavía no se publicó en este despliegue. Cuando el
          paquete de componentes se compile, cada uno va a estar en{" "}
          <code className="font-mono">/r/&lt;nombre&gt;.json</code> y el índice
          en <code className="font-mono">/r/registry.json</code>.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.name}
              className="rounded-xl border border-border bg-card p-5"
            >
              <p className="flex items-center justify-between gap-2 font-semibold">
                {item.title}
                {item.type ? (
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {item.type.replace(/^registry:/, "")}
                  </span>
                ) : null}
              </p>
              {item.description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
              <p className="mt-3 font-mono text-xs break-all">
                npx shadcn@latest add {SITE_URL}/r/{item.name}.json
              </p>
              {item.available ? (
                <a
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                  href={`/r/${item.name}.json`}
                >
                  Ver JSON
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
