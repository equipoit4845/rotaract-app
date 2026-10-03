import Link from "next/link";

import {
  LEVEL_TEXT,
  STATE_TEXT,
  dayTitle,
  formatInstant,
  formatUptime,
  levelColor,
  pastIncidents,
  readStatus,
  type StatusIncident,
  type StatusLevel,
} from "@/lib/status";

export const metadata = {
  title: "Estado",
  description:
    "Estado del kernel de Mi Rotaract, la API, el inicio de sesión, los webhooks y el sandbox: uptime de 90 días, incidentes y mantenimientos.",
};

// Read at request time: the page must show the kernel as it is now.
export const dynamic = "force-dynamic";

const BANNER: Record<StatusLevel, string> = {
  OPERATIONAL: "border-success/30 bg-success/10",
  DEGRADED: "border-warning/40 bg-warning/15",
  PARTIAL_OUTAGE: "border-warning/40 bg-warning/15",
  MAJOR_OUTAGE: "border-destructive/30 bg-destructive/10",
  MAINTENANCE: "border-primary/30 bg-primary/10",
  UNKNOWN: "border-border bg-muted",
};

function Dot({ level }: { level: StatusLevel }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2.5 shrink-0 rounded-full ${levelColor(level)}`}
    />
  );
}

function IncidentItem({ incident }: { incident: StatusIncident }) {
  const maintenance = incident.kind === "MAINTENANCE";
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{incident.title}</h3>
        <span className="text-xs font-medium text-muted-foreground">
          {maintenance ? "Mantenimiento" : "Incidente"} ·{" "}
          {STATE_TEXT[incident.state] ?? incident.state}
        </span>
      </div>
      {maintenance ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {formatInstant(incident.scheduledStart)} →{" "}
          {formatInstant(incident.scheduledEnd)}
        </p>
      ) : null}
      <ol className="mt-3 space-y-2 border-l border-border pl-4">
        {incident.updates.map((update) => (
          <li key={update.id} className="text-sm">
            <span className="font-medium">
              {STATE_TEXT[update.state] ?? update.state}
            </span>{" "}
            <span className="text-xs text-muted-foreground">
              {formatInstant(update.createdAt)}
            </span>
            <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
              {update.message}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}

export default async function StatusPage() {
  const read = await readStatus();

  if (!read.ok) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Estado</h1>
        <section
          className={`mt-6 rounded-xl border p-5 ${BANNER.MAJOR_OUTAGE}`}
          role="alert"
        >
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Dot level="MAJOR_OUTAGE" /> {read.reason}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            El portal no pudo consultar el estado del kernel. Si persiste, es
            probable que la API esté caída. Los SDKs reintentan solos las
            lecturas; volvé a cargar esta página en unos minutos.
          </p>
        </section>
      </div>
    );
  }

  const { summary, history } = read;
  const bars = new Map(history?.components.map((c) => [c.key, c]) ?? []);
  const past = pastIncidents(history);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estado</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Medido cada minuto desde el servidor. Actualizado{" "}
            {formatInstant(summary.generatedAt)}.
          </p>
        </div>
        <a
          href="/status.json"
          className="text-sm font-medium text-primary hover:underline"
        >
          status.json
        </a>
      </div>

      <section
        className={`mt-6 rounded-xl border p-5 ${BANNER[summary.status]}`}
      >
        <p className="flex items-center gap-2 text-lg font-semibold">
          <Dot level={summary.status} /> {summary.description}
        </p>
      </section>

      {summary.incidents.length ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">Ahora</h2>
          {summary.incidents.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} />
          ))}
        </section>
      ) : null}

      {summary.scheduledMaintenances.length ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">Mantenimientos programados</h2>
          {summary.scheduledMaintenances.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} />
          ))}
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Servicios</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {summary.components.map((component) => {
            const bar = bars.get(component.key);
            return (
              <li key={component.key} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{component.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {component.description}
                    </p>
                  </div>
                  <span className="flex items-center gap-2 text-sm">
                    <Dot level={component.status} />
                    {LEVEL_TEXT[component.status]}
                  </span>
                </div>
                {bar ? (
                  <>
                    <div
                      className="mt-3 flex h-8 gap-px"
                      aria-label={`Últimos ${bar.days.length} días`}
                    >
                      {bar.days.map((day) => (
                        <span
                          key={day.date}
                          title={dayTitle(day)}
                          className={`flex-1 rounded-[2px] ${levelColor(day.status)}`}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>Hace {bar.days.length} días</span>
                      <span>
                        {formatUptime(bar.uptime)} de disponibilidad · 30 días:{" "}
                        {formatUptime(bar.uptime30d)}
                      </span>
                      <span>Hoy</span>
                    </div>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Los minutos de un mantenimiento anunciado no cuentan para la
          disponibilidad. Días en UTC.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-semibold">Historial (90 días)</h2>
        {past.length ? (
          past.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin incidentes ni mantenimientos en los últimos 90 días.
          </p>
        )}
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        Los mismos datos en JSON: <code>GET /status</code> y{" "}
        <code>GET /status/history</code> de la API (públicos, sin token). Ver{" "}
        <Link href="/docs/estado" className="text-primary hover:underline">
          cómo usarlos
        </Link>
        .
      </p>
    </div>
  );
}
