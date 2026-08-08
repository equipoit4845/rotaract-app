import * as ProgressPrimitive from "@radix-ui/react-progress";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";

import { cx } from "../lib/cx";

export type ProgressProps = ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
>;

/**
 * `aria-label` defaults to "Progreso" — a `role="progressbar"` with no
 * accessible name is a real (not hypothetical) axe `aria-progressbar-name`
 * violation; pass `aria-label`/`aria-labelledby` to describe what's
 * progressing when the default is too generic.
 */
export const Progress = forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(
  (
    {
      className,
      value = 0,
      max = 100,
      "aria-label": ariaLabel = "Progreso",
      ...props
    },
    ref,
  ) => {
    const safeMax = max ?? 100;
    const safeValue = Math.min(value ?? 0, safeMax);
    return (
      <ProgressPrimitive.Root
        {...props}
        ref={ref}
        value={value}
        max={max}
        aria-label={ariaLabel}
        className={cx("mr-progress", className)}
      >
        <ProgressPrimitive.Indicator
          className="mr-progress__indicator"
          style={{
            transform: `translateX(-${100 - (safeValue / safeMax) * 100}%)`,
          }}
        />
      </ProgressPrimitive.Root>
    );
  },
);
Progress.displayName = "Progress";
