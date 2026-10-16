"use client";

import { useRegister, useRegistrationClubs } from "@/lib/api";
import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useForm } from "react-hook-form";

import { describeRegisterError } from "../adapters/auth-mutation-errors";
import { PasswordInput } from "../components/password-input";

type RegisterFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  organizationId: string;
  message: string;
};

const MAX_MESSAGE = 1_000;

/**
 * `POST /auth/register` (`RegisterAccountRequest`) creates `Person` +
 * `UserAccount` atomically (CA-ID-01). The club is required here: the
 * Kernel keeps it and, once the email is verified, creates and submits the
 * `MembershipApplication` to that club in the person's name (its
 * presidency is emailed). The form never creates a membership itself; this
 * stays a separate self-service path from the admin-driven
 * Person → Membership → Invitation flow (`/invite/[token]`).
 */
export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const register_ = useRegister();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      passwordConfirmation: "",
      organizationId: "",
      message: "",
    },
  });
  const clubs = useRegistrationClubs();

  const password = watch("password");

  const onSubmit = handleSubmit(
    ({ passwordConfirmation: _passwordConfirmation, message, ...payload }) => {
      register_.mutate(
        { ...payload, message: message.trim() || null },
        { onSuccess },
      );
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nombre"
          htmlFor="firstName"
          required
          error={errors.firstName ? "Ingresá tu nombre." : undefined}
        >
          <Input
            id="firstName"
            autoComplete="given-name"
            {...register("firstName", { required: true })}
          />
        </FormField>
        <FormField
          label="Apellido"
          htmlFor="lastName"
          required
          error={errors.lastName ? "Ingresá tu apellido." : undefined}
        >
          <Input
            id="lastName"
            autoComplete="family-name"
            {...register("lastName", { required: true })}
          />
        </FormField>
      </div>

      <FormField
        label="Email"
        htmlFor="email"
        required
        error={errors.email ? "Ingresá un email válido." : undefined}
      >
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email", { required: true })}
        />
      </FormField>

      <FormField
        label="Contraseña"
        htmlFor="password"
        required
        hint="Mínimo 10 caracteres."
        error={
          errors.password
            ? "La contraseña debe tener al menos 10 caracteres."
            : undefined
        }
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          {...register("password", { required: true, minLength: 10 })}
        />
      </FormField>

      <FormField
        label="Confirmar contraseña"
        htmlFor="passwordConfirmation"
        required
        error={
          errors.passwordConfirmation
            ? "Las contraseñas no coinciden."
            : undefined
        }
      >
        <PasswordInput
          id="passwordConfirmation"
          autoComplete="new-password"
          {...register("passwordConfirmation", {
            validate: (value) => value === password,
          })}
        />
      </FormField>

      <FormField
        label="Club"
        htmlFor="organizationId"
        required
        hint="La presidencia del club recibirá tu solicitud cuando confirmes tu email."
        error={errors.organizationId ? "Elegí tu club." : undefined}
      >
        {clubs.isLoading ? (
          <Skeleton className="h-9" />
        ) : (
          <Select
            id="organizationId"
            disabled={clubs.isError}
            {...register("organizationId", { required: true })}
          >
            <option value="">Elegí tu club</option>
            {(clubs.data?.items ?? []).map((club) => (
              <option key={club.id} value={club.id}>
                {club.city ? `${club.name} — ${club.city}` : club.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {clubs.isError ? (
        <Alert
          tone="danger"
          title="No pudimos cargar los clubes"
          description="Recargá la página en unos minutos."
        />
      ) : null}

      <FormField
        label="Mensaje para la presidencia"
        htmlFor="message"
        hint="Opcional. Contales quién sos o por qué querés sumarte."
        error={
          errors.message
            ? `Usá como máximo ${MAX_MESSAGE} caracteres.`
            : undefined
        }
      >
        <Textarea
          id="message"
          rows={3}
          {...register("message", { maxLength: MAX_MESSAGE })}
        />
      </FormField>

      {register_.isError ? (
        <Alert tone="danger" {...describeRegisterError(register_.error)} />
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={register_.isPending}
      >
        {register_.isPending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
