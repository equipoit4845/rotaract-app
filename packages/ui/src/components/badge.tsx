import type { MrStateTone } from "@equipoit4845/design-tokens";
import type { HTMLAttributes } from "react";

import { cx } from "../lib/cx";

export type BadgeTone = MrStateTone;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx("mr-badge", `mr-badge--${tone}`, className)}
    />
  );
}
