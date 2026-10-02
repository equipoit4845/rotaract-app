import type { Club } from '@/lib/api';

/**
 * Quorum base (legacy `club-status.service.ts`): ACTIVE clubs that are
 * constituidos, with cuota and informe al día, and enabled for district
 * meetings. `isConstituido` missing (older API) counts as true.
 */
export function isHabilitado(club: Club): boolean {
  return (
    club.status === 'ACTIVE' &&
    (club.isConstituido ?? true) &&
    club.cuotaAldia &&
    club.informeAlDia &&
    club.enabledForDistrictMeetings
  );
}

/** Legacy quorum: `Math.ceil(base * 2 / 3)`. */
export function quorumRequired(base: number): number {
  return Math.ceil((base * 2) / 3);
}

export type StandingFlag = 'isConstituido' | 'cuotaAldia' | 'informeAlDia' | 'enabledForDistrictMeetings';

export const STANDING_FLAGS: { key: StandingFlag; label: string }[] = [
  { key: 'isConstituido', label: 'Constituido' },
  { key: 'cuotaAldia', label: 'Cuota al día' },
  { key: 'informeAlDia', label: 'Informe al día' },
  { key: 'enabledForDistrictMeetings', label: 'Participa en reuniones' },
];
