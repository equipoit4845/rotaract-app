"use client";

import type {
  PositionDefinition,
  UpdatePositionDefinitionRequest,
} from "@/lib/api";
import { useUpdatePositionDefinition } from "@/lib/api";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Textarea,
} from "@/components/ui";
import { Controller, useForm } from "react-hook-form";

import { describePositionMutationError } from "./position-mutation-errors";

type EditPositionFormValues = {
  name: string;
  description: string;
  isSingletonPerPeriod: boolean;
};

function toDefaultValues(position: PositionDefinition): EditPositionFormValues {
  return {
    name: position.name,
    description: position.description ?? "",
    isSingletonPerPeriod: position.isSingletonPerPeriod,
  };
}

function toUpdateRequest(
  values: EditPositionFormValues,
): UpdatePositionDefinitionRequest {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    isSingletonPerPeriod: values.isSingletonPerPeriod,
  };
}

/** Name, description and the one-per-period rule. What the position allows is edited in `PositionPermissionsPanel`; who may edit is enforced by the caller (`PositionDetailContainer`). */
export function EditPositionForm({
  position,
}: {
  position: PositionDefinition;
}) {
  const update = useUpdatePositionDefinition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EditPositionFormValues>({
    defaultValues: toDefaultValues(position),
  });

  const onSubmit = handleSubmit((values) => {
    update.mutate({
      positionDefinitionId: position.id,
      payload: toUpdateRequest(values),
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-[40rem]">
      <FormField
        label="Nombre"
        htmlFor="name"
        required
        error={errors.name ? "El nombre es obligatorio." : undefined}
      >
        <Input id="name" {...register("name", { required: true })} />
      </FormField>

      <FormField label="Descripción" htmlFor="description">
        <Textarea id="description" rows={3} {...register("description")} />
      </FormField>

      <Controller
        control={control}
        name="isSingletonPerPeriod"
        render={({ field }) => (
          <label className="flex items-center gap-2">
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            Solo una persona puede ocuparlo por período
          </label>
        )}
      />

      {update.isError ? (
        <Alert
          tone="danger"
          title={describePositionMutationError(update.error).title}
          description={describePositionMutationError(update.error).description}
        />
      ) : null}

      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
