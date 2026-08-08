import { StatusIcon } from "@mirotaract/icons";

import { cx } from "../lib/cx";

export type PeriodIndicatorStatus = "active" | "inactive" | "pending";

export type PeriodIndicatorProps = {
  label: string;
  status: PeriodIndicatorStatus;
  detail?: string;
  className?: string;
};

const STATUS_LABEL: Record<PeriodIndicatorStatus, string> = {
  active: "Vigente",
  inactive: "Finalizado",
  pending: "Pendiente",
};

/** `status` is always this visual tri-state — never a Kernel period enum. */
export function PeriodIndicator({
  label,
  status,
  detail,
  className,
}: PeriodIndicatorProps) {
  return (
    <div
      className={cx(
        "mr-period-indicator",
        `mr-period-indicator--${status}`,
        className,
      )}
    >
      <StatusIcon tone={status} size={16} />
      <div>
        <p className="mr-period-indicator__label">{label}</p>
        <p className="mr-period-indicator__status">
          {STATUS_LABEL[status]}
          {detail ? ` · ${detail}` : ""}
        </p>
      </div>
    </div>
  );
}
