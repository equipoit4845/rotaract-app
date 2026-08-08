import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section className={cx("mr-empty-state", className)}>
      {icon ? <span className="mr-empty-state__icon">{icon}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="mr-empty-state__action">{action}</div> : null}
    </section>
  );
}
