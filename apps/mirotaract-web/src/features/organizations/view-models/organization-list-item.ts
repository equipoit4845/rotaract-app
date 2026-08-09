import type {
  Organization,
  OrganizationStatus,
  OrganizationType,
} from "@/lib/api";

export type OrganizationListItemViewModel = {
  id: string;
  name: string;
  code: string;
  type: OrganizationType;
  status: OrganizationStatus;
  parentId: string | null;
  href: string;
};

/**
 * Pure Kernel DTO → ViewModel mapping. `parentId` is kept as-is, not
 * resolved to a name here — resolving a parent's display name is a
 * per-row concern (`OrganizationParentCell`) because it needs its own
 * bounded hook call, and hooks can't run inside a plain array mapper.
 */
export function toOrganizationListItemViewModel(
  organization: Organization,
): OrganizationListItemViewModel {
  return {
    id: organization.id,
    name: organization.name,
    code: organization.code,
    type: organization.type,
    status: organization.status,
    parentId: organization.parentId ?? null,
    href: `/organizations/${organization.id}`,
  };
}
