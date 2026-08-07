import { StateMachine } from "../shared/state-machine";

export const accountStateMachine = new StateMachine<
  "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED"
>({
  PENDING_VERIFICATION: ["ACTIVE", "DISABLED"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  SUSPENDED: ["ACTIVE", "DISABLED"],
  DISABLED: [],
});
export const membershipStateMachine = new StateMachine<
  "PENDING" | "ACTIVE" | "ON_LEAVE" | "INACTIVE" | "GRADUATED" | "TRANSFERRED"
>({
  PENDING: ["ACTIVE", "INACTIVE"],
  ACTIVE: ["ON_LEAVE", "INACTIVE", "GRADUATED", "TRANSFERRED"],
  ON_LEAVE: ["ACTIVE"],
  INACTIVE: ["ACTIVE"],
  GRADUATED: [],
  TRANSFERRED: [],
});
export const periodStateMachine = new StateMachine<
  "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED"
>({
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
});
export const appointmentStateMachine = new StateMachine<
  "NOMINATED" | "ELECTED" | "ACTIVE" | "ENDED" | "REVOKED"
>({
  NOMINATED: ["ELECTED", "REVOKED"],
  ELECTED: ["ACTIVE", "REVOKED"],
  ACTIVE: ["ENDED", "REVOKED"],
  ENDED: [],
  REVOKED: [],
});
export const applicationStateMachine = new StateMachine<
  "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED"
>({
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
});
export const transferStateMachine = new StateMachine<
  | "REQUESTED"
  | "ACCEPTED_BY_DESTINATION"
  | "CONFIRMED_BY_ORIGIN"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
>({
  REQUESTED: ["ACCEPTED_BY_DESTINATION", "REJECTED", "CANCELLED", "EXPIRED"],
  ACCEPTED_BY_DESTINATION: [
    "CONFIRMED_BY_ORIGIN",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ],
  CONFIRMED_BY_ORIGIN: ["COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
});
export const installationStateMachine = new StateMachine<
  "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED"
>({
  PENDING: ["ACTIVE", "DISABLED"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  SUSPENDED: ["ACTIVE", "DISABLED"],
  DISABLED: [],
});
export const invitationStateMachine = new StateMachine<
  "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED"
>({
  PENDING: ["ACCEPTED", "EXPIRED", "REVOKED"],
  ACCEPTED: [],
  EXPIRED: [],
  REVOKED: [],
});
