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
} from "@/components/ui";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";

import { useDistrictCandidates } from "../view-models/use-district-candidates";
import { describePositionMutationError } from "./position-mutation-errors";

type CreatePositionFormValues = {
  name: string;
  description: string;
  ownerOrganizationId: string;
  isSingletonPerPeriod: boolean;
  grantsPermissions: boolean;
};

const DEFAULT_VALUES: CreatePositionFormValues = {
  name: "",
  description: "",
  ownerOrganizationId: "",
  isSingletonPerPeriod: false,
  grantsPermissions: true,
};

/**
 * The Kernel needs a stable unique code; people only ever see the name, so
 * it is derived from it ("Coordinación de imagen" -> DISTRICT_COORDINACION_DE_IMAGEN_X7K2)
 * with a short random suffix to avoid collisions.
 */
function codeFromName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DISTRICT_${slug || "CARGO"}_${suffix}`;
}

function toCreateRequest(
  values: CreatePositionFormValues,
): CreatePositionDefinitionRequest {
  return {
    code: codeFromName(values.name.trim()),
    name: values.name.trim(),
    description: values.description.trim() || null,
    organizationType: "DISTRICT",
    ownerOrganizationId: values.ownerOrganizationId,
    editPermissionCode: "kernel.position.manage",
    defaultRoleCode: null,
    isSingletonPerPeriod: values.isSingletonPerPeriod,
    // The kernel creates a role of the position's own, so its permissions
    // (including modules' ones) can be set right after.
    grantsPermissions: values.grantsPermissions,
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-[40rem]">
      <FormField
        label="Distrito"
        htmlFor="ownerOrganizationId"
        required
        error={errors.ownerOrganizationId ? "Elegí el distrito." : undefined}
        hint="El cargo va a estar disponible solo en este distrito."
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

      <Controller
        control={control}
        name="grantsPermissions"
        render={({ field }) => (
          <label className="flex items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            <span>
              Este cargo da permisos en la plataforma
              <span className="block text-sm text-muted-foreground">
                Después de crearlo vas a poder elegir qué puede hacer quien lo
                ocupe, incluidos los permisos de los módulos del distrito. Si lo
                desmarcás, el cargo es solo informativo.
              </span>
            </span>
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

      <div className="flex gap-2">
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
