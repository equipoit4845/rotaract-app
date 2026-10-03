import type {
  AppAudience,
  DeveloperApp,
  DeveloperAppQuota,
  ReviewChecklist,
} from "@/lib/api";

/**
 * E11 in plain Spanish (docs/18-data-governance.md). The screens never show
 * scope codes or enum values: only these labels.
 */
export const CHECKLIST_ITEMS: Array<{
  key: keyof ReviewChecklist;
  label: string;
  hint: string;
}> = [
  {
    key: "purpose",
    label: "Propósito",
    hint: "Está claro para qué es la app y es una necesidad del club o del distrito.",
  },
  {
    key: "data",
    label: "Datos que pide",
    hint: "Pide solo los datos que necesita para ese propósito.",
  },
  {
    key: "owner",
    label: "Responsable",
    hint: "Hay una persona identificada que responde por la app.",
  },
  {
    key: "privacyPolicy",
    label: "Política de privacidad",
    hint: "Tiene una política publicada que dice qué guarda, para qué y por cuánto tiempo.",
  },
  {
    key: "contact",
    label: "Contacto",
    hint: "Tiene un correo de contacto que responde.",
  },
];

export const EMPTY_CHECKLIST: ReviewChecklist = {
  purpose: false,
  data: false,
  owner: false,
  privacyPolicy: false,
  contact: false,
};

export const AUDIENCE_OPTIONS: Array<{ value: AppAudience; label: string }> = [
  { value: "DISTRICT_MEMBERS", label: "Todas las personas del distrito" },
  { value: "CLUB_PRESIDENTS", label: "Presidencias de club" },
  { value: "CLUB_AUTHORITIES", label: "Autoridades de club (cualquier cargo)" },
  { value: "DISTRICT_AUTHORITIES", label: "Autoridades del distrito" },
  { value: "POSITIONS", label: "Cargos específicos" },
];

export function audienceLabel(value: string): string {
  return AUDIENCE_OPTIONS.find((option) => option.value === value)?.label ?? "";
}

/** "Presidencias de club y autoridades del distrito". */
export function describeAudiences(audiences: string[]): string {
  const labels = audiences.map(audienceLabel).filter(Boolean);
  if (labels.length === 0) return "Nadie todavía";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1].toLowerCase()}`;
}

export const REVIEW_KIND_LABEL: Record<string, string> = {
  SUBMITTED: "Enviada a revisión",
  APPROVED: "Aprobada",
  REJECTED: "Cambios pedidos",
  REOPENED: "Pidió datos nuevos",
  AUTO_APPROVED: "Aprobada automáticamente",
};

/** Service data the Kernel issues while an app is in review (no personal data). */
export const REVIEW_SAFE_DATA = [
  "kernel.service.organizations.read",
  "kernel.service.periods.read",
  "kernel.service.modules.read",
];

/** What is limited for an app until the district approves what it asks. */
export function reviewLimitations(app: DeveloperApp): string[] {
  const pending = app.scopes.filter(
    (scope) => !(app.approvedScopes ?? []).includes(scope),
  );
  if (pending.length === 0) return [];
  const items: string[] = [];
  if (app.grantTypes.includes("authorization_code"))
    items.push(
      "Solo pueden ingresar con Mi Rotaract la persona responsable y las cuentas de prueba.",
    );
  if (app.grantTypes.includes("client_credentials"))
    items.push(
      "La app solo puede leer por su cuenta datos que no son personales (clubes, distrito, períodos y módulos).",
    );
  items.push("No le llegan avisos (webhooks) con datos personales.");
  if (!app.approvedAt)
    items.push(
      "Tiene límites de uso más bajos (20 pedidos por minuto, 1000 por día).",
    );
  items.push("No se puede mostrar a los socios en el panel de Mi Rotaract.");
  return items;
}

export const QUOTA_SOURCE_LABEL: Record<DeveloperAppQuota["source"], string> = {
  default: "Los límites del distrito",
  review: "Los límites de una app en revisión",
  custom: "Límites propios fijados por el RDR",
};

export function formatNumber(value: number): string {
  return value.toLocaleString("es-AR");
}

export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}
