import type { MrStateTone } from "@equipoit4845/design-tokens";
import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: MrStateTone;
  className?: string;
};

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
  className,
}: StatCardProps) {
  return (
    <section className={cx("mr-stat-card", `mr-stat-card--${tone}`, className)}>
      <div>
        <p className="mr-stat-card__label">{label}</p>
        <strong className="mr-stat-card__value">{value}</strong>
        {detail ? <p className="mr-stat-card__detail">{detail}</p> : null}
      </div>
      {icon ? (
        <span className="mr-stat-card__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
    </section>
  );
}
