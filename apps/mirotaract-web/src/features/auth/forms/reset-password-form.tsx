"use client";

import { useResetPassword } from "@/lib/api";
import { Alert, Button, FormField } from "@/components/ui";
import { useForm } from "react-hook-form";

import { describeResetPasswordError } from "../adapters/auth-mutation-errors";
import { PasswordInput } from "../components/password-input";

type ResetPasswordFormValues = {
  newPassword: string;
  newPasswordConfirmation: string;
};

/** `POST /auth/reset-password` — `newPassword` minLength 10 per `kernel-openapi.yaml`. */
export function ResetPasswordForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: () => void;
}) {
  const resetPassword = useResetPassword();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    defaultValues: { newPassword: "", newPasswordConfirmation: "" },
  });

  const newPassword = watch("newPassword");

  const onSubmit = handleSubmit((values) => {
    resetPassword.mutate(
      { token, newPassword: values.newPassword },
      { onSuccess },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        label="Nueva contraseña"
        htmlFor="newPassword"
        required
        hint="Mínimo 10 caracteres."
        error={
          errors.newPassword
            ? "La contraseña debe tener al menos 10 caracteres."
            : undefined
        }
      >
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          {...register("newPassword", { required: true, minLength: 10 })}
        />
      </FormField>

      <FormField
        label="Confirmar contraseña"
        htmlFor="newPasswordConfirmation"
        required
        error={
          errors.newPasswordConfirmation
            ? "Las contraseñas no coinciden."
            : undefined
        }
      >
        <PasswordInput
          id="newPasswordConfirmation"
          autoComplete="new-password"
          {...register("newPasswordConfirmation", {
            validate: (value) => value === newPassword,
          })}
        />
      </FormField>

      {resetPassword.isError ? (
        <Alert
          tone="danger"
          {...describeResetPasswordError(resetPassword.error)}
        />
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={resetPassword.isPending}
      >
        {resetPassword.isPending ? "Actualizando…" : "Actualizar contraseña"}
      </Button>
    </form>
  );
}
