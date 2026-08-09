"use client";

import type { InstitutionalPeriod, UpdatePeriodRequest } from "@/lib/api";
import { useCan, useUpdateDraftPeriod } from "@/lib/api";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormField,
  Input,
} from "@equipoit4845/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { canEditDraftPeriod } from "../adapters/period-lifecycle";
import {
  isValidPeriodEndDate,
  isValidPeriodStartDate,
} from "../utils/period-dates";
import { describePeriodDatesError } from "./period-mutation-errors";

type EditDraftPeriodFormValues = {
  name: string;
  startDate: string;
  endDate: string;
};

function toDefaultValues(
  period: InstitutionalPeriod,
): EditDraftPeriodFormValues {
  return {
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
  };
}

/** Exactly the `UpdatePeriodRequest` surface — `code`/`sequence` aren't part of this DTO. */
function toUpdateRequest(
  values: EditDraftPeriodFormValues,
): UpdatePeriodRequest {
  return {
    name: values.name.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
  };
}

/**
 * Only offered with `kernel.period.update` AND while the period is still
 * `DRAFT` (kernel-openapi.yaml `updateDraftPeriod`: 409 "El período no
 * está en DRAFT" otherwise) — gated both here and, redundantly but
 * cheaply, in `PeriodActionsRow`.
 */
export function EditDraftPeriodDialog({
  period,
}: {
  period: InstitutionalPeriod;
}) {
  const [open, setOpen] = useState(false);
  const update = useUpdateDraftPeriod();
  const canUpdate = useCan("kernel.period.update", {
    scopeType: "ORGANIZATION",
    scopeId: period.organizationId,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditDraftPeriodFormValues>({
    defaultValues: toDefaultValues(period),
  });

  if (!canUpdate || !canEditDraftPeriod(period.status)) return null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset(toDefaultValues(period));
      update.reset();
    }
  }

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { periodId: period.id, payload: toUpdateRequest(values) },
      { onSuccess: () => handleOpenChange(false) },
    );
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary">Editar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar borrador</DialogTitle>
          <DialogDescription>
            Sólo se puede editar un período mientras esté en borrador.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-3)",
          }}
        >
          <FormField
            label="Nombre"
            htmlFor="edit-name"
            required
            error={errors.name ? "El nombre es obligatorio." : undefined}
          >
            <Input id="edit-name" {...register("name", { required: true })} />
          </FormField>

          <div
            style={{
              display: "grid",
              gap: "var(--mr-space-3)",
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <FormField
              label="Fecha de inicio"
              htmlFor="edit-startDate"
              required
              hint="Debe ser 1 de julio."
              error={errors.startDate ? "Debe ser 1 de julio." : undefined}
            >
              <Input
                id="edit-startDate"
                type="date"
                {...register("startDate", {
                  required: true,
                  validate: (value) => isValidPeriodStartDate(value),
                })}
              />
            </FormField>
            <FormField
              label="Fecha de fin"
              htmlFor="edit-endDate"
              required
              hint="Debe ser 30 de junio del año siguiente."
              error={
                errors.endDate
                  ? "Debe ser 30 de junio del año siguiente."
                  : undefined
              }
            >
              <Input
                id="edit-endDate"
                type="date"
                {...register("endDate", {
                  required: true,
                  validate: (value, formValues) =>
                    isValidPeriodEndDate(formValues.startDate, value),
                })}
              />
            </FormField>
          </div>

          {update.isError ? (
            <Alert
              tone="danger"
              title={describePeriodDatesError(update.error).title}
              description={describePeriodDatesError(update.error).description}
            />
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
