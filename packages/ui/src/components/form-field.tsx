import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "../lib/cx";

export const FormFieldLabel = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    {...props}
    ref={ref}
    className={cx("mr-form-field__label", className)}
  />
));
FormFieldLabel.displayName = "FormFieldLabel";

export function FormFieldHint({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cx("mr-form-field__hint", className)}>{children}</p>;
}

export function FormFieldError({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cx("mr-form-field__error", className)} role="alert">
      {children}
    </p>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input {...props} ref={ref} className={cx("mr-input", className)} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    {...props}
    ref={ref}
    className={cx("mr-input", "mr-textarea", className)}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    {...props}
    ref={ref}
    className={cx("mr-input", "mr-select", className)}
  />
));
Select.displayName = "Select";

export type FormFieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Composes label + control + hint/error. Reach for the parts
 * (FormFieldLabel/FormFieldHint/FormFieldError) directly when a field's
 * layout doesn't fit this wrapper.
 */
export function FormField({
  label,
  hint,
  error,
  htmlFor,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cx("mr-form-field", className)}>
      {label ? (
        <FormFieldLabel htmlFor={htmlFor}>
          {label}
          {required ? (
            <span aria-hidden="true" className="mr-form-field__required">
              {" "}
              *
            </span>
          ) : null}
        </FormFieldLabel>
      ) : null}
      {children}
      {error ? (
        <FormFieldError>{error}</FormFieldError>
      ) : hint ? (
        <FormFieldHint>{hint}</FormFieldHint>
      ) : null}
    </div>
  );
}
