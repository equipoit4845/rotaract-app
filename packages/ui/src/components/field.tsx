import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "../lib/cx";

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cx("mr-field__label", className)} />;
}

export function FieldHint({ className, ...props }: { className?: string; children: ReactNode }) {
  return <p className={cx("mr-field__hint", className)}>{props.children}</p>;
}

export function FieldError({ className, ...props }: { className?: string; children: ReactNode }) {
  return <p className={cx("mr-field__error", className)} role="alert">{props.children}</p>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("mr-input", className)} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx("mr-input", "mr-textarea", className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("mr-input", "mr-select", className)} />;
}
