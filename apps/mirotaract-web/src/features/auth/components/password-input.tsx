"use client";

import { Input } from "@/components/ui";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

export type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * The show/hide toggle is a real labelled button with visible text, never
 * an icon-only control (product spec §37 — a screen reader user needs
 * "Mostrar contraseña" as text, not an unnamed icon); it sits inside the
 * field so the input keeps its full width. Toggling only flips
 * `type="text"`/`"password"` on the same input, it never re-mounts it, so
 * focus and cursor position survive the switch.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative w-full">
        <Input
          {...props}
          id={inputId}
          ref={ref}
          type={visible ? "text" : "password"}
          className="pr-24"
        />
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-1 right-1 inline-flex items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
          {visible ? "Ocultar" : "Mostrar"}
          <span className="sr-only"> contraseña</span>
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
