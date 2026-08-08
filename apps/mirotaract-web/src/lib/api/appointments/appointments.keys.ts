import type { AppointmentFilters } from "./appointments.types";

export const appointmentKeys = {
  all: ["appointments"] as const,
  lists: () => [...appointmentKeys.all, "list"] as const,
  list: (organizationId: string, filters: AppointmentFilters) =>
    [...appointmentKeys.lists(), organizationId, filters] as const,
  currentAuthorities: (organizationId: string) =>
    [...appointmentKeys.all, "currentAuthorities", organizationId] as const,
  detail: (id: string) => [...appointmentKeys.all, "detail", id] as const,
};
