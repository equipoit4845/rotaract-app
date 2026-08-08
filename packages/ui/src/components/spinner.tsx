import type { HTMLAttributes } from "react";

import { cx } from "../lib/cx";

export type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  size?: number;
  label?: string;
};

export function Spinner({
  className,
  size = 20,
  label = "Cargando",
  style,
  ...props
}: SpinnerProps) {
  return (
    <span
      {...props}
      role="status"
      aria-label={label}
      className={cx("mr-spinner", className)}
      style={{ width: size, height: size, ...style }}
    >
      <svg viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="3"
        />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
