"use client";

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ASSISTANT_IDS,
  ASSISTANTS,
  promptFileName,
  renderPrompt,
  type Assistant,
} from "@/generated/master-prompt";
import type { Idea } from "@/lib/ia";

/**
 * Client side of /ia: the form, the example ideas and the master prompt are
 * assembled here, in the browser, with the same renderer as /ia/prompt.md
 * (packages/ai-skills/src/master-prompt.js). Nothing is sent anywhere; the
 * draft is kept in this browser's storage only as a convenience.
 */

type Fields = {
  idea: string;
  users: string;
  data: string;
  scope: "" | "club" | "distrito";
  template: "" | "next" | "fastapi";
};

const EMPTY: Fields = {
  idea: "",
  users: "",
  data: "",
  scope: "",
  template: "",
};
const STORAGE_KEY = "mr-ia-draft";

type State = {
  fields: Fields;
  setFields: (next: Fields) => void;
  assistant: Assistant;
  setAssistant: (next: Assistant) => void;
  chosenIdea: string | null;
  pickIdea: (idea: Idea) => void;
};

const IaContext = createContext<State | null>(null);

function useIa(): State {
  const state = useContext(IaContext);
  if (!state) throw new Error("IaProvider missing");
  return state;
}

export function IaProvider({ children }: { children: ReactNode }) {
  const [fields, setFieldsState] = useState<Fields>(EMPTY);
  const [assistant, setAssistantState] = useState<Assistant>("claude");
  const [chosenIdea, setChosenIdea] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.fields) setFieldsState({ ...EMPTY, ...saved.fields });
      if (ASSISTANT_IDS.includes(saved?.assistant))
        setAssistantState(saved.assistant);
    } catch {
      /* storage unavailable: start empty */
    }
  }, []);

  function persist(nextFields: Fields, nextAssistant: Assistant) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ fields: nextFields, assistant: nextAssistant }),
      );
    } catch {
      /* storage unavailable: the page still works */
    }
  }

  const state: State = {
    fields,
    setFields(next) {
      setFieldsState(next);
      setChosenIdea(null);
      persist(next, assistant);
    },
    assistant,
    setAssistant(next) {
      setAssistantState(next);
      persist(fields, next);
    },
    chosenIdea,
    pickIdea(idea) {
      const next: Fields = {
        idea: idea.idea,
        users: idea.users,
        data: idea.data,
        scope: idea.scope,
        template: idea.template,
      };
      setFieldsState(next);
      setChosenIdea(idea.id);
      persist(next, assistant);
      document
        .getElementById("describi-tu-idea")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };
  return <IaContext.Provider value={state}>{children}</IaContext.Provider>;
}

const TEMPLATE_LABEL = { next: "Next.js", fastapi: "Python" } as const;
const SCOPE_LABEL = { club: "Club", distrito: "Distrito" } as const;

export function IdeaCards({ ideas }: { ideas: Idea[] }) {
  const { pickIdea, chosenIdea } = useIa();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ideas.map((idea) => {
        const chosen = chosenIdea === idea.id;
        return (
          <article
            key={idea.id}
            className={`flex flex-col rounded-xl border bg-card p-5 transition-colors ${
              chosen ? "border-primary ring-2 ring-primary/20" : "border-border"
            }`}
          >
            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                {SCOPE_LABEL[idea.scope]}
              </span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                {TEMPLATE_LABEL[idea.template]}
              </span>
            </div>
            <h3 className="font-semibold">{idea.title}</h3>
            <p className="mt-1.5 flex-1 text-sm text-muted-foreground">
              {idea.summary}
            </p>
            <button
              type="button"
              onClick={() => pickIdea(idea)}
              className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            >
              {chosen ? (
                <>
                  <Check className="size-4" aria-hidden /> Idea elegida
                </>
              ) : (
                <>
                  <Lightbulb className="size-4" aria-hidden /> Usar esta idea
                </>
              )}
            </button>
          </article>
        );
      })}
    </div>
  );
}

