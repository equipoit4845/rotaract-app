/**
 * Which positions get a mailbox and the address of each position's alias.
 * Mirrors the `positions` default of mirotaract.module.json; the module's
 * installation configuration is not read yet (the app has no
 * `kernel.service.modules.read`).
 */
export const MAILBOX_POSITIONS: ReadonlyArray<{ positionCode: string; alias: string; label: string }> = [
  { positionCode: 'DISTRICT_RDR', alias: 'rdr', label: 'Representación Distrital' },
  { positionCode: 'DISTRICT_SECRETARY', alias: 'secretaria', label: 'Secretaría Distrital' },
  { positionCode: 'DISTRICT_TREASURER', alias: 'tesoreria', label: 'Tesorería Distrital' },
  { positionCode: 'DISTRICT_COMITE_IT', alias: 'it', label: 'Comité IT' },
];

export const positionConfig = (positionCode: string) =>
  MAILBOX_POSITIONS.find((p) => p.positionCode === positionCode) ?? null;

/** Days a personal mailbox stays readable after its mandate ends (manifest `graceDays`). */
export function graceDays(): number {
  const raw = Number(process.env.CORREO_GRACE_DAYS ?? 30);
  return Number.isFinite(raw) && raw >= 0 && raw <= 90 ? raw : 30;
}
