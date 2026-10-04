import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  FileDown,
  Laptop,
  LayoutDashboard,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  IaProvider,
  IdeaCards,
  IdeaForm,
  PlanningLink,
  PromptPanel,
} from "@/components/ia-workspace";
import { ia } from "@/lib/ia";

export const metadata = {
  title: "Creá tu solución con IA",
  description:
    "Describí tu idea para Rotaract, copiá un prompt y tu asistente de código (Claude Code, Cursor, Copilot) arma la app conectada a Mi Rotaract, con las herramientas oficiales.",
};

const ASSISTANTS = [
  {
    name: "Claude Code",
    note: "Recomendado. En la terminal, en VS Code o en la app de escritorio.",
    href: "https://claude.com/claude-code",
  },
  {
    name: "Cursor",
    note: "Editor con agente. Usalo en modo Agent.",
    href: "https://cursor.com",
  },
  {
    name: "VS Code + GitHub Copilot",
    note: "Con el modo agente activado (Copilot Chat → Agent).",
    href: "https://code.visualstudio.com/docs/copilot/overview",
  },
  {
    name: "Codex, Gemini CLI y otros",
    note: "Cualquiera que corra comandos y lea AGENTS.md.",
    href: "https://agents.md",
  },
];

const STEPS = [
  "Revisa que tengas Node, Docker y git, y te explica cómo instalar lo que falte.",
  "Instala las herramientas oficiales: la CLI de Mi Rotaract, las skills y el servidor MCP.",
  "Lee la documentación de la plataforma antes de escribir código.",
  "Te muestra un plan corto (PLAN.md) y espera tu OK.",
  "Crea la app desde la plantilla oficial y levanta en tu computadora un Mi Rotaract de prueba, con un distrito inventado (la primera vez tarda 10 a 15 minutos).",
  "Construye la app con la arquitectura recomendada, en castellano y con el aspecto de Mi Rotaract.",
  "Repasa el checklist de seguridad y corre los evaluadores automáticos.",
  "Te la muestra funcionando y te dice con qué cuentas de prueba entrar.",
  "Deja todo listo para publicarla: variables, guía de despliegue y el texto para la revisión del RDR.",
];

const HOSTS = [
  {
    template: "Next.js",
    host: "Vercel",
    href: "https://vercel.com",
    how: "Importás el repositorio de GitHub; el plan gratuito alcanza para empezar.",
  },
  {
    template: "FastAPI (Python)",
    host: "Render",
    href: "https://render.com",
    how: "Web Service con uvicorn. Railway o Fly.io también sirven.",
  },
];

const ENV_VARS = [
  ["MIROTARACT_ISSUER", "https://api.rotaract4845.com/api/kernel/v1"],
  ["MIROTARACT_BASE_URL", "https://api.rotaract4845.com/api/kernel/v1"],
  ["MIROTARACT_CLIENT_ID", "el que te da el RDR (mra_…)"],
  [
    "MIROTARACT_CLIENT_SECRET",
    "el secreto de la app (mrs_…), solo en el servidor",
  ],
  ["MIROTARACT_ORGANIZATION_ID", "el club o el distrito de la app"],
  ["APP_URL", "la dirección pública de tu app"],
  ["SESSION_SECRET", "32+ caracteres aleatorios"],
  ["MIROTARACT_WEBHOOK_SECRET", "si recibe webhooks (whsec_…)"],
  ["DATABASE_URL", "si guarda datos propios"],
];

