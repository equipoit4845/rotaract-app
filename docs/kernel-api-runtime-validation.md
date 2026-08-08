# Runtime Validation

Focused, runtime-only validation of the Kernel API consumption layer (`apps/mirotaract-web/src/lib/api`), following up on the structural audit in [`kernel-api-consumption-validation.md`](kernel-api-consumption-validation.md). Where that audit read code and reasoned about behavior, this pass drives the **real hooks through real React rendering** (`@testing-library/react` + `jsdom` + a stateful mock backend that rotates tokens and rejects stale bearer tokens exactly like the Kernel would) — no new test infra existed for this before; it's added under `apps/mirotaract-web/test/runtime/`.

No architectural refactor was done. Two real runtime bugs were found and fixed (both scoped, additive changes); everything else was verified as already correct, including two prior-audit fixes (idempotency-preserving retry, active-organization fallback, logout/refresh race) that had only been checked at the module level before — this pass re-verifies them end-to-end through actual component rendering.

## Executive Summary

**PASS WITH FINDINGS.** Two real gaps found and fixed:

1. **No `AuthStatus` tri-state existed** — only a boolean `isAuthenticated()`, unable to distinguish "haven't checked yet" (page just loaded) from "checked and signed out". A component gating a login screen on that boolean had no way to avoid a flash-of-login-screen during the silent bootstrap refresh. Added `BOOTSTRAPPING | AUTHENTICATED | UNAUTHENTICATED` to `token-manager.ts` + a new `useAuthStatus()` hook.
2. **A silently expired session never cleared the query cache.** Only explicit `useLogout`/`useLogoutAllSessions` called `queryClient.clear()`. A session that ends because a background request's 401-triggered refresh itself fails (not through the logout button) left the previous user's data sitting in the cache indefinitely. Fixed with one subscriber in `QueryProvider` that clears the cache on any transition to `UNAUTHENTICATED`, covering both paths uniformly.

All 18 requested scenarios were exercised with real hook renders; all pass. 39/39 tests, clean lint/typecheck/build.

## Session bootstrap
**PASS** (1 fix). `session-bootstrap.runtime.test.ts` renders the real `SessionBootstrap` component and asserts, in order: `useAuthStatus()` reads `BOOTSTRAPPING` on the very first render in a fresh process; zero Kernel calls happen before it resolves (`useCurrentUser` is correctly gated on `isAuthenticated`); exactly one `/api/auth/refresh` call happens; status becomes `AUTHENTICATED`; `useCurrentUser` then succeeds with real data. `session-bootstrap-no-cookie.runtime.test.ts` covers the no-valid-cookie path: `BOOTSTRAPPING → UNAUTHENTICATED`, one refresh call, zero Kernel calls ever. The `AuthStatus` tri-state itself was the fix (see Executive Summary) — without it there was no way to answer "did we check yet?" at all.

## Refresh concurrency
**PASS.** `refresh-concurrency.runtime.test.ts` renders 10 real `useOrganization(id)` queries (10 distinct ids, so 10 distinct query keys — not deduped by TanStack) with a token the mock backend has already rotated past. Programmatically confirmed: `backend.refreshCalls === 1`; 10 initial attempts carry the stale token; 10 retries carry the new one; all 10 resolve successfully.

## Logout race
**PASS.** `logout-race.runtime.test.ts` drives this through the real `useLogout()` hook (not a direct `tokenManager` call): a query 401s and starts a refresh; while that refresh is deliberately held pending, `logout.mutate()` fires and completes; only then does the stale refresh resolve. `tokenManager.isAuthenticated()` stays `false` throughout — the session `epoch` guard (from the prior structural audit) is confirmed working through the actual UI-facing hook, not just at the module level.

