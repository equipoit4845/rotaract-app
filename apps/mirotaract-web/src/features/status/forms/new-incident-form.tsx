"use client";

import type { StatusIncident } from "@/lib/api";
import { useCreateStatusIncident } from "@/lib/api";
import { FormSection } from "@/components/layout";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  FormFieldError,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  IMPACT_OPTIONS,
  localInputToIso,
  maintenanceWindowProblem,
} from "../utils/status-labels";

type Kind = StatusIncident["kind"];
type Errors = Partial<
  Record<"title" | "components" | "message" | "window", string>
>;

/**
 * Opens an incident (something is already failing) or announces a
 * maintenance (planned, at least 24 h ahead). The first message is what
 * developers read on developers.rotaract4845.com/estado.
 */
export function NewIncidentForm({
  kind,
  onCreated,
  onCancel,
}: {
  kind: Kind;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const create = useCreateStatusIncident();
  const [title, setTitle] = useState("");
  const [components, setComponents] = useState<Set<string>>(new Set());
  const [impact, setImpact] = useState<"MINOR" | "MAJOR" | "CRITICAL">("MAJOR");
  const [message, setMessage] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const isMaintenance = kind === "MAINTENANCE";

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!title.trim()) found.title = "Escribí un título corto.";
    if (components.size === 0) found.components = "Elegí al menos un servicio.";
    if (!message.trim())
      found.message =
        "Contá qué pasa (o qué se va a hacer) en una o dos frases.";
    const scheduledStart = localInputToIso(start);
    const scheduledEnd = localInputToIso(end);
    if (isMaintenance) {
      const problem = maintenanceWindowProblem(
        scheduledStart,
        scheduledEnd,
        new Date(),
      );
      if (problem) found.window = problem;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    create.mutate(
      {
        kind,
        title: title.trim(),
        components: [...components] as StatusIncident["components"],
        message: message.trim(),
        ...(isMaintenance ? { scheduledStart, scheduledEnd } : { impact }),
      },
      { onSuccess: () => onCreated() },
    );
  }

  const serverError = create.isError
    ? describeKernelError(create.error)
    : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormField
        label="Título"
        htmlFor="incident-title"
        required
        error={errors.title}
        hint={
          isMaintenance
            ? "Por ejemplo «Actualización de la base de datos»."
            : "Por ejemplo «No se puede iniciar sesión»."
        }
      >
        <Input
          id="incident-title"
          value={title}
          maxLength={140}
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormField>

      <FormSection
        title="Servicios afectados"
        description="Se marcan en la página pública de estado."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {COMPONENT_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-2">
              <Checkbox
                id={`incident-component-${key}`}
                checked={components.has(key)}
                onCheckedChange={(checked) =>
                  setComponents((current) => {
                    const next = new Set(current);
                    if (checked === true) next.add(key);
                    else next.delete(key);
                    return next;
                  })
                }
              />
              <label htmlFor={`incident-component-${key}`} className="text-sm">
                {COMPONENT_LABELS[key]}
              </label>
            </li>
          ))}
        </ul>
        {errors.components ? (
          <FormFieldError>{errors.components}</FormFieldError>
        ) : null}
      </FormSection>

      {isMaintenance ? (
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Empieza" htmlFor="incident-start" required>
            <Input
              id="incident-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </FormField>
          <FormField label="Termina" htmlFor="incident-end" required>
            <Input
              id="incident-end"
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </FormField>
          {errors.window ? (
            <FormFieldError className="md:col-span-2">
              {errors.window}
            </FormFieldError>
          ) : (
            <p className="text-xs text-muted-foreground md:col-span-2">
              Se anuncia con al menos 24 horas de anticipación y dura hasta 72
              horas. Empieza y termina solo en la página de estado.
            </p>
          )}
        </div>
      ) : (
        <FormField
          label="Impacto"
          htmlFor="incident-impact"
          hint={IMPACT_OPTIONS.find((o) => o.value === impact)?.hint}
        >
          <Select
            id="incident-impact"
            value={impact}
            onChange={(e) => setImpact(e.target.value as typeof impact)}
          >
            {IMPACT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <FormField
        label="Mensaje público"
        htmlFor="incident-message"
        required
        error={errors.message}
        hint="Lo leen los equipos que usan el kernel. Sin datos personales."
      >
        <Textarea
          id="incident-message"
          value={message}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
        />
      </FormField>

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
        <Button type="submit" disabled={create.isPending}>
          {create.isPending
            ? "Publicando…"
            : isMaintenance
              ? "Anunciar mantenimiento"
              : "Publicar incidente"}
        </Button>
      </div>
    </form>
  );
}
