import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

export type { BreadcrumbItem };

export type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx("mr-page-header", className)}>
      <div>
        {breadcrumb?.length ? <Breadcrumbs items={breadcrumb} /> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? (
        <div className="mr-page-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
