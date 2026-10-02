import { Role } from './role';

export type RoleInputs = {
  /** Kernel platformRole, when known (USER | SUPERADMIN). */
  platformRole?: string | null;
  /** Local DistrictStaff row, if any. */
  staffRole?: 'SUPERADMIN' | 'SECRETARY' | null;
  /** ACTIVE district appointments (DISTRICT_RDR, DISTRICT_SECRETARY). */
  districtRoles?: readonly ('RDR' | 'SECRETARY')[];
  /** ACTIVE CLUB_PRESIDENT appointment in some club (active membership). */
  isPresident?: boolean;
};

/**
 * Role of a person for the meetings module, computed from the directory
 * (contract §Roles). Precedence when a person holds several:
 * SUPERADMIN > RDR > SECRETARY > PRESIDENT > PARTICIPANT.
 */
export function resolveRole(input: RoleInputs): Role {
  if (input.platformRole === 'SUPERADMIN' || input.staffRole === 'SUPERADMIN') {
    return Role.SUPERADMIN;
  }
  const district = input.districtRoles ?? [];
  if (district.includes('RDR')) return Role.RDR;
  if (district.includes('SECRETARY') || input.staffRole === 'SECRETARY') return Role.SECRETARY;
  if (input.isPresident) return Role.PRESIDENT;
  return Role.PARTICIPANT;
}
