import type { AppointmentStatus } from "@/lib/api";

/**
 * Local shapes only — never a place to redefine what `@/lib/api` already
 * exports. `Appointment` flows in as-is until an adapter narrows it to
 * something a Design System component actually accepts.
 */
export type AppointmentListFilters = {
  organizationId: string | undefined;
  periodId?: string;
  positionCode?: string;
  status?: AppointmentStatus;
};
