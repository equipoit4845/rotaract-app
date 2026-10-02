import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Avatar({
  name,
  size = "md",
  imageUrl,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  imageUrl?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 font-medium text-primary",
        size === "sm" && "size-8 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-12 text-base",
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

export type OrganizationOption = { id: string; name: string; hint?: string };

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
  onSelect,
}: {
  organizations: OrganizationOption[];
  activeOrganizationId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">Organización activa</span>
      <select
        value={activeOrganizationId}
        onChange={(event) => onSelect(event.target.value)}
        className="h-8 max-w-60 cursor-pointer appearance-none truncate rounded-lg border border-input bg-background py-1 pl-3 pr-8 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">Seleccionar organización</option>
        {organizations.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" />
    </label>
  );
}

export type PeriodIndicatorStatus = "active" | "pending" | "inactive";

export function PeriodIndicator({
  label,
  status,
}: {
  label: string;
  status: PeriodIndicatorStatus;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          status === "active" && "bg-success",
          status === "pending" && "bg-warning",
          status === "inactive" && "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

export function ModuleFrame({
  moduleName,
  context,
  backHref,
  children,
}: {
  moduleName: string;
  context?: ReactNode;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border p-6">
        {backHref ? (
          <a
            className="text-sm text-muted-foreground hover:text-foreground"
            href={backHref}
          >
            Volver
          </a>
        ) : null}
        <h1 className="mt-2 text-xl font-semibold">{moduleName}</h1>
        {context ? (
          <p className="text-sm text-muted-foreground">{context}</p>
        ) : null}
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
