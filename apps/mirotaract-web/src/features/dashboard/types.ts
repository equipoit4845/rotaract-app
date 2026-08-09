/**
 * Local shapes only — never a place to redefine what `@/lib/api` already
 * exports. Kernel DTOs (`Organization`, `Appointment`, ...) flow in as-is
 * until an adapter narrows them to something a Design System component
 * actually accepts (a tone, a formatted date, a display name).
 */
export type DashboardScope = "DISTRICT" | "CLUB";
