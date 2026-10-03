import { BadRequestException } from "@nestjs/common";

import { isServiceScope } from "../oauth/scopes";

/**
 * E11.1 — what an app may do before (and beyond) the district's approval.
 * docs/18-data-governance.md §"Revisión de apps". Pure, unit-tested.
 *
 * - `approvedScopes` are the scopes the RDR approved; they work for
 *   everybody. A never-approved app has none.
 * - Anything else ("en revisión") only works for the app's owner and its
 *   test accounts (sign-in), and — for the app's own service token — only
 *   the scopes that carry no personal data (REVIEW_SAFE_SERVICE_SCOPES).
 */
export const REVIEW_SAFE_SERVICE_SCOPES: readonly string[] = [
  "kernel.service.organizations.read",
  "kernel.service.periods.read",
  "kernel.service.modules.read",
];

export type ReviewedApp = {
  scopes: string[];
  approvedScopes: string[];
  approvedAt?: Date | string | null;
};

/** The checklist the RDR goes through (E11.1), in display order. */
export const REVIEW_CHECKLIST = [
  "purpose",
  "data",
  "owner",
  "privacyPolicy",
  "contact",
] as const;
export type ReviewChecklistItem = (typeof REVIEW_CHECKLIST)[number];
export type ReviewChecklist = Record<ReviewChecklistItem, boolean>;

export const MAX_TEST_ACCOUNTS = 20;

/** Scopes the app has that the district has not approved (yet). */
export function pendingScopes(app: ReviewedApp): string[] {
  return app.scopes.filter((scope) => !app.approvedScopes.includes(scope));
}

/** Whether the app ever got production access (an approval). */
export function isProductionApp(app: ReviewedApp): boolean {
  return !!app.approvedAt;
}

/**
 * Service scopes the app's own token (client_credentials) may carry:
 * approved ones, plus the no-personal-data ones while in review.
 */
export function effectiveServiceScopes(app: ReviewedApp): string[] {
  return app.scopes.filter(
    (scope) =>
      isServiceScope(scope) &&
      (app.approvedScopes.includes(scope) ||
        REVIEW_SAFE_SERVICE_SCOPES.includes(scope)),
  );
}

/**
 * Whether a person may use `requested` scopes with the app through
 * "Ingresar con Mi Rotaract": always for approved scopes; for the rest,
 * only the owner and the test accounts.
 */
export function maySignIn(
  app: ReviewedApp & { ownerPersonId: string; testAccountEmails: string[] },
  person: { personId: string; email?: string | null },
  requested: string[],
): boolean {
  if (requested.every((scope) => app.approvedScopes.includes(scope)))
    return true;
  return isTester(app, person);
}

export function isTester(
  app: { ownerPersonId: string; testAccountEmails: string[] },
  person: { personId: string; email?: string | null },
): boolean {
  if (person.personId === app.ownerPersonId) return true;
  const email = person.email?.trim().toLowerCase();
  return (
    !!email &&
    app.testAccountEmails.some((item) => item.toLowerCase() === email)
  );
}

export const IN_REVIEW_SIGN_IN_MESSAGE =
  "Esta app todavía está en revisión del distrito: por ahora solo pueden ingresar su responsable y las cuentas de prueba.";

/**
 * After an edit: approved scopes the app no longer has are dropped, and
 * the review reopens if the app now asks for something not approved yet.
 * Returns undefined when nothing about the review changes.
 */
export function reviewAfterScopeChange(
  app: ReviewedApp & { reviewStatus: string },
  nextScopes: string[],
):
  | {
      approvedScopes: string[];
      reviewStatus: "IN_REVIEW" | "APPROVED" | "REJECTED";
      reopened: boolean;
    }
  | undefined {
  const approvedScopes = app.approvedScopes.filter((scope) =>
    nextScopes.includes(scope),
  );
  const pending = nextScopes.filter((scope) => !approvedScopes.includes(scope));
  let reviewStatus = app.reviewStatus as "IN_REVIEW" | "APPROVED" | "REJECTED";
  let reopened = false;
  if (pending.length > 0 && reviewStatus === "APPROVED") {
    reviewStatus = "IN_REVIEW";
    reopened = true;
  } else if (
    pending.length === 0 &&
    isProductionApp(app) &&
    reviewStatus !== "APPROVED"
  ) {
    // Nothing new left to review (the extra data was removed again).
    reviewStatus = "APPROVED";
  }
  const unchanged =
    reviewStatus === app.reviewStatus &&
    approvedScopes.length === app.approvedScopes.length;
  return unchanged ? undefined : { approvedScopes, reviewStatus, reopened };
}

