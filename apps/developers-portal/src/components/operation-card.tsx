import { examplesFor } from "@/lib/examples";
import {
  exampleFor,
  schemaTree,
  type AuthKind,
  type Operation,
} from "@/lib/openapi";

import { CodeTabs } from "./code-tabs";
import { SchemaView } from "./schema-view";
import { TryPanel } from "./try-panel";

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-success/15 text-success",
  POST: "bg-primary/15 text-primary",
  PATCH: "bg-warning/20 text-warning-foreground",
  PUT: "bg-warning/20 text-warning-foreground",
  DELETE: "bg-destructive/15 text-destructive",
};

const AUTH_LABEL: Record<AuthKind, string> = {
  none: "Pública",
  user: "Token de sesión de Mi Rotaract",
  service: "Token de servicio de la app",
  client: "Credenciales de la app (client_id + secreto)",
  oidc: "Access token de una persona (emitido a tu app)",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex w-16 shrink-0 justify-center rounded-md px-2 py-0.5 font-mono text-xs font-bold ${METHOD_STYLE[method] ?? "bg-muted"}`}
    >
      {method}
    </span>
  );
}

function bodyExampleText(operation: Operation): string | undefined {
  if (!operation.requestBody?.schema) return undefined;
  const example = exampleFor(operation.requestBody.schema);
  if (operation.requestBody.contentType === "application/x-www-form-urlencoded")
    return new URLSearchParams(
      Object.entries((example as Record<string, unknown>) ?? {})
        .filter(([key]) => key !== "client_secret")
        .map(([key, value]) => [key, String(value)]),
    ).toString();
  return JSON.stringify(example, null, 2);
}

/** One operation of the reference: description, parameters, schemas, examples, "Probar". */
export function OperationCard({ operation }: { operation: Operation }) {
  const examples = examplesFor(operation);
  const parameters = operation.parameters.filter((p) => p.in !== "cookie");
  return (
    <section
      id={operation.operationId}
      className="scroll-mt-24 border-t border-border py-10 first:border-t-0"
    >
      <div className="flex flex-wrap items-center gap-3">
        <MethodBadge method={operation.method} />
        <code
          className={`font-mono text-sm break-all ${operation.deprecated ? "line-through decoration-destructive" : ""}`}
        >
          {operation.path}
        </code>
        {operation.deprecated ? (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
            Deprecada
            {operation.sunset ? ` · se retira el ${operation.sunset}` : ""}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-xl font-semibold">
        <a href={`#${operation.operationId}`} className="hover:underline">
          {operation.summary}
        </a>
      </h3>
      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6 text-sm">
          {operation.description ? (
            <p className="leading-6 text-muted-foreground">
              {operation.description}
            </p>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">operationId</dt>
            <dd>
              <code className="font-mono">{operation.operationId}</code>
            </dd>
            <dt className="text-muted-foreground">Autenticación</dt>
            <dd>
              {operation.auth.map((kind) => AUTH_LABEL[kind]).join(" o ")}
            </dd>
            {operation.permission ? (
              <>
                <dt className="text-muted-foreground">Permiso</dt>
                <dd>
                  <code className="font-mono">{operation.permission}</code>
                </dd>
              </>
            ) : null}
          </dl>

          {parameters.length ? (
            <div>
              <h4 className="mb-2 font-semibold">Parámetros</h4>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/60 text-xs">
                    <tr>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">En</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parameters.map((parameter) => (
                      <tr
                        key={`${parameter.in}-${parameter.name}`}
                        className="border-t border-border align-top"
                      >
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                          {parameter.name}
                          {parameter.required ? (
                            <span className="text-destructive"> *</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">{parameter.in}</td>
                        <td className="px-3 py-2 font-mono text-xs text-primary">
                          {schemaTree(parameter.schema ?? {}).type}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {parameter.description ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {operation.requestBody ? (
            <div>
              <h4 className="mb-2 font-semibold">
                Cuerpo{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {operation.requestBody.contentType}
                  {operation.requestBody.required ? "" : " · opcional"}
                </span>
              </h4>
              {operation.requestBody.schema ? (
                <SchemaView node={schemaTree(operation.requestBody.schema)} />
              ) : null}
            </div>
          ) : null}

          <div>
            <h4 className="mb-2 font-semibold">Respuestas</h4>
            <div className="space-y-2">
              {operation.responses.map((response) => (
                <details
                  key={response.status}
                  className="rounded-lg border border-border"
                >
                  <summary className="flex cursor-pointer items-center gap-3 px-3 py-2">
                    <code
                      className={`font-mono text-xs font-semibold ${
                        response.status.startsWith("2")
                          ? "text-success"
                          : response.status.startsWith("4") ||
                              response.status.startsWith("5")
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {response.status}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      {response.description}
                    </span>
                  </summary>
                  {response.schema ? (
                    <div className="px-3 pb-3">
                      <SchemaView node={schemaTree(response.schema)} />
                    </div>
                  ) : null}
                </details>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <CodeTabs
            tabs={examples}
            title={`Ejemplos de ${operation.operationId}`}
          />
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Probar esta operación
            </summary>
            <div className="mt-3">
              <TryPanel
                operation={{
                  operationId: operation.operationId,
                  method: operation.method,
                  path: operation.path,
                  auth: operation.auth,
                  parameters: operation.parameters.map(
                    ({ name, in: where, required }) => ({
                      name,
                      in: where,
                      required,
                    }),
                  ),
                  bodyContentType: operation.requestBody?.contentType,
                }}
                exampleBody={bodyExampleText(operation)}
              />
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
