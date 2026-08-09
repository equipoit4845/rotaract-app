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
} from "@equipoit4845/ui";
import { Controller, useForm } from "react-hook-form";

import { describePositionMutationError } from "./position-mutation-errors";

type EditPositionFormValues = {
  name: string;
  description: string;
  editPermissionCode: string;
  defaultRoleCode: string;
  isSingletonPerPeriod: boolean;
};

function toDefaultValues(position: PositionDefinition): EditPositionFormValues {
  return {
    name: position.name,
    description: position.description ?? "",
    editPermissionCode: position.editPermissionCode,
    defaultRoleCode: position.defaultRoleCode ?? "",
    isSingletonPerPeriod: position.isSingletonPerPeriod,
  };
}

function toUpdateRequest(
  values: EditPositionFormValues,
): UpdatePositionDefinitionRequest {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    editPermissionCode: values.editPermissionCode.trim() || undefined,
    defaultRoleCode: values.defaultRoleCode.trim() || null,
    isSingletonPerPeriod: values.isSingletonPerPeriod,
  };
}

/** CA-POS-03 (`kernel-spec.md` §6.6.1.3): editing requires `position.editPermissionCode`, evaluated on `ownerOrganizationId` — enforced by the caller (`PositionDetailContainer`), this form only submits. */
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
    <form
      onSubmit={onSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--mr-space-3)",
        maxWidth: "40rem",
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

      <FormField label="Descripción" htmlFor="description">
        <Textarea id="description" rows={3} {...register("description")} />
      </FormField>

      <FormField
        label="Permiso de edición"
        htmlFor="editPermissionCode"
        required
        error={
          errors.editPermissionCode
            ? "El permiso de edición es obligatorio."
            : undefined
        }
      >
        <Input
          id="editPermissionCode"
          {...register("editPermissionCode", { required: true })}
        />
      </FormField>

      <FormField label="Rol técnico por defecto" htmlFor="defaultRoleCode">
        <Input id="defaultRoleCode" {...register("defaultRoleCode")} />
      </FormField>

      <Controller
        control={control}
        name="isSingletonPerPeriod"
        render={({ field }) => (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--mr-space-2)",
            }}
          >
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            Singleton por período
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
