"use client";

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
} from "@equipoit4845/ui";
import type { ReactNode } from "react";

import type { KernelErrorMessage } from "@/features/shell/kernel-error-message";

/**
 * Local to Persons — same shape as Organizations'
 * `ConfirmationDialog`, deliberately duplicated rather than imported
 * cross-feature (this phase keeps Persons self-contained, mirroring the
 * explicit no-shared-domain-components rule for Persons/Memberships).
 * Never applies an optimistic update — the confirm button stays
 * disabled/labeled "Procesando…" until the Kernel responds.
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
  isPending,
  errorMessage,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  isPending: boolean;
  errorMessage?: KernelErrorMessage;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {errorMessage ? (
          <Alert
            tone="danger"
            title={errorMessage.title}
            description={errorMessage.description}
          />
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Procesando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
