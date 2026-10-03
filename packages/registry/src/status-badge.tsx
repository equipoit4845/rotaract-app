import { Badge, type BadgeTone } from "@/components/mirotaract/ui";

type StatusEntry = { label: string; tone: BadgeTone };

/**
 * How Mi Rotaract shows every status of the kernel, the same on every
 * screen (and in every module). Tones follow one rule:
 *   success: in force (ACTIVE, APPROVED, COMPLETED…)
 *   info:    in progress / waiting on someone (SUBMITTED, SCHEDULED…)
 *   warning: needs attention (ON_LEAVE, EXPIRED, PENDING_VERIFICATION…)
 *   danger:  negative outcome (REJECTED, REVOKED, SUSPENDED, CANCELLED…)
 *   neutral: finished or not started (DRAFT, CLOSED, ENDED, ARCHIVED…)
 */
// Filled in by scripts/build.mjs from the product's catalog
// (apps/mirotaract-web/src/lib/status/status-catalog.ts), so the kit always
// shows statuses exactly like Mi Rotaract.
export const statusCatalog =
  /* @build:status-catalog */ {} as const satisfies Record<
    string,
    Record<string, StatusEntry>
  >;

export type StatusKind = keyof typeof statusCatalog;
export type StatusOf<K extends StatusKind> = keyof (typeof statusCatalog)[K];

export function statusLabel<K extends StatusKind>(
  kind: K,
  status: StatusOf<K>,
): string {
  return (statusCatalog[kind] as Record<PropertyKey, StatusEntry>)[status]
    .label;
}

export function statusTone<K extends StatusKind>(
  kind: K,
  status: StatusOf<K>,
): BadgeTone {
  return (statusCatalog[kind] as Record<PropertyKey, StatusEntry>)[status].tone;
}

/**
 * `<StatusBadge kind="membership" status={m.status} />`: label and tone
 * come from the shared catalog. For a status of your own module, pass
 * `label` and `tone` instead: `<StatusBadge tone="info" label="Abierta" />`.
 */
export function StatusBadge<K extends StatusKind>(
  props:
    | { kind: K; status: StatusOf<K>; className?: string }
    | { label: string; tone?: BadgeTone; className?: string },
) {
  if ("kind" in props)
    return (
      <Badge
        tone={statusTone(props.kind, props.status)}
        className={props.className}
      >
        {statusLabel(props.kind, props.status)}
      </Badge>
    );
  return (
    <Badge tone={props.tone ?? "neutral"} className={props.className}>
      {props.label}
    </Badge>
  );
}
