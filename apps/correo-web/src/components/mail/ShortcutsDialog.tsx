"use client";

import { X } from "lucide-react";

import { SHORTCUTS } from "@/lib/shortcuts";

const KEY_LABEL: Record<string, string> = { Escape: "Esc" };

/** "?": the shortcuts, straight from the registry. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atajos de teclado"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-xl border bg-background p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Atajos de teclado
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            autoFocus
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        <dl className="space-y-1.5 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-foreground"
                  >
                    {KEY_LABEL[k] ?? k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t pt-1.5">
            <dt className="text-muted-foreground">Enviar el mail</dt>
            <dd>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                Ctrl/⌘ + Enter
              </kbd>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
