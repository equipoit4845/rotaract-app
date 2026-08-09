"use client";

import { useAcceptInvitation } from "@/lib/api";
import { Alert, Button, FormField } from "@equipoit4845/ui";
import { useForm } from "react-hook-form";

import { describeAcceptInvitationError } from "../adapters/auth-mutation-errors";
import { PasswordInput } from "../components/password-input";

type InviteAcceptFormValues = {
  password: string;
  passwordConfirmation: string;
};

/**
 * `kernel-openapi.yaml` has no `GET` to preview an invitation by token
 * (`AccountInvitation` never carries the raw token, and `invitePersonToCreateAccount`'s
 * response doesn't return one either) — this form can't show which
 * organization/person the invitation belongs to before submit
 * (`BLOCKED_API`, see docs/09). It goes straight to `POST
 * /auth/invitations/accept` with the token from the URL + a new password.
 */
export function InviteAcceptForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: () => void;
}) {
  const acceptInvitation = useAcceptInvitation();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InviteAcceptFormValues>({
    defaultValues: { password: "", passwordConfirmation: "" },
  });

  const password = watch("password");

  const onSubmit = handleSubmit((values) => {
    acceptInvitation.mutate(
      { token, password: values.password },
      { onSuccess },
    );
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
        label="Contraseña"
        htmlFor="password"
        required
        hint="Mínimo 12 caracteres."
        error={
          errors.password
            ? "La contraseña debe tener al menos 12 caracteres."
            : undefined
        }
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          {...register("password", { required: true, minLength: 12 })}
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

      {acceptInvitation.isError ? (
        <Alert
          tone="danger"
          {...describeAcceptInvitationError(acceptInvitation.error)}
        />
      ) : null}

      <Button type="submit" disabled={acceptInvitation.isPending}>
        {acceptInvitation.isPending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
