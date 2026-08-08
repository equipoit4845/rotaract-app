import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "../lib/cx";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      type = "button",
      leadingIcon,
      trailingIcon,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={cx(
          "mr-button",
          `mr-button--${variant}`,
          `mr-button--${size}`,
          className,
        )}
      >
        {leadingIcon ? (
          <span className="mr-button__icon">{leadingIcon}</span>
        ) : null}
        {children}
        {trailingIcon ? (
          <span className="mr-button__icon">{trailingIcon}</span>
        ) : null}
      </button>
    );
  },
);
Button.displayName = "Button";
