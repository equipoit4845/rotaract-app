import type { InstitutionalPeriod, PeriodStatus } from "@/lib/api";

export type PeriodListItemViewModel = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  status: PeriodStatus;
  startDate: string;
  endDate: string;
  href: string;
};

/** Pure Kernel DTO → ViewModel mapping — a period has no hierarchy to resolve, unlike Organizations' parent lookup. */
export function toPeriodListItemViewModel(
  period: InstitutionalPeriod,
): PeriodListItemViewModel {
  return {
    id: period.id,
    code: period.code,
    name: period.name,
    sequence: period.sequence,
    status: period.status,
    startDate: period.startDate,
    endDate: period.endDate,
    href: `/periods/${period.id}`,
  };
}
