"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

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
} from "@/components/ui";

/**
 * The one "confirm this Kernel state transition" dialog for every feature.
 * Never applies an optimistic update: the confirm button stays disabled
 * with "Procesando…" until the Kernel responds, and a failure is shown
 * inline (`errorMessage`, usually from `describeKernelError`) without
 * closing the dialog.
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
  /** Omit when the dialog is opened programmatically (e.g. from a menu item) instead of its own trigger element. */
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  isPending: boolean;
  errorMessage?: { title: string; description?: string };
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const danger = confirmVariant === "danger";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            {danger ? (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                <TriangleAlert className="size-4" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0 space-y-1.5">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
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
            className={
              danger
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
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
