import type { OrganizationStatus } from "@/lib/api";
import type { MrStateTone } from "@equipoit4845/design-tokens";

const LABEL: Record<OrganizationStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  ARCHIVED: "Archivado",
};

export function organizationStatusToTone(
  status: OrganizationStatus,
): MrStateTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INACTIVE":
      return "warning";
    case "DRAFT":
      return "neutral";
    case "ARCHIVED":
      return "neutral";
  }
}

export function organizationStatusToLabel(status: OrganizationStatus): string {
  return LABEL[status];
}
