"use client";

import type { CreateOrganizationRequest, OrganizationType } from "@/lib/api";
import { useCreateOrganization } from "@/lib/api";
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
  Select,
  Textarea,
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { describeOrganizationMutationError } from "./organization-mutation-errors";
import { useParentCandidates } from "./use-parent-candidates";

type CreateOrganizationFormValues = {
  type: OrganizationType;
  name: string;
  code: string;
  slug: string;
  parentId: string;
  countryCode: string;
  region: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
};

const DEFAULT_VALUES: CreateOrganizationFormValues = {
  type: "CLUB",
  name: "",
  code: "",
  slug: "",
  parentId: "",
  countryCode: "",
  region: "",
  city: "",
  contactEmail: "",
  contactPhone: "",
  description: "",
};

function toCreateRequest(
  values: CreateOrganizationFormValues,
): CreateOrganizationRequest {
  return {
    type: values.type,
    name: values.name.trim(),
    code: values.code.trim(),
    slug: values.slug.trim(),
    parentId: values.parentId || null,
    countryCode: values.countryCode.trim() || null,
    region: values.region.trim() || null,
    city: values.city.trim() || null,
    contactEmail: values.contactEmail.trim() || null,
    contactPhone: values.contactPhone.trim() || null,
    description: values.description.trim() || null,
  };
}

/**
 * `CreateOrganizationRequest` requires a `parentId` in practice for `CLUB`
 * (invariant 6.3.3: a club must have a `DISTRICT` ancestor) — the form
 * mirrors that instead of letting the Kernel reject an obviously-invalid
 * submission, while still leaving the Kernel as the final authority for
 * anything subtler (invalid parent, cycle, scope).
 */
export function CreateOrganizationDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const createOrganization = useCreateOrganization();
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateOrganizationFormValues>({ defaultValues: DEFAULT_VALUES });

  const type = watch("type");
  const { candidates: districtCandidates, isLoading: isLoadingDistricts } =
    useParentCandidates("DISTRICT");
  const { candidates: anyCandidates } = useParentCandidates();

  const parentCandidates = type === "CLUB" ? districtCandidates : anyCandidates;
  const parentRequired = type === "CLUB";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset(DEFAULT_VALUES);
      createOrganization.reset();
    }
  }

  const onSubmit = handleSubmit((values) => {
    createOrganization.mutate(toCreateRequest(values), {
      onSuccess: (organization) => {
        handleOpenChange(false);
        router.push(`/organizations/${organization.id}`);
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Crear organización</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear organización</DialogTitle>
          <DialogDescription>
            Da de alta un distrito, club u otra organización institucional.
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
          <FormField label="Tipo" htmlFor="type" required>
            <Select id="type" {...register("type", { required: true })}>
              <option value="DISTRICT">Distrito</option>
              <option value="CLUB">Club</option>
              <option value="OTHER">Otra</option>
            </Select>
          </FormField>

          {type !== "DISTRICT" ? (
            <FormField
              label="Organización padre"
              htmlFor="parentId"
              required={parentRequired}
              error={
                errors.parentId ? "Elegí una organización padre." : undefined
              }
              hint={
                type === "CLUB"
                  ? "Un club debe pertenecer a un distrito."
                  : undefined
              }
            >
              <Controller
                control={control}
                name="parentId"
                rules={{ required: parentRequired }}
                render={({ field }) => (
                  <Select
                    id="parentId"
                    {...field}
                    disabled={isLoadingDistricts && type === "CLUB"}
                  >
                    <option value="">Sin organización padre</option>
                    {parentCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </FormField>
          ) : null}

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
              label="Slug"
              htmlFor="slug"
              required
              hint="Identificador único, sólo minúsculas y guiones."
              error={errors.slug ? "El slug es obligatorio." : undefined}
            >
              <Input
                id="slug"
                {...register("slug", {
                  required: true,
                  pattern: /^[a-z0-9-]+$/,
                })}
              />
            </FormField>
          </div>

          <div
            style={{
              display: "grid",
              gap: "var(--mr-space-3)",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            <FormField label="País" htmlFor="countryCode">
              <Input
                id="countryCode"
                placeholder="AR"
                {...register("countryCode")}
              />
            </FormField>
            <FormField label="Región" htmlFor="region">
              <Input id="region" {...register("region")} />
            </FormField>
            <FormField label="Ciudad" htmlFor="city">
              <Input id="city" {...register("city")} />
            </FormField>
          </div>

          <div
            style={{
              display: "grid",
              gap: "var(--mr-space-3)",
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <FormField label="Email de contacto" htmlFor="contactEmail">
              <Input
                id="contactEmail"
                type="email"
                {...register("contactEmail")}
              />
            </FormField>
            <FormField label="Teléfono de contacto" htmlFor="contactPhone">
              <Input
                id="contactPhone"
                type="tel"
                {...register("contactPhone")}
              />
            </FormField>
          </div>

          <FormField label="Descripción" htmlFor="description">
            <Textarea id="description" rows={3} {...register("description")} />
          </FormField>

          {createOrganization.isError ? (
            <Alert
              tone="danger"
              title={
                describeOrganizationMutationError(createOrganization.error)
                  .title
              }
              description={
                describeOrganizationMutationError(createOrganization.error)
                  .description
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
            <Button type="submit" disabled={createOrganization.isPending}>
              {createOrganization.isPending ? "Creando…" : "Crear organización"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
