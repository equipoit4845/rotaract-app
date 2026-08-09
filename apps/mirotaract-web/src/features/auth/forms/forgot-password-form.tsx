"use client";

import { useRequestPasswordReset } from "@/lib/api";
import { Alert, Button, FormField, Input } from "@equipoit4845/ui";
import { useForm } from "react-hook-form";

import { describeKernelError } from "@/features/shell/kernel-error-message";

type ForgotPasswordFormValues = { email: string };

/**
 * `POST /auth/forgot-password` always responds `202`, whether or not the
 * email is registered (product spec §22 — "no filtrar existencia de
 * cuentas"), so `isSuccess` always gets the same generic copy. `isError`
 * here can only mean a real request failure (network/429/5xx) — the
 * Kernel folds "no such account" into the same 202, it never reaches this
 * branch — so showing the real error for those cases doesn't leak
 * anything.
 */
export function ForgotPasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const requestReset = useRequestPasswordReset();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({ defaultValues: { email: "" } });

  const onSubmit = handleSubmit((values) => {
    requestReset.mutate(values, { onSuccess });
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
          autoComplete="email"
          {...register("email", { required: true })}
        />
      </FormField>

      {requestReset.isError ? (
        <Alert tone="danger" {...describeKernelError(requestReset.error)} />
      ) : null}

      <Button type="submit" disabled={requestReset.isPending}>
        {requestReset.isPending ? "Enviando…" : "Enviar instrucciones"}
      </Button>
    </form>
  );
}
