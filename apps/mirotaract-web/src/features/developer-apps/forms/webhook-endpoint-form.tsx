"use client";

import type {
  DeveloperApp,
  EventCatalogEntry,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "@/lib/api";
import { useCreateWebhookEndpoint, useUpdateWebhookEndpoint } from "@/lib/api";
import { FormSection } from "@/components/layout";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  FormFieldError,
  Input,
} from "@/components/ui";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { toggleInSet } from "../components/data-choices";
import { dataLabel } from "../utils/app-catalog";
import { webhookUrlProblem } from "../utils/webhook-labels";

type Errors = Partial<Record<"url" | "events", string>>;

/**
 * Creates an endpoint (and hands its secret to `onCreated`, once) or edits
 * one. Events the app has no permission for are shown but disabled, with
 * the permission it would need.
 */
export function WebhookEndpointForm({
  app,
  events,
  endpoint,
  onCreated,
  onSaved,
  onCancel,
}: {
  app: DeveloperApp;
  events: EventCatalogEntry[];
  endpoint?: WebhookEndpoint;
  onCreated?: (created: WebhookEndpointWithSecret) => void;
  onSaved?: () => void;
  onCancel: () => void;
}) {
  const create = useCreateWebhookEndpoint();
  const update = useUpdateWebhookEndpoint();
  const mutation = endpoint ? update : create;
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [description, setDescription] = useState(endpoint?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(endpoint?.eventTypes ?? []),
  );
  const [errors, setErrors] = useState<Errors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    const urlProblem = webhookUrlProblem(url);
    if (urlProblem) found.url = urlProblem;
    if (selected.size === 0) found.events = "Elegí al menos un aviso.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const payload = {
      url: url.trim(),
      description: description.trim() || null,
      eventTypes: [...selected],
    };
    if (endpoint)
      update.mutate(
        { appId: app.id, endpointId: endpoint.id, payload },
        { onSuccess: () => onSaved?.() },
      );
    else
      create.mutate(
        { appId: app.id, payload },
        { onSuccess: (created) => onCreated?.(created) },
      );
  }

  const serverError = mutation.isError
    ? describeKernelError(mutation.error)
    : undefined;
  const idPrefix = endpoint ? `webhook-${endpoint.id}` : "webhook-new";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Dirección que recibe los avisos"
          htmlFor={`${idPrefix}-url`}
          required
          error={errors.url}
          hint="La dirección de tu servidor, por ejemplo https://miapp.org/api/webhooks. Tiene que empezar con https://."
        >
          <Input
            id={`${idPrefix}-url`}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
          />
        </FormField>
        <FormField
          label="Descripción (opcional)"
          htmlFor={`${idPrefix}-description`}
          hint="Para reconocerlo, por ejemplo «Servidor de producción»."
        >
          <Input
            id={`${idPrefix}-description`}
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
      </div>

      <FormSection
        title="Qué avisos querés recibir"
        description="Solo llegan avisos de las organizaciones de esta app, y solo de los datos que la app tiene permiso para leer."
      >
        <ul className="space-y-3">
          {events.map((item, index) => {
            const id = `${idPrefix}-event-${index}`;
            const allowed = !item.scope || app.scopes.includes(item.scope);
            return (
              <li key={item.type} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={selected.has(item.type)}
                  disabled={!allowed}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      toggleInSet(current, item.type, checked === true),
                    )
                  }
                />
                <label htmlFor={id} className="text-sm leading-5">
                  <span className="font-medium">{item.title}</span>
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {item.type}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {allowed
                      ? item.description
                      : `Para recibirlo, la app necesita el permiso «${dataLabel(item.scope ?? "")}».`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {errors.events ? (
          <FormFieldError>{errors.events}</FormFieldError>
        ) : null}
      </FormSection>

      {serverError ? (
        <Alert
          tone="danger"
          title={serverError.title}
          description={serverError.description}
        />
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? "Guardando…"
            : endpoint
              ? "Guardar cambios"
              : "Agregar endpoint"}
        </Button>
      </div>
    </form>
  );
}
