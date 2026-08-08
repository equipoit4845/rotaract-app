import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type BreadcrumbItem = { label: string; href?: string };

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
        {breadcrumb?.length ? (
          <nav aria-label="Miga de pan" className="mr-breadcrumb">
            {breadcrumb.map((item, index) => (
              <span key={`${item.label}-${index}`}>
                {index ? <span aria-hidden="true">/</span> : null}
                {item.href ? <a href={item.href}>{item.label}</a> : <span>{item.label}</span>}
              </span>
            ))}
          </nav>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="mr-page-header__actions">{actions}</div> : null}
    </header>
  );
}
