"use client";

import type { StatusIncident, StatusIncidentState } from "@/lib/api";
import { useAddStatusIncidentUpdate } from "@/lib/api";
import { Alert, Button, FormField, Select, Textarea } from "@/components/ui";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { nextStates, stateLabel } from "../utils/status-labels";

/** Publishes an update on an open incident or maintenance. */
export function IncidentUpdateForm({
  incident,
  onDone,
  onCancel,
}: {
  incident: StatusIncident;
  onDone: () => void;
  onCancel: () => void;
}) {
  const add = useAddStatusIncidentUpdate();
  const options = nextStates(incident);
  const [state, setState] = useState<StatusIncidentState>(incident.state);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) {
      setError("Escribí la actualización.");
      return;
    }
    setError(undefined);
    add.mutate(
      { incidentId: incident.id, payload: { state, message: message.trim() } },
      { onSuccess: () => onDone() },
    );
  }

  const serverError = add.isError ? describeKernelError(add.error) : undefined;
  const closing = ["RESOLVED", "COMPLETED", "CANCELLED"].includes(state);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField
        label="Estado"
        htmlFor={`update-state-${incident.id}`}
        hint={
          closing
            ? "Queda cerrado: si vuelve a fallar, abrí un incidente nuevo."
            : undefined
        }
      >
        <Select
          id={`update-state-${incident.id}`}
          value={state}
          onChange={(e) => setState(e.target.value as StatusIncidentState)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {stateLabel(option).label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        label="Actualización pública"
        htmlFor={`update-message-${incident.id}`}
        required
        error={error}
      >
        <Textarea
          id={`update-message-${incident.id}`}
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
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? "Publicando…" : "Publicar"}
        </Button>
      </div>
    </form>
  );
}
