import type {
  AccountInvitation,
  ApplicationStatus,
  AppointmentStatus,
  MembershipStatus,
  OrganizationStatus,
  PeriodStatus,
  TransferStatus,
  UserAccount,
} from "@/lib/api";
import type { BadgeTone } from "@/components/ui";

type StatusEntry = { label: string; tone: BadgeTone };

/**
 * Single source of truth for how every Kernel status enum is shown: the
 * same status must read and look the same on every screen. Tones follow
 * one rule across kinds —
 *   success: in force (ACTIVE, APPROVED, COMPLETED…)
 *   info:    in progress / waiting on someone (SUBMITTED, SCHEDULED…)
 *   warning: needs attention (ON_LEAVE, EXPIRED, PENDING_VERIFICATION…)
 *   danger:  negative outcome (REJECTED, REVOKED, SUSPENDED, CANCELLED…)
 *   neutral: finished or not started (DRAFT, CLOSED, ENDED, ARCHIVED…)
 * `Record<Enum, …>` makes the compiler flag any status the Kernel adds.
 */
const catalog = {
  membership: {
    PENDING: { label: "Pendiente", tone: "info" },
    ACTIVE: { label: "Activa", tone: "success" },
    ON_LEAVE: { label: "En licencia", tone: "warning" },
    INACTIVE: { label: "Inactiva", tone: "neutral" },
    GRADUATED: { label: "Graduada", tone: "neutral" },
    TRANSFERRED: { label: "Transferida", tone: "neutral" },
  } satisfies Record<MembershipStatus, StatusEntry>,
  account: {
    PENDING_VERIFICATION: { label: "Verificación pendiente", tone: "warning" },
    ACTIVE: { label: "Activa", tone: "success" },
    SUSPENDED: { label: "Suspendida", tone: "danger" },
    DISABLED: { label: "Deshabilitada", tone: "neutral" },
  } satisfies Record<UserAccount["status"], StatusEntry>,
  invitation: {
    PENDING: { label: "Pendiente", tone: "info" },
    ACCEPTED: { label: "Aceptada", tone: "success" },
    EXPIRED: { label: "Vencida", tone: "warning" },
    REVOKED: { label: "Revocada", tone: "danger" },
  } satisfies Record<AccountInvitation["status"], StatusEntry>,
  organization: {
    DRAFT: { label: "Borrador", tone: "neutral" },
    ACTIVE: { label: "Activo", tone: "success" },
    INACTIVE: { label: "Inactivo", tone: "warning" },
    ARCHIVED: { label: "Archivado", tone: "neutral" },
  } satisfies Record<OrganizationStatus, StatusEntry>,
  period: {
    DRAFT: { label: "Borrador", tone: "neutral" },
    SCHEDULED: { label: "Programado", tone: "info" },
    ACTIVE: { label: "Activo", tone: "success" },
    CLOSED: { label: "Cerrado", tone: "neutral" },
    CANCELLED: { label: "Cancelado", tone: "danger" },
  } satisfies Record<PeriodStatus, StatusEntry>,
  appointment: {
    NOMINATED: { label: "Nominado", tone: "neutral" },
    ELECTED: { label: "Electo", tone: "info" },
    ACTIVE: { label: "Activo", tone: "success" },
    ENDED: { label: "Finalizado", tone: "neutral" },
    REVOKED: { label: "Revocado", tone: "danger" },
  } satisfies Record<AppointmentStatus, StatusEntry>,
  application: {
    DRAFT: { label: "Borrador", tone: "neutral" },
    SUBMITTED: { label: "Enviada", tone: "info" },
    APPROVED: { label: "Aprobada", tone: "success" },
    REJECTED: { label: "Rechazada", tone: "danger" },
    CANCELLED: { label: "Cancelada", tone: "neutral" },
    EXPIRED: { label: "Expirada", tone: "warning" },
  } satisfies Record<ApplicationStatus, StatusEntry>,
  transfer: {
    REQUESTED: { label: "Solicitada", tone: "info" },
    ACCEPTED_BY_DESTINATION: { label: "Aceptada por destino", tone: "info" },
    CONFIRMED_BY_ORIGIN: { label: "Confirmada por origen", tone: "info" },
    COMPLETED: { label: "Completada", tone: "success" },
    REJECTED: { label: "Rechazada", tone: "danger" },
    CANCELLED: { label: "Cancelada", tone: "neutral" },
    EXPIRED: { label: "Expirada", tone: "warning" },
  } satisfies Record<TransferStatus, StatusEntry>,
} as const;

export type StatusKind = keyof typeof catalog;
export type StatusOf<K extends StatusKind> = keyof (typeof catalog)[K];

function entry<K extends StatusKind>(
  kind: K,
  status: StatusOf<K>,
): StatusEntry {
  return (catalog[kind] as Record<PropertyKey, StatusEntry>)[status];
}

export function statusLabel<K extends StatusKind>(
  kind: K,
  status: StatusOf<K>,
): string {
  return entry(kind, status).label;
}

export function statusTone<K extends StatusKind>(
  kind: K,
  status: StatusOf<K>,
): BadgeTone {
  return entry(kind, status).tone;
}
