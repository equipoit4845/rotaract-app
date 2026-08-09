"use client";

import { useRegister } from "@/lib/api";
import { Alert, Button, FormField, Input } from "@equipoit4845/ui";
import { useForm } from "react-hook-form";

import { describeRegisterError } from "../adapters/auth-mutation-errors";
import { PasswordInput } from "../components/password-input";

type RegisterFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

/**
 * `POST /auth/register` (`RegisterAccountRequest`) creates `Person` +
 * `UserAccount` atomically (CA-ID-01) — this account has no `Membership`
 * yet. Joining a club/district afterward goes through a `MembershipApplication`
 * (Fase 7, `/applications`), not through anything this form does; this is
 * a genuinely separate self-service path from the admin-driven
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
    },
  });

  const password = watch("password");

  const onSubmit = handleSubmit(
    ({ passwordConfirmation: _passwordConfirmation, ...payload }) => {
      register_.mutate(payload, { onSuccess });
    },
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--mr-space-3)",
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

      {register_.isError ? (
        <Alert tone="danger" {...describeRegisterError(register_.error)} />
      ) : null}

      <Button type="submit" disabled={register_.isPending}>
        {register_.isPending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
