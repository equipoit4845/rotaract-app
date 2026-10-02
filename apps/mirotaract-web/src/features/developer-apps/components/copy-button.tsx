"use client";

import { Button } from "@/components/ui";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/** Copies `value` to the clipboard; the label says what is being copied. */
export function CopyButton({
  value,
  label,
}: {
  value: string;
  /** Accessible name, e.g. "Copiar identificador". */
  label: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={copy}
      leadingIcon={
        state === "copied" ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )
      }
    >
      {state === "copied"
        ? "Copiado"
        : state === "failed"
          ? "Copialo a mano"
          : "Copiar"}
    </Button>
  );
}

/** Monospace value with its copy button, for identifiers and secrets. */
export function CopyableValue({
  value,
  copyLabel,
}: {
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
        {value}
      </code>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}
