import type { MrStateTone } from "@mirotaract/design-tokens";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";

import { cx } from "../lib/cx";

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    {...props}
    ref={ref}
    className={cx("mr-toast-viewport", className)}
  />
));
ToastViewport.displayName = "ToastViewport";

export type ToastProps = ComponentPropsWithoutRef<
  typeof ToastPrimitive.Root
> & {
  tone?: MrStateTone;
};

/**
 * Controlled component — `open`/`onOpenChange` are the caller's. This
 * package stays purely visual: no built-in toast queue/manager.
 */
export const Toast = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, tone = "neutral", ...props }, ref) => (
  <ToastPrimitive.Root
    {...props}
    ref={ref}
    className={cx("mr-toast", `mr-toast--${tone}`, className)}
  />
));
Toast.displayName = "Toast";

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    {...props}
    ref={ref}
    className={cx("mr-toast__title", className)}
  />
));
ToastTitle.displayName = "ToastTitle";

export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    {...props}
    ref={ref}
    className={cx("mr-toast__description", className)}
  />
));
ToastDescription.displayName = "ToastDescription";

export const ToastAction = forwardRef<
  ElementRef<typeof ToastPrimitive.Action>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    {...props}
    ref={ref}
    className={cx("mr-toast__action", className)}
  />
));
ToastAction.displayName = "ToastAction";

export const ToastClose = forwardRef<
  ElementRef<typeof ToastPrimitive.Close>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    {...props}
    ref={ref}
    className={cx("mr-toast__close", className)}
    aria-label="Cerrar"
  >
    ×
  </ToastPrimitive.Close>
));
ToastClose.displayName = "ToastClose";
