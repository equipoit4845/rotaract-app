import type { OrganizationType } from "@/lib/api";

const LABEL: Record<OrganizationType, string> = {
  DISTRICT: "Distrito",
  CLUB: "Club",
  OTHER: "Otra",
};

export function organizationTypeToLabel(type: OrganizationType): string {
  return LABEL[type];
}