function bad(message: string): never {
  throw new BadRequestException(message);
}

export type GovernanceFields = {
  purpose?: string | null;
  privacyPolicyUrl?: string | null;
  contactEmail?: string | null;
  testAccountEmails?: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the checklist data a developer fills in (create / edit). */
export function validateGovernanceFields(
  input: Record<string, unknown>,
): GovernanceFields {
  const out: GovernanceFields = {};
  if ("purpose" in input) {
    const value = input.purpose;
    if (value !== null && typeof value !== "string")
      bad("El propósito debe ser un texto");
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > 1000)
      bad("El propósito puede tener hasta 1000 caracteres");
    out.purpose = text || null;
  }
  if ("privacyPolicyUrl" in input) {
    const value = input.privacyPolicyUrl;
    if (value !== null && typeof value !== "string")
      bad("La política de privacidad debe ser una URL");
    const text = typeof value === "string" ? value.trim() : "";
    if (text) {
      let url: URL | undefined;
      try {
        url = new URL(text);
      } catch {
        url = undefined;
      }
      if (!url || url.protocol !== "https:")
        bad("La política de privacidad debe ser una URL https");
    }
    out.privacyPolicyUrl = text || null;
  }
  if ("contactEmail" in input) {
    const value = input.contactEmail;
    if (value !== null && typeof value !== "string")
      bad("El contacto debe ser un correo electrónico");
    const text = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (text && !EMAIL.test(text))
      bad("El contacto debe ser un correo electrónico válido");
    out.contactEmail = text || null;
  }
  if ("testAccountEmails" in input) {
    const value = input.testAccountEmails;
    if (
      value !== null &&
      (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    )
      bad("Las cuentas de prueba deben ser una lista de correos");
    const emails = [
      ...new Set(
        ((value as string[] | null) ?? [])
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    for (const email of emails)
      if (!EMAIL.test(email))
        bad(`La cuenta de prueba ${email} no es un correo válido`);
    if (emails.length > MAX_TEST_ACCOUNTS)
      bad(`Podés cargar hasta ${MAX_TEST_ACCOUNTS} cuentas de prueba`);
    out.testAccountEmails = emails;
  }
  return out;
}

export type ReviewDecision = {
  decision: "approve" | "reject";
  checklist: ReviewChecklist;
  reason: string | null;
};

/**
 * The RDR's decision. Approving needs every checklist item ticked and the
 * data behind it present; rejecting needs a reason the developer can act on.
 */
export function validateReviewDecision(
  input: Record<string, unknown>,
  app: {
    purpose: string | null;
    privacyPolicyUrl: string | null;
    contactEmail: string | null;
  },
): ReviewDecision {
  const decision = input.decision;
  if (decision !== "approve" && decision !== "reject")
    bad('La decisión debe ser "approve" o "reject"');
  const raw = (input.checklist ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    bad("La lista de control es obligatoria");
  const checklist = Object.fromEntries(
    REVIEW_CHECKLIST.map((item) => [item, raw[item] === true]),
  ) as ReviewChecklist;
  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim()
      : null;
  if (reason && reason.length > 1000)
    bad("El motivo puede tener hasta 1000 caracteres");
  if (decision === "approve") {
    const missing: string[] = [];
    if (!app.purpose) missing.push("el propósito");
    if (!app.privacyPolicyUrl) missing.push("la política de privacidad");
    if (!app.contactEmail) missing.push("el contacto");
    if (missing.length)
      bad(`No se puede aprobar: la app todavía no cargó ${missing.join(", ")}`);
    const unchecked = REVIEW_CHECKLIST.filter((item) => !checklist[item]);
    if (unchecked.length)
      bad(
        "Para aprobar, marcá todos los puntos de la lista de control como revisados",
      );
  } else if (!reason || reason.length < 10) {
    bad(
      "Para rechazar, escribí un motivo (al menos 10 caracteres) que le diga al equipo qué cambiar",
    );
  }
  return { decision, checklist, reason };
}
