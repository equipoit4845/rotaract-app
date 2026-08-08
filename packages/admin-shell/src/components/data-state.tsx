import { StatusIcon } from "@mirotaract/icons";
import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type DataStateKind = "empty" | "error";

export type DataStateProps = {
  kind?: DataStateKind;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Covers the "nothing to show" and "couldn't load" shapes for a data
 * listing. A loading shape is intentionally not modeled here — compose
 * @mirotaract/ui's Skeleton for that instead.
 */
export function DataState({
  kind = "empty",
  title,
  description,
  action,
  className,
}: DataStateProps) {
  return (
    <section
      className={cx("mr-data-state", `mr-data-state--${kind}`, className)}
    >
      <span className="mr-data-state__icon" aria-hidden="true">
        <StatusIcon tone={kind === "error" ? "danger" : "info"} size={24} />
      </span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="mr-data-state__action">{action}</div> : null}
    </section>
  );
}