const FAQ: Array<{ q: string; a: ReactNode }> = [
  {
    q: "¿Cuánto cuesta?",
    a: (
      <>
        La plataforma, la CLI, el SDK y el servidor MCP son gratis (licencia
        MIT). Lo que puede costar es el asistente: Claude Code, Cursor y Copilot
        tienen planes pagos (algunos con prueba gratuita). Para publicar, Vercel
        y Render tienen planes gratuitos que alcanzan para una app de club.
      </>
    ),
  },
  {
    q: "¿Qué pasa con los datos de los socios?",
    a: (
      <>
        Mientras desarrollás, todo corre en tu computadora contra un distrito
        inventado (Distrito 9999) con personas ficticias: el asistente nunca ve
        datos reales. En producción, tu app solo puede leer lo que el RDR
        apruebe, con los permisos mínimos, y cada persona ve qué apps acceden a
        sus datos y puede retirar el acceso. Este formulario no manda nada: el
        prompt se arma en tu navegador.
      </>
    ),
  },
  {
    q: "¿Y si algo falla?",
    a: (
      <>
        El prompt le pide al asistente que lea el error, pruebe soluciones y, si
        no puede, te explique en simple qué pasa. Lo más común: Docker no está
        abierto, o los puertos 54321/54322 están ocupados. Podés pedirle
        &ldquo;volvé a intentarlo&rdquo; o &ldquo;explicame el error&rdquo;.
        Nada de lo que hace toca Mi Rotaract de verdad.
      </>
    ),
  },
  {
    q: "¿Dónde pido ayuda?",
    a: (
      <>
        Abrí un issue en{" "}
        <a
          className="text-primary hover:underline"
          href="https://github.com/equipoit4845/rotaract-app/issues"
        >
          github.com/equipoit4845/rotaract-app
        </a>{" "}
        con lo que intentaste y el error, o escribile al equipo de Mi Rotaract
        del distrito. Antes, revisá las{" "}
        <Link className="text-primary hover:underline" href="/docs/faq">
          preguntas frecuentes
        </Link>
        .
      </>
    ),
  },
  {
    q: "¿Necesito saber programar?",
    a: (
      <>
        No para empezar: el asistente escribe el código y te explica lo que
        hace. Sí vas a tener que instalar programas, aprobar el plan, probar la
        app y decidir lo que es tuyo (quién es responsable, dónde publicarla).
        Si alguien de tu club programa, mejor: puede revisar el resultado.
      </>
    ),
  },
  {
    q: "¿Puedo usar ChatGPT o Claude en el navegador?",
    a: (
      <>
        Sirven para pensar la idea, pero no pueden instalar herramientas ni
        correr la app en tu computadora. Usá el botón &ldquo;Abrir en Claude
        para planificar&rdquo; y, para construir, un asistente de código.
      </>
    ),
  },
];

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mx-auto mt-16 max-w-6xl scroll-mt-24 px-4 md:px-6"
    >
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">
        {eyebrow}
      </p>
      <h2
        id={`${id}-title`}
        className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl"
      >
        {title}
      </h2>
      {intro ? (
        <p className="mt-2 max-w-3xl text-muted-foreground">{intro}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function IaPage() {
  const { bundle } = ia;
  const preliminary = bundle.status !== "evaluated";
  const byTarget = (target: string) =>
    bundle.files.filter((file) => file.target === target);
  return (
    <IaProvider>
      <section className="relative overflow-hidden px-4 pt-14 pb-6 md:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[26rem] max-w-4xl rounded-full bg-primary/15 blur-3xl"
        />
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium tracking-wider text-primary uppercase">
            <Sparkles className="size-3.5" aria-hidden /> Implementar con IA
          </p>
          <h1 className="mb-5 text-4xl font-bold tracking-tight text-balance md:text-5xl">
            Creá tu solución para Rotaract con IA
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-pretty text-muted-foreground">
            Contale tu idea a un asistente de código y él la construye: con los
            datos oficiales de Mi Rotaract, la arquitectura recomendada y las
            herramientas del distrito. No hace falta ser desarrollador.
          </p>
          <ol className="mx-auto mt-8 grid max-w-2xl gap-3 text-left text-sm sm:grid-cols-3">
            {[
              ["1", "Elegí o describí tu idea"],
              ["2", "Copiá el prompt"],
              ["3", "Pegalo en tu asistente"],
            ].map(([n, text]) => (
              <li
                key={n}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {n}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Section
        id="ideas"
        eyebrow="Paso 1"
        title="¿Qué podés construir?"
        intro="Algunas ideas para empezar. Tocá “Usar esta idea” y se completa el formulario; después la podés cambiar a tu gusto."
      >
        <IdeaCards ideas={ia.ideas} />
      </Section>

      <Section
        id="lo-que-necesitas"
        eyebrow="Antes de empezar"
        title="Lo que necesitás"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="rounded-xl border border-border bg-card p-5">
            <span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Laptop className="size-5" aria-hidden />
            </span>
            <p className="font-semibold">Una computadora con</p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                ["Node 20 o más", "el motor que corre las herramientas"],
                ["Docker", "para el Mi Rotaract de prueba en tu computadora"],
                ["git", "para bajar el código del distrito"],
              ].map(([name, why]) => (
                <li key={name} className="flex gap-2">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden
                  />
                  <span>
                    <strong className="font-medium">{name}</strong>:{" "}
                    <span className="text-muted-foreground">{why}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Mac, Windows (con WSL2) o Linux, con unos 6 GB libres. Si te falta
              algo, el asistente te explica cómo instalarlo.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Bot className="size-5" aria-hidden />
            </span>
            <p className="font-semibold">
              Un asistente de código que pueda correr comandos
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {ASSISTANTS.map((assistant) => (
                <li
                  key={assistant.name}
                  className="rounded-lg border border-border p-3 text-sm"
                >
                  <a
                    href={assistant.href}
                    className="font-medium hover:text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {assistant.name}
                  </a>
                  <p className="mt-0.5 text-muted-foreground">
                    {assistant.note}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 rounded-lg bg-muted/60 p-4 text-sm sm:flex-row sm:items-center">
              <MessagesSquare
                className="hidden size-5 shrink-0 text-muted-foreground sm:block"
                aria-hidden
              />
              <p className="flex-1 text-muted-foreground">
                <strong className="font-medium text-foreground">
                  ¿Solo tenés Claude o ChatGPT en el navegador?
                </strong>{" "}
                Sirven para pensar la idea, pero no pueden construirla: no
                instalan nada ni corren la app.
              </p>
              <PlanningLink planning={ia.planning} />
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="describi-tu-idea"
        eyebrow="Paso 2"
        title="Describí tu idea"
        intro="Con tus palabras, como se lo contarías a alguien del club. Lo que no completes, el asistente te lo pregunta."
      >
        <IdeaForm />
      </Section>

      <Section
        id="el-prompt"
        eyebrow="Paso 3"
        title="El prompt"
        intro={
          <>
            Elegí tu asistente, copiá el prompt y pegalo en una conversación
            nueva, abierta en una carpeta vacía (por ejemplo{" "}
            <code className="rounded bg-muted px-1">mi-app-rotaract</code>).
            También está en{" "}
            <a className="text-primary hover:underline" href="/ia/prompt.md">
              /ia/prompt.md
            </a>{" "}
            para cualquier asistente.
          </>
        }
      >
        <PromptPanel master={ia.master} />
      </Section>

      <Section
        id="que-va-a-pasar"
        eyebrow="Mientras trabaja"
        title="Qué va a pasar"
        intro="Tu asistente va a ir paso a paso y te va a preguntar solo lo que tenés que decidir vos."
      >
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="cuando-este-lista"
        eyebrow="Después"
        title="Cuando esté lista"
        intro="Tu asistente te deja el texto y las guías; estos pasos los hacés vos, con el RDR."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ClipboardCheck,
              title: "1. Registrá la app",
              text: "Mandale al RDR el archivo REVISION-RDR.md que preparó tu asistente: propósito, datos que pide, responsable, privacidad y contacto.",
              href: "/docs/registrar-una-app",
              link: "Cómo se registra",
            },
            {
              icon: ShieldCheck,
              title: "2. Revisión del RDR",
              text: "Cuando el RDR aprueba tu app, pasa de prueba a producción con los permisos aprobados y sus límites de uso.",
              href: "/docs/revision-de-apps",
              link: "Cómo es la revisión",
            },
            {
              icon: Cloud,
              title: "3. Publicala",
              text: "En un servicio simple (abajo), cargando las credenciales que te dio el RDR.",
              href: "/docs/seguridad",
              link: "Checklist de producción",
            },
            {
              icon: LayoutDashboard,
              title: "4. En el panel de los socios",
              text: "Una vez aprobada, la app aparece en el panel de los socios de Mi Rotaract para que la usen.",
              href: "/docs/revision-de-apps",
              link: "Catálogo de apps",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="flex flex-col rounded-xl border border-border bg-card p-5"
            >
              <span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="size-5" aria-hidden />
              </span>
              <p className="font-semibold">{card.title}</p>
              <p className="mt-1.5 flex-1 text-sm text-muted-foreground">
                {card.text}
              </p>
              <Link
                href={card.href}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {card.link} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="font-semibold">Dónde publicarla</p>
            <ul className="mt-3 space-y-3 text-sm">
              {HOSTS.map((host) => (
                <li key={host.template}>
                  <span className="font-medium">{host.template}</span> →{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href={host.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {host.host}
                  </a>
                  <p className="text-muted-foreground">{host.how}</p>
                </li>
              ))}
              <li>
                <span className="font-medium">Base de datos</span>, si la usa:
                un Postgres administrado (Neon, Supabase o el del mismo
                servicio).
              </li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Límites de uso por app:{" "}
              <Link
                className="text-primary hover:underline"
                href="/docs/limites"
              >
                límites
              </Link>
              .
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <p className="border-b border-border px-5 py-3 font-semibold">
              Variables de entorno en el servicio
            </p>
            <dl className="text-sm">
              {ENV_VARS.map(([name, value]) => (
                <div
                  key={name}
                  className="grid gap-0.5 border-b border-border px-5 py-2.5 last:border-0 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="font-mono text-[12.5px] [overflow-wrap:anywhere]">
                    {name}
                  </dt>
                  <dd className="text-muted-foreground [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <Section
        id="skills"
        eyebrow="Para curiosos"
        title="Las herramientas que instala"
        intro={
          <>
            El prompt instala la CLI (<code>@mirotaract/cli</code>), el servidor
            MCP (<code>@mirotaract/mcp</code>) y las skills: guías por tarea
            para tu asistente. También las podés bajar a mano.
          </>
        }
      >
        {preliminary ? (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-warning-foreground"
              aria-hidden
            />
            <span>
              <strong className="font-medium">Versión preliminar:</strong> las
              skills todavía no pasaron las evaluaciones automáticas. Son
              útiles, pero si contradicen la documentación, manda la
              documentación.
            </span>
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            <p className="font-semibold">Instalarlas en tu proyecto</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-code p-3 font-mono text-[12.5px] text-code-foreground">
              npx @mirotaract/cli@latest ai install --target claude
            </pre>
            <p className="mt-3 text-muted-foreground">
              Destinos: <code>claude</code>, <code>cursor</code>,{" "}
              <code>copilot</code>, <code>agents</code> o <code>all</code>. La
              CLI baja el paquete y verifica su suma SHA-256 antes de escribir.
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Versión de las skills</dt>
              <dd className="font-mono">{bundle.fingerprint}</dd>
              <dt className="text-muted-foreground">SHA-256</dt>
              <dd className="font-mono break-all">{bundle.sha256}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/ia/skills.json"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <FileDown className="size-3.5" aria-hidden /> skills.json
              </a>
              <a
                href="/ia/skills.json.sha256"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <FileDown className="size-3.5" aria-hidden /> .sha256
              </a>
              <Link
                href="/docs/ia"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Guía de IA
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            <p className="font-semibold">Archivos sueltos</p>
            <ul className="mt-3 space-y-3">
              <li>
                <span className="font-medium">AGENTS.md</span> (Codex, Gemini y
                otros):{" "}
                <a
                  className="text-primary hover:underline"
                  href="/ia/AGENTS.md"
                >
                  /ia/AGENTS.md
                </a>
              </li>
              {[
                ["claude", "Claude Code", ".claude/skills/"],
                ["cursor", "Cursor", ".cursor/rules/"],
                ["copilot", "Copilot", ".github/"],
              ].map(([target, label, dest]) => (
                <li key={target}>
                  <span className="font-medium">{label}</span>{" "}
                  <span className="text-muted-foreground">(van en {dest})</span>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {byTarget(target).map((file) => (
                      <a
                        key={file.url}
                        href={file.url}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {file.path.split("/").slice(-2).join("/")}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="faq" eyebrow="Dudas" title="Preguntas frecuentes">
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {item.q}
                  <span
                    aria-hidden
                    className="text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Esta página también está como guía:{" "}
          <Link
            className="text-primary hover:underline"
            href="/docs/crear-con-ia"
          >
            Crear con IA
          </Link>
          .
        </p>
      </Section>
    </IaProvider>
  );
}
