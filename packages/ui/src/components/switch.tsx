import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";

import { cx } from "../lib/cx";

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    {...props}
    ref={ref}
    className={cx("mr-switch", className)}
  >
    <SwitchPrimitive.Thumb className="mr-switch__thumb" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
