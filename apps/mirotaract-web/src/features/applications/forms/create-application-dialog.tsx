"use client";

import { useCreateMembershipApplication } from "@/lib/api";
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
  Textarea,
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { describeCreateApplicationError } from "./application-mutation-errors";

/**
 * `createMembershipApplication`'s permission is
 * `kernel.application.create.self` and `CreateMembershipApplicationRequest`
 * has no `personId` field (kernel-openapi.yaml) — the requester is always
 * the acting user, there is no "create for another person" operation for
 * applications. Unlike `CreateMembershipDialog` (Memberships, which
 * creates a membership on someone else's behalf), this dialog never offers
 * a person picker.
 */
export function CreateApplicationDialog({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const createApplication = useCreateMembershipApplication();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMessage("");
      createApplication.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createApplication.mutate(
      { organizationId, message: message.trim() || null },
      {
        onSuccess: (application) => {
          handleOpenChange(false);
          router.push(`/applications/${application.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Solicitar ingreso</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar ingreso</DialogTitle>
          <DialogDescription>
            Crea una solicitud de membresía (borrador) para esta organización.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-3)",
          }}
        >
          <FormField
            label="Mensaje"
            htmlFor="applicationMessage"
            hint="Opcional."
          >
            <Textarea
              id="applicationMessage"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </FormField>

          {createApplication.isError ? (
            <Alert
              tone="danger"
              title={
                describeCreateApplicationError(createApplication.error).title
              }
              description={
                describeCreateApplicationError(createApplication.error)
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
            <Button type="submit" disabled={createApplication.isPending}>
              {createApplication.isPending ? "Creando…" : "Crear solicitud"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
