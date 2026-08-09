import type { PeriodStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

const LABEL: Record<PeriodStatus, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programado",
  ACTIVE: "Activo",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

/**
 * Kernel `PeriodStatus` → the general `Badge`/`MrStateTone` vocabulary
 * (neutral|info|success|warning|danger). Not to be confused with
 * `toVisualPeriodStatus` in `src/features/shell/period-status.ts`, which
 * maps the same enum into `PeriodIndicator`'s own narrower tri-state
 * (active|inactive|pending) for the compact Shell header widget — that
 * mapping intentionally collapses DRAFT/SCHEDULED/CLOSED/CANCELLED, this
 * one must not.
 */
export function periodStatusToTone(status: PeriodStatus): MrStateTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SCHEDULED":
      return "info";
    case "DRAFT":
      return "neutral";
    case "CLOSED":
      return "neutral";
    case "CANCELLED":
      return "danger";
  }
}

export function periodStatusToLabel(status: PeriodStatus): string {
  return LABEL[status];
}
