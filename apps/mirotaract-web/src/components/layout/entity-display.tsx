import type { ReactNode } from "react";

import { Breadcrumbs, type BreadcrumbItem } from "./page-header";
import { cn } from "@/lib/cn";

/**
 * Identity block for a detail screen (club, person, membership…): optional
 * image/avatar, title, subtitle, status badges and actions. Replaces
 * `PageHeader` on detail pages.
 */
export function EntityHero({
  title,
  subtitle,
  badges,
  image,
  actions,
  breadcrumb,
  size = "lg",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  image?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: BreadcrumbItem[];
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {breadcrumb?.length ? <Breadcrumbs items={breadcrumb} /> : null}
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs",
          size === "lg" ? "p-5" : "p-4",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            {image ? <div className="shrink-0">{image}</div> : null}
            <div className="min-w-0 flex-1">
              <h1
                className={cn(
                  "font-semibold text-foreground",
                  size === "lg" ? "text-2xl tracking-tight" : "text-xl",
                )}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
              {badges ? (
                <div className="mt-3 flex flex-wrap gap-2">{badges}</div>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Compact row of key figures, e.g. under an `EntityHero`. */
export function StatStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-border bg-muted/30 px-4 py-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {item.label}
          </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Groups related form fields under a small heading. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Label/value grid for summary cards — replaces the hand-styled `<dl>`
 * blocks (`style={{ margin: 0 }}`) each feature used to repeat.
 */
export function DetailGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** One `DetailGrid` cell. Empty string/null/undefined values render "—". */
export function DetailItem({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const empty =
    children === null ||
    children === undefined ||
    (typeof children === "string" && children.trim() === "");
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">
        {empty ? "—" : children}
      </dd>
    </div>
  );
}
