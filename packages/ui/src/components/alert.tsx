import type { MrStateTone } from "@mirotaract/design-tokens";
import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type AlertProps = {
  tone?: MrStateTone;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function Alert({
  tone = "info",
  title,
  description,
  icon,
  action,
  className,
}: AlertProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("mr-alert", `mr-alert--${tone}`, className)}
    >
      {icon ? (
        <span className="mr-alert__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="mr-alert__body">
        <p className="mr-alert__title">{title}</p>
        {description ? (
          <p className="mr-alert__description">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mr-alert__action">{action}</div> : null}
    </div>
  );
}