/** "Abrir en Claude": a planning prompt for chat assistants (they can't build). */
export function PlanningLink({ planning }: { planning: string }) {
  const { fields } = useIa();
  const href = useMemo(
    () =>
      `https://claude.ai/new?q=${encodeURIComponent(renderPrompt(planning, fields))}`,
    [planning, fields],
  );
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
    >
      Abrir en Claude para planificar
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20";

export function IdeaForm() {
  const { fields, setFields } = useIa();
  const set = (key: keyof Fields) => (value: string) =>
    setFields({ ...fields, [key]: value });
  return (
    <form
      className="grid gap-5 rounded-xl border border-border bg-card p-5 md:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        document
          .getElementById("el-prompt")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <label className="block text-sm font-medium">
        ¿Qué querés construir?
        <textarea
          rows={3}
          value={fields.idea}
          onChange={(e) => set("idea")(e.target.value)}
          placeholder="Por ejemplo: una app para que los socios se anoten a las jornadas de servicio y el club vea quién viene."
          className={inputClass}
        />
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium">
          ¿Quién la va a usar?
          <textarea
            rows={2}
            value={fields.users}
            onChange={(e) => set("users")(e.target.value)}
            placeholder="Socias y socios del club; la secretaría arma las jornadas."
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium">
          ¿Qué datos necesita?
          <textarea
            rows={2}
            value={fields.data}
            onChange={(e) => set("data")(e.target.value)}
            placeholder="El padrón del club (de Mi Rotaract) y las jornadas, que guarda la app."
            className={inputClass}
          />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">¿Para quién es?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["club", "Para un club (o cada club con lo suyo)"],
              ["distrito", "Para todo el distrito"],
              ["", "Todavía no sé"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value || "nose"}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                fields.scope === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="scope"
                value={value}
                checked={fields.scope === value}
                onChange={() => set("scope")(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Sparkles className="size-4" aria-hidden /> Ver mi prompt
        </button>
        <button
          type="button"
          onClick={() => setFields(EMPTY)}
          className="h-10 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          Empezar de cero
        </button>
        <p className="text-xs text-muted-foreground">
          Todo queda en tu navegador: esta página no manda nada a ningún lado.
        </p>
      </div>
    </form>
  );
}

export function PromptPanel({ master }: { master: string }) {
  const { fields, assistant, setAssistant } = useIa();
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);
  const prompt = useMemo(
    () => renderPrompt(master, { ...fields, assistant }),
    [master, fields, assistant],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  function download() {
    const blob = new Blob([prompt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = promptFileName({ assistant });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        role="tablist"
        aria-label="Tu asistente"
        className="flex gap-1 overflow-x-auto border-b border-border bg-muted/40 p-1.5"
      >
        {ASSISTANT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={assistant === id}
            onClick={() => setAssistant(id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              assistant === id
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {ASSISTANTS[id].label}
            {ASSISTANTS[id].recommended ? (
              <span className="ml-1.5 rounded bg-primary/10 px-1 text-[11px] font-medium text-primary">
                recomendado
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90 sm:flex-none"
        >
          {copied === "ok" ? (
            <>
              <Check className="size-5" aria-hidden /> ¡Copiado! Pegalo en tu
              asistente
            </>
          ) : (
            <>
              <Copy className="size-5" aria-hidden /> Copiar el prompt
            </>
          )}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Download className="size-4" aria-hidden /> Descargar como archivo
        </button>
        <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-56">
          {copied === "error"
            ? "Tu navegador no dejó copiar. Descargalo como archivo y pegale el contenido a tu asistente."
            : `${prompt.split("\n").length} líneas · se actualiza mientras escribís`}
        </p>
      </div>
      <pre
        tabIndex={0}
        aria-label="Prompt para tu asistente"
        className="max-h-[28rem] overflow-auto border-t border-border bg-code p-4 font-mono text-[12.5px] leading-6 whitespace-pre-wrap text-code-foreground"
      >
        {prompt}
      </pre>
    </div>
  );
}
