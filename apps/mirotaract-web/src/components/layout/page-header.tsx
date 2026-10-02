import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden>/</span> : null}
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-1", className)}>
      {breadcrumb?.length ? <Breadcrumbs items={breadcrumb} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

const sectionTitleSize = {
  sm: "text-base",
  default: "text-lg",
  lg: "text-xl",
} as const;

export function SectionHeader({
  title,
  description,
  action,
  size = "default",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: keyof typeof sectionTitleSize;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2
          className={cn(
            "font-semibold text-foreground",
            sectionTitleSize[size],
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="mt-2 shrink-0 sm:mt-0 sm:ml-4">{action}</div>
      ) : null}
    </div>
  );
}
