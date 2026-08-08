import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type DataToolbarProps = {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function DataToolbar({
  search,
  filters,
  actions,
  className,
}: DataToolbarProps) {
  return (
    <div className={cx("mr-data-toolbar", className)}>
      <div className="mr-data-toolbar__primary">
        {search ? (
          <div className="mr-data-toolbar__search">{search}</div>
        ) : null}
        {filters ? (
          <div className="mr-data-toolbar__filters">{filters}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="mr-data-toolbar__actions">{actions}</div>
      ) : null}
    </div>
  );
}