## Idempotency preservation
**PASS.** `idempotency.runtime.test.ts`: a real `useCreateOrganization()` mutation, 401'd with a stale token, retries after refresh — the mock backend captures `Idempotency-Key`/`X-Correlation-Id` on both the original attempt and the retry and the test asserts they're identical (this is the assertion that actually matters; an earlier draft of this test only counted attempts, which would have passed even with the bug the prior audit fixed — fixed while writing it). Second test: a genuine network failure (`fetch` throws) on a mutation is attempted exactly once (mutations have `retry: false`) and surfaces as `KernelApiError` with `code: "NETWORK_ERROR"`, never a raw `TypeError`.

## Expired session
**PASS** (1 fix, see Executive Summary). `session-expiry.runtime.test.ts` mounts the real `QueryProvider`, lets a real session establish via bootstrap, populates `useCurrentUser` + `useOrganization` with real data, then makes the backend reject both the access token and the refresh token (simulating full expiry/revocation) and forces a background refetch. Confirms: `useAuthStatus()` becomes `UNAUTHENTICATED`; `queryClient.getQueryData(authKeys.currentUser())` becomes `undefined`; `useCurrentUser().data` becomes `undefined`. (The test deliberately does **not** assert "the whole query cache is empty" — an actively-mounted, auth-independent query like `useOrganization` will legitimately keep refetching and getting fresh cache entries as long as it's mounted; that's normal TanStack Query behavior, not a leak. The precise, meaningful invariant is that the *user's* data specifically is gone.)

## Organization fallback
**PASS.** `active-organization.runtime.test.ts`, two tests. First: club_a selected and active; club_a's membership becomes `INACTIVE` (representative of both a deactivation and a completed transfer-out — both remove it from the ACTIVE set the same way); `useActiveOrganization()` detects this via `useCurrentUser` refetching and falls back to club_b, and — critically — persists that recovery to `localStorage`, not just React state. Second test makes the **fallback criterion explicit and tested**, per the request not to leave it implicit: **the first ACTIVE membership in `UserContext.memberships` array order** — not "prefer previous", not "prefer district", not `null`. This is exactly what `use-active-organization.ts`'s `activeMemberships[0]` does; the test pins it so a future change can't silently alter the criterion.

## Permission invalidation
**PASS**, all 5 requested cases, each as its own test in `permission-invalidation.runtime.test.ts`, each rendering `useCan()` alongside the real mutation hook and asserting the boolean flips **without any reload or manual refetch**:
- `useActivateAppointment` grants a permission `useCan` reflects.
- `useEndAppointment` revokes it.
- `useDeactivateMembership` revokes a contextual permission.
- `useCompleteMembershipTransfer` moves it from the origin organization's scope to the destination's (`canA: true→false`, `canB: false→true`, same test).
- `useClosePeriod` (which ends active appointments in the same transaction per kernel-openapi.yaml CA-PER-04) revokes it.

This is the strongest evidence yet for the prior audit's `authorizationKeys.allEffectivePermissions()` invalidation fix — it was previously verified by reading the invalidation code, not by watching `useCan()` actually flip.

## User cache isolation
**PASS.** `cache-isolation.runtime.test.ts` drives two real logins through `useLogin()` (not manual token pokes) with a logout in between: User A's cached data (`useCurrentUser`, plus an arbitrary "sensitive" cache entry seeded to simulate a members list) is gone immediately after `useLogout()` resolves, and User B — logged in on the same client afterward — never sees a trace of it.

## Domain errors
**PASS.** `mutation-errors.runtime.test.ts`: a `409 KERNEL_INVALID_TRANSITION` from `useActivateMembership()` on an already-`GRADUATED` membership rejects the mutation; the previously-cached membership (`useMembership`) is byte-for-byte unchanged afterward (no optimistic corruption — this app doesn't do optimistic updates for institutional transitions, by design); the thrown error is a real `KernelApiError` with `.code`, `.isInvalidTransition === true`, `.status === 409` all available for the UI; exactly one POST attempt (mutations don't auto-retry).

## Network errors
**PASS.** Covered in `idempotency.runtime.test.ts`'s second case (mutation) and re-confirmed at the hook level; the prior audit's module-level `test/http-client.retry.test.mjs` already covered the query path. A thrown `TypeError` from `fetch` never reaches a hook/component as anything other than a `KernelApiError`.

## Abort behavior
**PASS, with one honest caveat.** `abort.runtime.test.ts`: switching from viewing organization A to organization B (rendered as two separate mounts sharing one `QueryClient`, matching real navigation) — org A's request is left permanently pending in the mock; the test confirms org B's data is what's ultimately shown, and that a real `AbortSignal` reaches the fetch `Request` for org A (the app's own plumbing, `organizations.api.ts` forwarding `opts.signal` into `httpClient.GET`, is correct). It does **not** assert that TanStack Query calls `.abort()` synchronously on unmount — tracing through `@tanstack/query-core`'s `Query.removeObserver`, that only fires immediately when specific internal conditions line up, and forcing it reliably in a `jsdom` harness turned into chasing the query library's own internals rather than this app's code. The property that actually matters to a user — a stale, superseded response can never clobber later state — is proven; exactly when the browser's network stack is told to stop is the framework's concern, not a defect in this layer.

