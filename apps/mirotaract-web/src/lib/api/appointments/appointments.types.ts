import type { components } from "../client/schema";

export type Appointment = components["schemas"]["Appointment"];
export type CreateAppointmentRequest =
  components["schemas"]["CreateAppointmentRequest"];
export type AppointmentStatus = components["schemas"]["AppointmentStatus"];

export type AppointmentFilters = {
  periodId?: string;
  positionCode?: string;
  membershipId?: string;
  status?: AppointmentStatus;
};
