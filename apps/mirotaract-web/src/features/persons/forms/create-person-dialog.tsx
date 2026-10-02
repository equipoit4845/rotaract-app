"use client";

import type { CreatePersonRequest } from "@/lib/api";
import { useCreatePerson } from "@/lib/api";
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
} from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { describePersonMutationError } from "./person-mutation-errors";

type CreatePersonFormValues = {
  firstName: string;
  lastName: string;
  primaryEmail: string;
  phone: string;
  birthDate: string;
};

const DEFAULT_VALUES: CreatePersonFormValues = {
  firstName: "",
  lastName: "",
  primaryEmail: "",
  phone: "",
  birthDate: "",
};

function toCreateRequest(values: CreatePersonFormValues): CreatePersonRequest {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    primaryEmail: values.primaryEmail.trim() || null,
    phone: values.phone.trim() || null,
    birthDate: values.birthDate || null,
  };
}

export function CreatePersonDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const createPerson = useCreatePerson();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePersonFormValues>({ defaultValues: DEFAULT_VALUES });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset(DEFAULT_VALUES);
      createPerson.reset();
    }
  }

  const onSubmit = handleSubmit((values) => {
    createPerson.mutate(toCreateRequest(values), {
      onSuccess: (person) => {
        handleOpenChange(false);
        router.push(`/persons/${person.id}`);
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Crear persona</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear persona</DialogTitle>
          <DialogDescription>
            Da de alta una persona en la institución. Puede no tener cuenta
            todavía.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
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
              error={
                errors.lastName ? "El apellido es obligatorio." : undefined
              }
            >
              <Input
                id="lastName"
                {...register("lastName", { required: true })}
              />
            </FormField>
          </div>

          <FormField label="Email" htmlFor="primaryEmail">
            <Input
              id="primaryEmail"
              type="email"
              {...register("primaryEmail")}
            />
          </FormField>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <FormField label="Teléfono" htmlFor="phone">
              <Input id="phone" type="tel" {...register("phone")} />
            </FormField>
            <FormField label="Fecha de nacimiento" htmlFor="birthDate">
              <Input id="birthDate" type="date" {...register("birthDate")} />
            </FormField>
          </div>

          {createPerson.isError ? (
            <Alert
              tone="danger"
              title={describePersonMutationError(createPerson.error).title}
              description={
                describePersonMutationError(createPerson.error).description
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
            <Button type="submit" disabled={createPerson.isPending}>
              {createPerson.isPending ? "Creando…" : "Crear persona"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
