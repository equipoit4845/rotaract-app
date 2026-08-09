"use client";

import type { CreatePeriodRequest } from "@/lib/api";
import { useCreatePeriod } from "@/lib/api";
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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  isValidPeriodEndDate,
  isValidPeriodStartDate,
} from "../utils/period-dates";
import { describePeriodDatesError } from "./period-mutation-errors";

type CreatePeriodFormValues = {
  code: string;
  name: string;
  sequence: string;
  startDate: string;
  endDate: string;
};

const DEFAULT_VALUES: CreatePeriodFormValues = {
  code: "",
  name: "",
  sequence: "",
  startDate: "",
  endDate: "",
};

function toCreateRequest(values: CreatePeriodFormValues): CreatePeriodRequest {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    sequence: Number(values.sequence),
    startDate: values.startDate,
    endDate: values.endDate,
  };
}

/**
 * `CreatePeriodRequest` requires `organizationId` as a path param, not a
 * body field (kernel-openapi.yaml `POST /organizations/{id}/periods`) —
 * that's why this dialog takes `organizationId` as a prop instead of a
 * form field, always the organization the list page is scoped to.
 */
export function CreatePeriodDialog({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const createPeriod = useCreatePeriod();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePeriodFormValues>({ defaultValues: DEFAULT_VALUES });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset(DEFAULT_VALUES);
      createPeriod.reset();
    }
  }

  const onSubmit = handleSubmit((values) => {
    createPeriod.mutate(
      { organizationId, payload: toCreateRequest(values) },
      {
        onSuccess: (period) => {
          handleOpenChange(false);
          router.push(`/periods/${period.id}`);
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Crear período</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear período</DialogTitle>
          <DialogDescription>
            Da de alta un período institucional en borrador.
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
            htmlFor="name"
            required
            error={errors.name ? "El nombre es obligatorio." : undefined}
          >
            <Input id="name" {...register("name", { required: true })} />
          </FormField>

          <div
            style={{
              display: "grid",
              gap: "var(--mr-space-3)",
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <FormField
              label="Código"
              htmlFor="code"
              required
              error={errors.code ? "El código es obligatorio." : undefined}
            >
              <Input id="code" {...register("code", { required: true })} />
            </FormField>
            <FormField
              label="Secuencia"
              htmlFor="sequence"
              required
              hint="Orden del período (número entero)."
              error={
                errors.sequence
                  ? "Ingresá un número entero para la secuencia."
                  : undefined
              }
            >
              <Input
                id="sequence"
                inputMode="numeric"
                {...register("sequence", {
                  required: true,
                  pattern: /^[0-9]+$/,
                })}
              />
            </FormField>
          </div>

          <div
            style={{
              display: "grid",
              gap: "var(--mr-space-3)",
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <FormField
              label="Fecha de inicio"
              htmlFor="startDate"
              required
              hint="Debe ser 1 de julio."
              error={errors.startDate ? "Debe ser 1 de julio." : undefined}
            >
              <Input
                id="startDate"
                type="date"
                {...register("startDate", {
                  required: true,
                  validate: (value) => isValidPeriodStartDate(value),
                })}
              />
            </FormField>
            <FormField
              label="Fecha de fin"
              htmlFor="endDate"
              required
              hint="Debe ser 30 de junio del año siguiente."
              error={
                errors.endDate
                  ? "Debe ser 30 de junio del año siguiente."
                  : undefined
              }
            >
              <Input
                id="endDate"
                type="date"
                {...register("endDate", {
                  required: true,
                  validate: (value, formValues) =>
                    isValidPeriodEndDate(formValues.startDate, value),
                })}
              />
            </FormField>
          </div>

          {createPeriod.isError ? (
            <Alert
              tone="danger"
              title={describePeriodDatesError(createPeriod.error).title}
              description={
                describePeriodDatesError(createPeriod.error).description
              }
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
            <Button type="submit" disabled={createPeriod.isPending}>
              {createPeriod.isPending ? "Creando…" : "Crear período"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
