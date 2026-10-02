import { Inbox, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-primary/10 text-primary",
  info: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning-foreground dark:text-warning",
  danger: "bg-destructive/10 text-destructive",
};

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** Makes the whole card a link (e.g. "Socios activos" → /memberships). */
  href?: string;
}) {
  const card = (
    <section
      className={cn(
        "flex h-full min-h-30 justify-between gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs transition-colors",
        href && "hover:border-primary/30 hover:bg-muted/30",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <strong className="mt-2 block text-3xl font-semibold tracking-tight">
          {value}
        </strong>
        {detail ? (
          <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      {icon ? (
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5",
            toneClasses[tone],
          )}
        >
          {icon}
        </span>
      ) : null}
    </section>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {card}
    </Link>
  ) : (
    card
  );
}

const stateIcon = {
  empty: <Inbox aria-hidden />,
  error: <TriangleAlert aria-hidden />,
  loading: <LoaderCircle className="animate-spin" aria-hidden />,
} as const;

export function DataState({
  kind = "empty",
  title,
  description,
  action,
}: {
  kind?: "empty" | "error" | "loading";
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      role={kind === "error" ? "alert" : undefined}
      aria-busy={kind === "loading" || undefined}
      className="grid place-items-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center"
    >
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mb-4 grid size-11 place-items-center rounded-full [&_svg]:size-5",
            kind === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          {stateIcon[kind]}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? (
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </section>
  );
}

export function DataToolbar({
  primary,
  search,
  filters,
  actions,
}: {
  primary?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
        {primary}
        {search}
        {filters}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DataPagination({
  summary,
  previous,
  next,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  summary: ReactNode;
  previous?: ReactNode;
  next?: ReactNode;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">{summary}</p>
      <div className="flex gap-2">
        {previous ??
          (onPrevious ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrevious}
              onClick={onPrevious}
            >
              Anterior
            </Button>
          ) : null)}
        {next ??
          (onNext ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={onNext}
            >
              Siguiente
            </Button>
          ) : null)}
      </div>
    </div>
  );
}
