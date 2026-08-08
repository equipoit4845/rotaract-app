import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";

import { cx } from "../lib/cx";

export const Dropdown = DropdownMenuPrimitive.Root;
export const DropdownTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      {...props}
      ref={ref}
      sideOffset={sideOffset}
      className={cx("mr-dropdown", className)}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownContent.displayName = "DropdownContent";

export const DropdownItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    {...props}
    ref={ref}
    className={cx("mr-dropdown__item", className)}
  />
));
DropdownItem.displayName = "DropdownItem";

export const DropdownLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    {...props}
    ref={ref}
    className={cx("mr-dropdown__label", className)}
  />
));
DropdownLabel.displayName = "DropdownLabel";

export const DropdownSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    {...props}
    ref={ref}
    className={cx("mr-dropdown__separator", className)}
  />
));
DropdownSeparator.displayName = "DropdownSeparator";
