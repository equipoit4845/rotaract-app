/**
 * Legacy role names, kept 1:1 so the ported @Roles guards keep working.
 * Never stored: resolved per request from the directory (role-resolution.ts).
 */
export const Role = {
  PARTICIPANT: 'PARTICIPANT',
  SECRETARY: 'SECRETARY',
  PRESIDENT: 'PRESIDENT',
  RDR: 'RDR',
  COMPANY: 'COMPANY',
  SUPERADMIN: 'SUPERADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const DISTRICT_ADMIN_ROLES: readonly Role[] = [Role.SECRETARY, Role.RDR, Role.SUPERADMIN];

export function isDistrictAdmin(role: Role | string | null | undefined): boolean {
  return role === Role.SECRETARY || role === Role.RDR || role === Role.SUPERADMIN;
}
