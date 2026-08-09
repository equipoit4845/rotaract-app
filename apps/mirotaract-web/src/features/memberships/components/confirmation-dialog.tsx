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
 * Small deliberate duplicate of `features/organizations/components/confirmation-dialog.tsx`
 * (product spec §32 — both tracks active at once, a shared low-level
 * dialog shell isn't worth a cross-feature coupling). Shared shape for
 * every "confirm this Kernel lifecycle transition" dialog
 * (activate/leave/resume/deactivate/graduate/reactivate). Never applies an
 * optimistic update — the trigger stays disabled and labeled
 * "Procesando…" until the Kernel responds (product spec §17).
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
