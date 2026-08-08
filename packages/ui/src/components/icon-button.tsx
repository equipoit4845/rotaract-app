import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "../lib/cx";
import type { ButtonVariant } from "./button";

export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  variant?: ButtonVariant;
  size?: IconButtonSize;
  icon: ReactNode;
  /** Required — an icon-only button has no other accessible name. */
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant = "ghost",
      size = "md",
      icon,
      label,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cx(
          "mr-button",
          "mr-icon-button",
          `mr-button--${variant}`,
          `mr-icon-button--${size}`,
          className,
        )}
      >
        <span className="mr-button__icon" aria-hidden="true">
          {icon}
        </span>
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
