import type { HTMLAttributes } from "react";

import { cx } from "../lib/cx";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cx("mr-skeleton", className)} />;
}
