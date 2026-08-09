"use client";

import { DataState } from "@equipoit4845/admin-shell";

/**
 * `BLOCKED_API` (docs/09-administrative-web.md, Área 2 preflight notes):
 * `kernel-openapi.yaml` has no operation that resolves a `UserAccount`
 * from a `personId` — `GET /auth/me` only returns the caller's own
 * account, and the account-lifecycle routes
 * (`/auth/accounts/{accountId}/...`) require an `accountId` nothing
 * exposes starting from a person. Rather than guess or leave this tab
 * silently empty, it says exactly why it can't show anything real yet.
 */
export function PersonAccountTab() {
  return (
    <DataState
      kind="empty"
      title="No disponible con el contrato actual"
      description="El Kernel no expone una forma de consultar la cuenta vinculada a una persona a partir de su personId (sólo la cuenta propia vía /auth/me). Documentado como BLOCKED_API en docs/09-administrative-web.md."
    />
  );
}
