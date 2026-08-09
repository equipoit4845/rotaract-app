"use client";

import type { CreatePositionDefinitionRequest } from "@/lib/api";
import { useCreatePositionDefinition } from "@/lib/api";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  Textarea,
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";

import { useDistrictCandidates } from "../view-models/use-district-candidates";
import { describePositionMutationError } from "./position-mutation-errors";

type CreatePositionFormValues = {
  code: string;
  name: string;
  description: string;
  ownerOrganizationId: string;
  editPermissionCode: string;
  defaultRoleCode: string;
  isSingletonPerPeriod: boolean;
};

const DEFAULT_VALUES: CreatePositionFormValues = {
  code: "",
  name: "",
  description: "",
  ownerOrganizationId: "",
  editPermissionCode: "kernel.position.manage",
  defaultRoleCode: "",
  isSingletonPerPeriod: false,
};

function toCreateRequest(
  values: CreatePositionFormValues,
): CreatePositionDefinitionRequest {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    description: values.description.trim() || null,
    organizationType: "DISTRICT",
    ownerOrganizationId: values.ownerOrganizationId,
    editPermissionCode:
      values.editPermissionCode.trim() || "kernel.position.manage",
    defaultRoleCode: values.defaultRoleCode.trim() || null,
    isSingletonPerPeriod: values.isSingletonPerPeriod,
  };
}

/**
 * US-POS-02 — `/positions/new` only creates DISTRICT-scope configurable
 * cargos (kernel-spec.md §6.6.1: the district catalog is what a
 * `DISTRICT_RDR` administers; CLUB/OTHER positions aren't offered by this
 * form). `organizationType` is fixed to `"DISTRICT"`, never a user choice,
 * and `ownerOrganizationId` is required — an `ACTIVE` district, invariant
 * 6.6.1.1.
 */
export function CreatePositionForm() {
  const router = useRouter();
  const createPosition = useCreatePositionDefinition();
  const { candidates: districts, isLoading: isLoadingDistricts } =
    useDistrictCandidates();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreatePositionFormValues>({ defaultValues: DEFAULT_VALUES });

  const onSubmit = handleSubmit((values) => {
    createPosition.mutate(toCreateRequest(values), {
      onSuccess: (position) => {
        router.push(`/positions/${position.id}`);
      },
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
        label="Distrito propietario"
        htmlFor="ownerOrganizationId"
        required
        error={
          errors.ownerOrganizationId
            ? "Elegí el distrito propietario."
            : undefined
        }
        hint="El cargo sólo será utilizable en este distrito (invariante 6.6.1)."
      >
        <Controller
          control={control}
          name="ownerOrganizationId"
          rules={{ required: true }}
          render={({ field }) => (
            <Select
              id="ownerOrganizationId"
              {...field}
              disabled={isLoadingDistricts}
            >
              <option value="">Elegí un distrito</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </Select>
          )}
        />
      </FormField>

      <FormField
        label="Nombre"
        htmlFor="name"
        required
        error={errors.name ? "El nombre es obligatorio." : undefined}
      >
        <Input id="name" {...register("name", { required: true })} />
      </FormField>

      <FormField
        label="Código"
        htmlFor="code"
        required
        hint="Identificador único del cargo, por ejemplo CLUB_PRESIDENT."
        error={errors.code ? "El código es obligatorio." : undefined}
      >
        <Input id="code" {...register("code", { required: true })} />
      </FormField>

      <FormField label="Descripción" htmlFor="description">
        <Textarea id="description" rows={3} {...register("description")} />
      </FormField>

      <FormField
        label="Permiso de edición"
        htmlFor="editPermissionCode"
        required
        hint="Determina quién puede editar este cargo y sus permisos (invariante 6.6.1.3)."
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

      <FormField
        label="Rol técnico por defecto"
        htmlFor="defaultRoleCode"
        hint="Opcional. Si se completa, activar este cargo puede materializar una asignación de rol técnico."
      >
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
            Singleton por período (una sola asignación ACTIVE por
            organización/período)
          </label>
        )}
      />

      {createPosition.isError ? (
        <Alert
          tone="danger"
          title={describePositionMutationError(createPosition.error).title}
          description={
            describePositionMutationError(createPosition.error).description
          }
        />
      ) : null}

      <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/positions")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={createPosition.isPending}>
          {createPosition.isPending ? "Creando…" : "Crear cargo"}
        </Button>
      </div>
    </form>
  );
}
