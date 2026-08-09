"use client";

import type { Person, UpdatePersonRequest } from "@/lib/api";
import { useUpdatePerson } from "@/lib/api";
import { Alert, Button, FormField, Input } from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { describePersonMutationError } from "./person-mutation-errors";

type EditPersonFormValues = {
  firstName: string;
  lastName: string;
  displayName: string;
  primaryEmail: string;
  phone: string;
  birthDate: string;
};

function toDefaultValues(person: Person): EditPersonFormValues {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    displayName: person.displayName ?? "",
    primaryEmail: person.primaryEmail ?? "",
    phone: person.phone ?? "",
    birthDate: person.birthDate ?? "",
  };
}

/** Exactly the `UpdatePersonRequest` surface (product spec §16/§17). */
function toUpdateRequest(values: EditPersonFormValues): UpdatePersonRequest {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    displayName: values.displayName.trim() || null,
    primaryEmail: values.primaryEmail.trim() || null,
    phone: values.phone.trim() || null,
    birthDate: values.birthDate || null,
  };
}

export function EditPersonForm({ person }: { person: Person }) {
  const router = useRouter();
  const update = useUpdatePerson();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditPersonFormValues>({ defaultValues: toDefaultValues(person) });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { personId: person.id, payload: toUpdateRequest(values) },
      { onSuccess: () => router.push(`/persons/${person.id}`) },
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
      <div
        style={{
          display: "grid",
          gap: "var(--mr-space-3)",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <FormField
          label="Nombre"
          htmlFor="firstName"
          required
          error={errors.firstName ? "El nombre es obligatorio." : undefined}
        >
          <Input
            id="firstName"
            {...register("firstName", { required: true })}
          />
        </FormField>
        <FormField
          label="Apellido"
          htmlFor="lastName"
          required
          error={errors.lastName ? "El apellido es obligatorio." : undefined}
        >
          <Input id="lastName" {...register("lastName", { required: true })} />
        </FormField>
      </div>

      <FormField
        label="Nombre para mostrar"
        htmlFor="displayName"
        hint="Opcional — si se deja vacío, se usa nombre + apellido."
      >
        <Input id="displayName" {...register("displayName")} />
      </FormField>

      <FormField label="Email" htmlFor="primaryEmail">
        <Input id="primaryEmail" type="email" {...register("primaryEmail")} />
      </FormField>

      <div
        style={{
          display: "grid",
          gap: "var(--mr-space-3)",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <FormField label="Teléfono" htmlFor="phone">
          <Input id="phone" type="tel" {...register("phone")} />
        </FormField>
        <FormField label="Fecha de nacimiento" htmlFor="birthDate">
          <Input id="birthDate" type="date" {...register("birthDate")} />
        </FormField>
      </div>

      {update.isError ? (
        <Alert
          tone="danger"
          title={describePersonMutationError(update.error).title}
          description={describePersonMutationError(update.error).description}
        />
      ) : null}

      <div style={{ display: "flex", gap: "var(--mr-space-2)" }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/persons/${person.id}`)}
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
