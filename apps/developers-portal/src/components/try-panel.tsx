"use client";

import { FlaskConical, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  INTERESTING_HEADERS,
  buildRequest,
  isProductionBaseUrl,
  needsConfirmation,
  validateBaseUrl,
  type TryOperation,
} from "@/lib/try-request";

const LOCAL_API = "http://localhost:54321/api/kernel/v1";

type Connection = {
  baseUrl: string;
  token: string;
  clientId: string;
  clientSecret: string;
};

const TryContext = createContext<{
  connection: Connection;
  setConnection: (update: Partial<Connection>) => void;
} | null>(null);

/**
 * Holds the base URL and credentials for every "Probar" panel. React state
 * only: never localStorage, cookies or the URL, so a reload forgets them.
 */
export function TryProvider({ children }: { children: ReactNode }) {
  const [connection, setState] = useState<Connection>({
    baseUrl: LOCAL_API,
    token: "",
    clientId: "",
    clientSecret: "",
  });
  const value = useMemo(
    () => ({
      connection,
      setConnection: (update: Partial<Connection>) =>
        setState((current) => ({ ...current, ...update })),
    }),
    [connection],
  );
  return <TryContext.Provider value={value}>{children}</TryContext.Provider>;
}

function useConnection() {
  const context = useContext(TryContext);
  if (!context) throw new Error("TryProvider missing");
  return context;
}

const input =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Where requests go and with which credentials (top of the reference). */
export function ConnectionBar() {
  const { connection, setConnection } = useConnection();
  const problem = validateBaseUrl(connection.baseUrl);
  const remote = !problem && needsConfirmation(connection.baseUrl);
  return (
    <section
      aria-labelledby="probar-config"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical className="size-4 text-primary" aria-hidden />
        <h2 id="probar-config" className="text-sm font-semibold">
          Probar desde el navegador
        </h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">URL base del kernel</span>
          <input
            className={`${input} font-mono`}
            value={connection.baseUrl}
            onChange={(event) => setConnection({ baseUrl: event.target.value })}
            spellCheck={false}
          />
          <span className="text-xs text-muted-foreground">
            Por defecto, el kernel local de <code>mirotaract dev up</code>.{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setConnection({ baseUrl: LOCAL_API })}
            >
              Volver al local
            </button>
          </span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Token (Bearer)</span>
          <span className="flex gap-2">
            <input
              className={`${input} font-mono`}
              type="password"
              autoComplete="off"
              placeholder="Pegá un token de servicio o de sesión"
              value={connection.token}
              onChange={(event) => setConnection({ token: event.target.value })}
            />
            <button
              type="button"
              aria-label="Olvidar token y credenciales"
              title="Olvidar token y credenciales"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-border hover:bg-muted"
              onClick={() =>
                setConnection({ token: "", clientId: "", clientSecret: "" })
              }
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </span>
          <span className="flex items-start gap-1 text-xs text-muted-foreground">
            <KeyRound className="mt-0.5 size-3 shrink-0" aria-hidden />
            Solo en la memoria de esta pestaña: no se guarda y solo viaja a la
            URL de arriba. Al recargar, se borra.
          </span>
        </label>
      </div>
      {problem ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {problem}
        </p>
      ) : remote ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {isProductionBaseUrl(connection.baseUrl)
            ? "Esta URL es PRODUCCIÓN: los pedidos operan sobre datos reales. Cada envío te va a pedir confirmación."
            : "Esta URL no es un kernel local. Cada envío te va a pedir confirmación."}
        </p>
      ) : null}
    </section>
  );
}

type Result = {
  status: number;
  statusText: string;
  ms: number;
  headers: Array<[string, string]>;
  body: string;
};

