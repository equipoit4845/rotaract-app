"use client";

import { useLogin } from "@/lib/api";
import { Alert, Button, FormField, Input } from "@equipoit4845/ui";
import { useForm } from "react-hook-form";

import { describeLoginError } from "../adapters/auth-mutation-errors";
import { PasswordInput } from "../components/password-input";

type LoginFormValues = {
  email: string;
  password: string;
};

/**
 * `POST /auth/login` (kernel-openapi.yaml `LoginRequest`) takes exactly
 * `email` + `password` — no username/identifier alternative in the
 * contract, so this form doesn't offer one.
 */
export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, { onSuccess });
  });

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
      <FormField
        label="Email"
        htmlFor="email"
        required
        error={errors.email ? "Ingresá tu email." : undefined}
      >
        <Input
          id="email"
          type="email"
          autoComplete="username"
          {...register("email", { required: true })}
        />
      </FormField>

      <FormField
        label="Contraseña"
        htmlFor="password"
        required
        error={errors.password ? "Ingresá tu contraseña." : undefined}
      >
        <PasswordInput
          id="password"
          autoComplete="current-password"
          {...register("password", { required: true })}
        />
      </FormField>

      {login.isError ? (
        <Alert tone="danger" {...describeLoginError(login.error)} />
      ) : null}

      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