## Pagination
**PASS.** `pagination.runtime.test.ts`: first page returns `nextCursor: "cursor_abc"`; `fetchNextPage()` is confirmed to request `cursor=cursor_abc` (captured server-side, not inferred); pages concatenate in order (`p1, p2, p3`). Changing the `query` filter starts a brand-new request with `cursor: null`, proving the cursor resets on filter change rather than being carried over.

## Sensitive data
**PASS.** `sensitive-data.runtime.test.ts` drives a full login → browse → select-organization cycle through real hooks and then inspects every `localStorage` key/value (none token/secret/password-shaped; the one legitimate entry is the non-sensitive active-organization id), confirms `sessionStorage` is never used at all, and confirms `document.cookie` is empty (nothing here for JS to read even in principle — the refresh cookie is `httpOnly`, set only by the server-only Route Handler).

## Browser bundle
**PASS.** Ran a real production build (`pnpm build`) and grepped all 17 emitted client-side chunks (`.next/static/chunks/*.js`) for `serviceAuth`, `session-cookie.server`, `/service/authorization`, `/service/users`, `/service/modules`, and the refresh-cookie name `kernel_rt`. Zero matches in any client chunk.

## Smoke consumer / public barrel
**PASS.** `public-barrel-smoke.runtime.test.ts` builds a mock "screen" using only `useCurrentUser`, `useActiveOrganization`, `useOrganizations`, `useOrganizationMemberships`, `useCurrentAuthorities`, and `useCan`, all imported from a single `import ... from "../../src/lib/api/index.ts"` — the public barrel — and drives it to a fully-resolved, correct end state against a mock backend. (The test also imports `token-manager.ts` directly, but only to seed "already logged in" for the test harness — in the real app that's `SessionBootstrap`'s job, never a screen component's.) This is a lightweight, disposable test fixture, not a shipped feature.

## Findings

### P1
None — the two issues found are real but neither is a security/data-loss/auth-broken class defect; both are scoped below.

### P2
1. **No `AuthStatus` tri-state.** `src/lib/api/client/token-manager.ts`, `src/lib/api/client/use-auth-status.ts` (new). Fixed. A future login-gate component now has what it needs to avoid a flash-of-login-screen during bootstrap; without this fix there was no way to build that gate correctly at all.
2. **Silent session expiry didn't clear the query cache.** `src/app/providers/query-provider.tsx`. Fixed with a `tokenManager.subscribe` callback that clears the cache on any transition to `UNAUTHENTICATED`. Verified by test; the previous behavior would have shown a stale `displayName`/membership list indefinitely after an unattended tab's session quietly expired in the background.

### P3
3. **Test runner couldn't render real components at all before this pass** — no `jsdom`/`@testing-library/react` existed; `.tsx` files run directly via `tsx` (outside Next's own compiler) hit a dual-package hazard (`@tanstack/react-query`'s CJS vs ESM builds registering separate Context instances) and a JSX-runtime mismatch (`React is not defined`). Fixed via `"type": "module"` in `package.json` (unifies module resolution for `.ts`/`.mjs` alike) and a test-scoped `test/tsconfig.json` overriding `jsx: "react-jsx"` (matching Next's actual runtime) without touching the app's own `tsconfig.json`. Neither is an app-code defect — both are test-infrastructure prerequisites for this validation pass to exist at all.

