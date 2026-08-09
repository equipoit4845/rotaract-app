"use client";

import { Button, Input } from "@equipoit4845/ui";
import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

export type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * The show/hide toggle is a real labelled `Button`, never an icon-only
 * control (product spec §37 — a screen reader user needs "Mostrar
 * contraseña" as text, not an unnamed icon). Toggling only flips
 * `type="text"`/`"password"` on the same input, it never re-mounts it, so
 * focus and cursor position survive the switch.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
      <div style={{ display: "flex", gap: "var(--mr-space-2)", width: "100%" }}>
        <Input
          {...props}
          id={inputId}
          ref={ref}
          type={visible ? "text" : "password"}
          style={{ flex: 1 }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
