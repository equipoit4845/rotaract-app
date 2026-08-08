import type { HTMLAttributes } from "react";

import { cx } from "../lib/cx";

export type SeparatorOrientation = "horizontal" | "vertical";

export type SeparatorProps = HTMLAttributes<HTMLHRElement> & {
  orientation?: SeparatorOrientation;
};

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorProps) {
  return (
    <hr
      {...props}
      role="separator"
      aria-orientation={orientation}
      className={cx("mr-separator", `mr-separator--${orientation}`, className)}
    />
  );
}