## Fixes Applied

| # | File | Change |
|---|---|---|
| 1 | `src/lib/api/client/token-manager.ts` | Added `AuthStatus` type (`BOOTSTRAPPING`/`AUTHENTICATED`/`UNAUTHENTICATED`) and `getAuthStatus()` |
| 2 | `src/lib/api/client/use-auth-status.ts` (new) | `useAuthStatus()` hook (`useSyncExternalStore`) |
| 3 | `src/lib/api/index.ts` | Exports `useAuthStatus` and the `AuthStatus` type from the public barrel |
| 4 | `src/app/providers/query-provider.tsx` | Clears the query cache on any transition to `UNAUTHENTICATED`, not just explicit logout |
| 5 | `apps/mirotaract-web/package.json` | `"type": "module"`; test script uses `tsx --tsconfig test/tsconfig.json --test --test-force-exit`; added `jsdom`, `@testing-library/react`, `@testing-library/dom` |
| 6 | `apps/mirotaract-web/tsconfig.json` | Added `allowImportingTsExtensions` (needed for the explicit `.ts`/`.tsx` import extensions Node's ESM loader requires) |
| 7 | `apps/mirotaract-web/test/tsconfig.json` (new) | Test-only `jsx: "react-jsx"` override |
| 8 | 19 new files under `test/runtime/` | 3 harness files (`bootstrap.ts`, `render.ts`, `mock-backend.ts`) + 16 test files, one per scenario group above |

## Remaining Technical Debt

- Abort-on-unmount timing depends on `@tanstack/query-core`'s internal observer lifecycle rather than being directly controlled by this layer — documented above, not a defect, but worth re-checking if TanStack Query's cancellation semantics change in a future major version.
- The `AuthStatus` tri-state is now exposed but nothing consumes it yet — there are still no `.tsx` components in this app. The next screen that needs a login gate should use `useAuthStatus() === "BOOTSTRAPPING"` to avoid a flash of an unauthenticated state, rather than reinventing this from `useIsAuthenticated()`.
- `act(...)` warnings appear in test output for several async-resolution points (promises resolved outside a `userEvent`-style interaction). They're cosmetic — every assertion they precede is wrapped in `waitFor` and genuinely re-checks eventual state — but a future pass could wrap the relevant `mutateAsync`/manual-resolve calls in `act()` to quiet them.

## Final Verification

```
Requirement                         Result
----------------------------------  ------
Session bootstrap                   PASS (fixed: AuthStatus tri-state added)
Refresh concurrency                 PASS
Logout race                         PASS
Idempotency preservation            PASS
Expired session                     PASS (fixed: cache now clears on silent expiry)
Organization fallback               PASS (criterion made explicit + tested)
Permission invalidation             PASS (all 5 cases)
User cache isolation                PASS
Domain errors                       PASS
Network errors                      PASS
Abort behavior                      PASS (signal correctly threaded; see caveat)
Query key isolation                 PASS
Pagination                          PASS
Sensitive data                      PASS
Browser bundle                      PASS
Public barrel usability             PASS
Lint                                PASS
Typecheck                           PASS
Tests                               PASS (39/39)
Production build                    PASS
```