/** The "Probar" form of one operation. */
export function TryPanel({
  operation,
  exampleBody,
}: {
  operation: TryOperation & { operationId: string };
  exampleBody?: string;
}) {
  const { connection, setConnection } = useConnection();
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [body, setBody] = useState(exampleBody ?? "");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pathParams = operation.parameters.filter((p) => p.in === "path");
  const queryParams = operation.parameters.filter((p) => p.in === "query");
  const usesClient = operation.auth.includes("client");
  const baseProblem = validateBaseUrl(connection.baseUrl);

  async function send(confirmed: boolean) {
    setError(null);
    if (baseProblem) return setError(baseProblem);
    const built = buildRequest(operation, {
      baseUrl: connection.baseUrl,
      token: connection.token,
      clientId: connection.clientId,
      clientSecret: connection.clientSecret,
      pathValues,
      queryValues,
      body,
      correlationId: `portal-${Date.now().toString(36)}`,
    });
    if (built.missing.length)
      return setError(`Falta completar: ${built.missing.join(", ")}`);
    // Never a real (non-local) request without an explicit confirmation.
    if (needsConfirmation(connection.baseUrl) && !confirmed)
      return setConfirming(true);
    setConfirming(false);
    setPending(true);
    const started = performance.now();
    try {
      const response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        body: built.body,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      const text = await response.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON */
      }
      setResult({
        status: response.status,
        statusText: response.statusText,
        ms: Math.round(performance.now() - started),
        headers: INTERESTING_HEADERS.flatMap((name) => {
          const value = response.headers.get(name);
          return value ? [[name, value] as [string, string]] : [];
        }),
        body: pretty,
      });
    } catch {
      setResult(null);
      setError(
        "No hubo respuesta. ¿Está corriendo el kernel y permite este origen (CORS)? El kernel local de mirotaract dev up acepta http://localhost:3004 y https://developers.rotaract4845.com.",
      );
    } finally {
      setPending(false);
    }
  }

  const traceId = result?.headers.find(([name]) => name === "x-trace-id")?.[1];
  const production = isProductionBaseUrl(connection.baseUrl);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
      {pathParams.length + queryParams.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {pathParams.map((parameter) => (
            <label key={`p-${parameter.name}`} className="grid gap-1">
              <span className="font-mono text-xs">
                {parameter.name} <span className="text-destructive">*</span>
              </span>
              <input
                className={`${input} font-mono`}
                value={pathValues[parameter.name] ?? ""}
                onChange={(event) =>
                  setPathValues((current) => ({
                    ...current,
                    [parameter.name]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          {queryParams.map((parameter) => (
            <label key={`q-${parameter.name}`} className="grid gap-1">
              <span className="font-mono text-xs">
                ?{parameter.name}
                {parameter.required ? (
                  <span className="text-destructive"> *</span>
                ) : null}
              </span>
              <input
                className={`${input} font-mono`}
                value={queryValues[parameter.name] ?? ""}
                onChange={(event) =>
                  setQueryValues((current) => ({
                    ...current,
                    [parameter.name]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
      ) : null}
      {usesClient ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="font-mono text-xs">client_id</span>
            <input
              className={`${input} font-mono`}
              autoComplete="off"
              value={connection.clientId}
              onChange={(event) =>
                setConnection({ clientId: event.target.value })
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="font-mono text-xs">client_secret</span>
            <input
              className={`${input} font-mono`}
              type="password"
              autoComplete="off"
              value={connection.clientSecret}
              onChange={(event) =>
                setConnection({ clientSecret: event.target.value })
              }
            />
          </label>
        </div>
      ) : null}
      {operation.method !== "GET" && operation.method !== "DELETE" ? (
        <label className="grid gap-1">
          <span className="text-xs font-medium">
            Cuerpo ({operation.bodyContentType ?? "application/json"})
          </span>
          <textarea
            className="min-h-28 w-full rounded-lg border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={body}
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
      ) : null}

      {confirming ? (
        <div
          role="alertdialog"
          aria-labelledby={`confirm-${operation.operationId}`}
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3"
        >
          <p id={`confirm-${operation.operationId}`} className="font-medium">
            {production
              ? "Vas a mandar un pedido a PRODUCCIÓN."
              : "Vas a mandar un pedido a un kernel que no es local."}
          </p>
          <p className="mt-1 text-xs">
            {operation.method === "GET"
              ? "Va a leer datos reales con el token que pegaste."
              : `Es un ${operation.method}: puede crear o cambiar datos reales.`}{" "}
            Destino: <code className="font-mono">{connection.baseUrl}</code>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="h-8 rounded-lg bg-destructive px-3 text-xs font-medium text-white"
              onClick={() => void send(true)}
            >
              Sí, enviar a {new URL(connection.baseUrl).host}
            </button>
            <button
              type="button"
              className="h-8 rounded-lg border border-border bg-background px-3 text-xs"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => void send(false)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Enviando…" : `Enviar ${operation.method}`}
        </button>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {connection.baseUrl.replace(/\/+$/, "")}
          {operation.path}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="space-y-2" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
                result.status < 300
                  ? "bg-success/15 text-success"
                  : result.status < 500
                    ? "bg-warning/20 text-warning-foreground"
                    : "bg-destructive/15 text-destructive"
              }`}
            >
              {result.status} {result.statusText}
            </span>
            <span className="text-xs text-muted-foreground">
              {result.ms} ms
            </span>
            {traceId ? (
              <span className="text-xs text-muted-foreground">
                traceId <code className="font-mono">{traceId}</code> (buscalo en
                la pestaña Registros de tu app)
              </span>
            ) : null}
          </p>
          {result.headers.length ? (
            <ul className="font-mono text-xs text-muted-foreground">
              {result.headers.map(([name, value]) => (
                <li key={name}>
                  {name}: {value}
                </li>
              ))}
            </ul>
          ) : null}
          <pre className="max-h-96 overflow-auto rounded-lg bg-code p-3 font-mono text-xs text-code-foreground">
            {result.body || "(sin cuerpo)"}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
