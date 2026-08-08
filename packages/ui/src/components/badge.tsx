import type { HTMLAttributes } from "react";

import { cx } from "../lib/cx";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return <span {...props} className={cx("mr-badge", `mr-badge--${tone}`, className)} />;
}
