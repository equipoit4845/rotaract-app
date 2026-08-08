import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  delayDuration?: number;
};

/**
 * `children` must be a single element that can accept a ref/DOM props
 * (Radix attaches the trigger via `asChild`) — typically a Button or
 * IconButton.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delayDuration = 200,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="mr-tooltip"
        >
          {content}
          <TooltipPrimitive.Arrow className="mr-tooltip__arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
