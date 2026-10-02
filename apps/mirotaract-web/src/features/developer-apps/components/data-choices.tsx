"use client";

import { FormSection } from "@/components/layout";
import { Checkbox, FormFieldError } from "@/components/ui";
import type { ReactNode } from "react";

/**
 * Checkbox list of "datos que la app puede leer". Shows labels only; the
 * codes stay inside the form state.
 */
export function DataChoices({
  idPrefix,
  title,
  description,
  items,
  selected,
  locked = [],
  error,
  onToggle,
}: {
  idPrefix: string;
  title: ReactNode;
  description?: ReactNode;
  items: ReadonlyArray<{ code: string; label: string }>;
  selected: ReadonlySet<string>;
  /** Always included and not removable (shown checked and disabled). */
  locked?: ReadonlyArray<string>;
  error?: string;
  onToggle: (code: string, checked: boolean) => void;
}) {
  return (
    <FormSection title={title} description={description}>
      <ul className="space-y-2">
        {items.map((item, index) => {
          const id = `${idPrefix}-${index}`;
          const isLocked = locked.includes(item.code);
          return (
            <li key={item.code} className="flex items-start gap-2">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={isLocked || selected.has(item.code)}
                disabled={isLocked}
                onCheckedChange={(checked) =>
                  onToggle(item.code, checked === true)
                }
              />
              <label htmlFor={id} className="text-sm leading-5">
                {item.label}
                {isLocked ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (siempre incluido)
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      {error ? <FormFieldError>{error}</FormFieldError> : null}
    </FormSection>
  );
}

export function toggleInSet(
  set: ReadonlySet<string>,
  code: string,
  checked: boolean,
): Set<string> {
  const next = new Set(set);
  if (checked) next.add(code);
  else next.delete(code);
  return next;
}
