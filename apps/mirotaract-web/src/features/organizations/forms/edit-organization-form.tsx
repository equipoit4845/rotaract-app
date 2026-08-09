"use client";

import type { Organization, UpdateOrganizationRequest } from "@/lib/api";
import { useUpdateOrganization } from "@/lib/api";
import { Alert, Button, FormField, Input, Textarea } from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { describeOrganizationMutationError } from "./organization-mutation-errors";

type EditOrganizationFormValues = {
  name: string;
  countryCode: string;
  region: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
};

function toDefaultValues(
  organization: Organization,
): EditOrganizationFormValues {
  return {
    name: organization.name,
    countryCode: organization.countryCode ?? "",
    region: organization.region ?? "",
    city: organization.city ?? "",
    contactEmail: organization.contactEmail ?? "",
    contactPhone: organization.contactPhone ?? "",
    description: organization.description ?? "",
  };
}

/** Exactly the `UpdateOrganizationRequest` surface — `type`/`code`/`slug`/`parentId` aren't part of this DTO (product spec §21). */
function toUpdateRequest(
  values: EditOrganizationFormValues,
): UpdateOrganizationRequest {
  return {
    name: values.name.trim(),
    countryCode: values.countryCode.trim() || null,
    region: values.region.trim() || null,
    city: values.city.trim() || null,
    contactEmail: values.contactEmail.trim() || null,
    contactPhone: values.contactPhone.trim() || null,
    description: values.description.trim() || null,
  };
}

export function EditOrganizationForm({
  organization,
}: {
  organization: Organization;
}) {
  const router = useRouter();
  const update = useUpdateOrganization();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditOrganizationFormValues>({
    defaultValues: toDefaultValues(organization),
  });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { organizationId: organization.id, payload: toUpdateRequest(values) },
      { onSuccess: () => router.push(`/organizations/${organization.id}`) },
    );
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
          <Input id="contactEmail" type="email" {...register("contactEmail")} />
        </FormField>
        <FormField label="Teléfono de contacto" htmlFor="contactPhone">
          <Input id="contactPhone" type="tel" {...register("contactPhone")} />
        </FormField>
      </div>

      <FormField label="Descripción" htmlFor="description">
        <Textarea id="description" rows={3} {...register("description")} />
      </FormField>

      {update.isError ? (
        <Alert
          tone="danger"
          title={describeOrganizationMutationError(update.error).title}
          description={
            describeOrganizationMutationError(update.error).description
          }
        />
      ) : null}

      <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/organizations/${organization.id}`)}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
