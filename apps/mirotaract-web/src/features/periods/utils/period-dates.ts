/**
 * CA-PER-01/01a (kernel-spec.md §6.5.1/§6.5.2, kernel-openapi.yaml
 * `CreatePeriodRequest`/`UpdatePeriodRequest`): a Rotary period always runs
 * exactly 1 de julio → 30 de junio del año siguiente. This only decides
 * which submissions the form *offers* to send — the Kernel re-validates
 * every date server-side regardless (422 otherwise), this is purely to
 * give the person a fast, obvious client-side error instead of a round
 * trip for an obviously-invalid date.
 *
 * Kernel dates here are `format: date` (`YYYY-MM-DD`), which is exactly
 * what a native `<input type="date">` produces — compared as strings, no
 * `Date` object, so there's no timezone-shift risk.
 */
export function isValidPeriodStartDate(startDate: string): boolean {
  return /^\d{4}-07-01$/.test(startDate);
}

export function isValidPeriodEndDate(
  startDate: string | undefined,
  endDate: string,
): boolean {
  const match = /^(\d{4})-07-01$/.exec(startDate ?? "");
  if (!match) return false;
  const nextYear = Number(match[1]) + 1;
  return endDate === `${nextYear}-06-30`;
}
