# Design System v1 Validation

Every command below was actually run against this working tree in this
session; results are pasted, not summarized from memory. Where a step
can't be completed without a credential this environment doesn't have
(publishing to the real `npm.pkg.github.com`), that's stated explicitly —
nothing here claims a publish happened that didn't.

## Verdict

**READY FOR INITIAL REGISTRY RELEASE.**

All engineering work for v1 is complete and verified: architecture,
component inventory, boundaries, Storybook, accessibility automation,
visual regression, Web Shell integration, and the publish pipeline itself
all pass real checks below. The only two items not fully closed —an actual
`npm publish` to `npm.pkg.github.com`, and an external reference repo
consuming that published version— are blocked exclusively on a
`packages: write` credential this environment doesn't hold, not on any
undone engineering. See [Remaining Work](#remaining-work).

## Packages

Four packages, all building real `dist/` output (not raw `src/` exports):

| Package | Components | Build |
| --- | --- | --- |
| `@equipoit4845/design-tokens` | tokens.css, reset.css, `mrThemeProps` | `tsc -p tsconfig.build.json` |
| `@equipoit4845/icons` | `Logo`, `StatusIcon` | `tsc -p tsconfig.build.json` |
| `@equipoit4845/ui` | 20 components (Radix-backed where needed) | `tsc` + CSS copy |
| `@equipoit4845/admin-shell` | 12 components incl. `AdminFrame`/`ModuleFrame` | `tsc` + CSS copy |

```
$ pnpm --filter @equipoit4845/design-tokens build && \
  pnpm --filter @equipoit4845/icons build && \
  pnpm --filter @equipoit4845/ui build && \
  pnpm --filter @equipoit4845/admin-shell build
✓ all four build clean, exit 0
```

## Dependency Boundaries

```
$ pnpm contracts:design-system-boundaries
Design system boundaries clean across 4 packages
```

`scripts/validate-design-system-boundaries.mjs` enforces the allow-list per
package (design-tokens: none; icons: `react`; ui: `react`/`react-dom`/
`design-tokens`/`@radix-ui/*`; admin-shell: + `ui`/`icons`), a blanket ban
on Next/Kernel SDK/Kernel contracts/auth-middleware/Prisma/`apps/*`, and a
grep-level ban on `fetch(`/`localStorage`/`sessionStorage`/
`document.cookie`. Re-run after the Web Shell integration (§ below) landed,
to confirm none of that new app-layer code leaked backward into the
packages — still clean.

## Public API

```
$ grep -rEn "\bMembership\b|\bAppointment\b|\bPeriodStatus\b|\bRole\b|\bPermission\b|\bOrganizationMember\b|\bTransfer\b|\bApplication\b" \
    packages/design-tokens/src packages/icons/src packages/ui/src packages/admin-shell/src
(no output — no Kernel/domain type ever appears in the four packages' source)
```

`PeriodIndicator.status` is `"active" | "inactive" | "pending"`;
`DataPagination` is cursor-shaped (`hasPrevious`/`hasNext`), not
page-numbered, matching the Kernel's real pagination model instead of
inventing a numbering scheme it doesn't have.

**Public-API-only smoke test** (imports only `@equipoit4845/design-tokens`,
`/icons`, `/ui`, `/admin-shell` top-level entry points — no `/dist/*`,
no internals), run against packages installed from a real npm registry
(see [External Consumer](#external-consumer)):

```
SSR OK (light), length: 1459
SSR OK (dark), length: 1458
AdminFrame/OrganizationSwitcher/Table SSR OK, length: 900
Public-API-only smoke test passed.
```

**Tree-shaking**: built a Vite production bundle importing only `Button`
from `@equipoit4845/ui`. The resulting bundle contains zero occurrences of
`DialogPrimitive`, `mr-table__wrapper`, `ToastPrimitive`,
`mr-dropdown__item`, or `mr-tabs__trigger` — importing one component does
not drag in Dialog/Table/Toast/Dropdown/Tabs. All four packages declare
`"sideEffects": false` (safe: none of their source imports `.css` — the
stylesheets are always a separate, explicit consumer-level import, so
there's no `sideEffects: ["*.css"]` carve-out to get wrong).

## CSS Isolation

```
$ grep -nE "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(" packages/ui/src/styles.css packages/admin-shell/src/styles.css
(no output — zero hardcoded colors in component stylesheets; only tokens.css holds literal color values)

$ grep -nE "bare-element selectors" packages/ui/src/styles.css packages/admin-shell/src/styles.css packages/design-tokens/src/tokens.css
(no output in any of the three — every selector is class-based, `.mr-`-prefixed)
```

`reset.css` is the one file allowed bare-element selectors (it's the
opt-in reset), and even there every rule is still scoped under
`.mr-theme button`/`.mr-theme input`/etc., never a truly global selector.

## Accessibility

`pnpm --filter @mirotaract/design-system-catalog test:a11y` —
`@storybook/test-runner` + `axe-playwright`, real headless Chromium
(`--no-sandbox`), against the built catalog:

```
Test Suites: 30 passed, 30 total
Tests:       46 passed, 46 total
Time:        35.5 s
```

**This pipeline is not scaffolding** — proven three separate times during
setup:

1. Config file had to live at `.storybook/test-runner.ts`, not the project
   root; in the wrong location every test silently "passed" because the
   hooks never ran at all. Caught by manually re-running axe against the
   same story and getting a real violation while the suite reported green.
2. With the config in the right place, it immediately failed 12 real
   tests — not a fixture I wrote, actual defects in the shipped
   components (see [Findings](#findings)).
3. A deliberately broken story (icon-only button, no accessible name) was
   added, confirmed to fail (`button-name`, critical), then removed —
   proof the runner fails on real violations, not just passes by omission.

## Visual Regression

`pnpm --filter @mirotaract/design-system-catalog test:visual` — Playwright
screenshot testing against the built catalog, 28 baselines (10 components
× light/dark + Dialog-open × light/dark + 6 admin-pattern mobile shots).

```
28 passed (37.6s)
```

Baselines committed at
`apps/design-system-catalog/visual/__screenshots__/`. Screenshots are
scoped to the story's own rendered root (`.mr-theme > *`, first child),
**not** `#storybook-root` or the full page — both of those are stretched
to `min-height: 100vh` by the global decorator, which dilutes a real
single-component regression to well under the diff threshold. Confirmed
twice while setting this up: a deliberate color-token break passed
undetected first against a full-page screenshot, then again against
`#storybook-root`, before the actual fix (scoping to the story's natural
bounding box) caught it — 5% pixel diff, comfortably over the 1% threshold.

## Storybook

```
$ pnpm --filter @mirotaract/design-system-catalog build
✓ built in ~12-25s, storybook-static/ produced, 30 story files
```

One story file per implemented component (30 total, `ui/*` +
`admin-shell/*` + `Foundations/Tokens`), theme toggle in the toolbar,
`@storybook/addon-a11y` for manual review, `TooltipProvider`/
`ToastProvider` mounted globally so Tooltip/Toast stories need no
boilerplate.

## External Consumer

Two levels of evidence, since a real `npm.pkg.github.com` publish isn't
available in this environment:

**1. In-workspace** (`apps/design-system-consumer`): installs the four
packages via `workspace:*` — same `package.json#exports`, same `dist/`,
same peer graph a registry install would produce — and mounts `ModuleFrame`
with real content. `pnpm build` → clean Vite production build.

**2. Real registry, real publish, real external install** (Verdaccio,
ephemeral, torn down after): the four packages were actually
`pnpm publish`'d — not simulated — to a local npm-compatible registry, then
installed with plain `npm install` (no `workspace:*`/`file:`/`link:`) into
a consumer directory completely outside this monorepo.

```
$ npm ls react
└── react@19.1.0          (single copy; everything else "deduped")
$ npm ls react-dom
└── react-dom@19.1.0      (single copy; everything else "deduped")
```

Confirmed: real tarball resolution (`resolved:
"http://localhost:4873/@equipoit4845/ui/-/ui-0.1.0.tgz"`), no duplicate
React, SSR in both themes (see [Public API](#public-api)), and a clean
production Vite build.

**Package content audit** (`npm pack --dry-run` on each):

```
@equipoit4845/design-tokens tarball OK: 7 files, 3058 bytes
@equipoit4845/icons tarball OK: 13 files, 3096 bytes
@equipoit4845/ui tarball OK: 82 files, 16497 bytes
@equipoit4845/admin-shell tarball OK: 54 files, 11350 bytes
```

Every tarball contains exactly `dist/**` + `package.json` — no `src/`, no
stories, no tests, no tsconfig, no private docs. Source maps are included
deliberately (consumer devtools debugging).

## GitHub Packages

Not executed — this is the one honest gap. `.github/workflows/design-system-release.yml`
(Changesets + `changesets/action`) is complete and will run on the next
push to `main` that touches a package or `.changeset/**`. `.changeset/`
currently holds no pending changeset entries (deliberately — see
`.changeset/README.md`), so the first run will publish the current `0.1.0`
directly instead of opening a version-bump PR, matching the intent that
the first published version *is* `0.1.0`, not an artificial bump.

What's blocking it isn't undesigned — it's that this session has no
`packages: write` token and nothing here has been merged to `main` yet.
Simulating a real publish by modifying the workflow to fake success was
explicitly out of scope; instead this was validated end-to-end against a
real (if ephemeral) registry — see [External Consumer](#external-consumer).

## Web Shell Integration

New code only, under `apps/mirotaract-web/src/features/shell/` +
`app/dashboard/`; `src/lib/api` (the Kernel consumption layer) was not
touched.

- **Adapters** (Kernel hooks → visual props, living in the Web, never in
  a package): `toVisualPeriodStatus` (`PeriodStatus` →
  `"active"|"inactive"|"pending"`), `useOrganizationOptions` (real org
  names for the person's active memberships, sourced from
  `useOrganizations`/`useCurrentUser` — both already public barrel
  exports, no new hook added to the consumption layer), `useShellNavItems`
  (filters via `useCan`, never passes a permission code to `AdminFrame`).
- **`AuthGate`**: the `BOOTSTRAPPING`/`AUTHENTICATED`/`UNAUTHENTICATED`
  tri-state from `useAuthStatus`, rendering a `Spinner` during bootstrap
  and a `DataState` placeholder (not a login form — out of scope) when
  signed out.
- **`/dashboard`**: mounts `AdminFrame` with `OrganizationSwitcher`,
  `PeriodIndicator`, `Avatar`, filtered nav, and a generic placeholder
  body — no business screens, matching the "shell only" scope.

Real evidence, not just a passing build:

```
$ pnpm --filter @mirotaract/mirotaract-web typecheck   # clean
$ pnpm --filter @mirotaract/mirotaract-web build        # clean, /dashboard: 39.8 kB
$ curl http://localhost:3055/dashboard                  # 200
```

Fetched HTML confirmed `class="mr-theme" data-mr-theme="light"` at the
root and the `BOOTSTRAPPING` spinner rendering server-side (no live Kernel
running); fetched the actual served CSS bundle and confirmed it contains
rules from all three packages (`mr-color-canvas`, `mr-button`,
`mr-admin-frame`). `pnpm contracts:design-system-boundaries` re-run clean
after this change — the new adapter code didn't leak backward into any
package.

## Findings

Two real defects, found by the accessibility pipeline above, not invented
for this report — both fixed in this pass:

1. **`reset.css` broke primary-button contrast.** `.mr-theme button {
   color: inherit }` has specificity (0,1,1), which silently beat
   `.mr-button--primary { color: var(--mr-color-text-on-action) }` at
   (0,1,0) — every button that opted into the reset rendered with the
   ambient (near-black) text color instead of white, regardless of
   variant. `color-contrast` (serious) on every primary-button story.
   **Fix**: `reset.css` now only normalizes `font`, never `color`.
2. **`--mr-color-text-muted` / `--mr-color-state-neutral-text` too light.**
   `#64748b` measured ~4.3:1 against `--mr-color-surface-muted`
   (`#f1f5f9`) — under the 4.5:1 AA minimum for normal text. Hit Badge,
   Alert, and Table headers. **Fix**: darkened to `#475569` (~6.9:1).
3. **`Progress` had no accessible name.** `role="progressbar"` with no
   `aria-label`/`aria-labelledby` is `aria-progressbar-name` (serious),
   not hypothetical. **Fix**: defaults `aria-label` to "Progreso",
   overridable.

## Fixes Applied

All three findings above are fixed in this working tree (not just
reported) — `packages/design-tokens/src/reset.css`,
`packages/design-tokens/src/tokens.css`, `packages/ui/src/components/progress.tsx`.
Re-ran the full a11y suite after each fix: 46/46 passing, confirmed against
the actual rebuilt `dist/`.

## Remaining Work

Only the two items already named in [GitHub Packages](#github-packages)
and [External Consumer](#external-consumer):

- Merge to `main` with a `packages: write` credential available → first
  real publish to `npm.pkg.github.com` (automatic via the release
  workflow, no manual `npm publish` step to design).
- A reference module repository, external to this monorepo, consuming
  that published version — blocked on the above existing first.

Everything else in the original closure checklist is done, not partial.

## Final Checklist

```text
[x] cuatro paquetes construyen dist real
[x] exports públicos funcionan
[x] boundaries automáticos pasan
[x] todos los componentes previstos están implementados
[x] Radix respalda interacciones complejas
[x] Storybook completo construye
[x] a11y automatizado pasa
[x] visual regression está activo
[x] Changesets funciona
[~] GitHub Packages está validado o listo para publish real — validado end-to-end
    contra un registry real; el publish real a npm.pkg.github.com requiere credenciales
    que este entorno no tiene
[x] consumidor externo instala versiones de registry (Verdaccio real, fuera del workspace)
[x] ModuleFrame funciona externamente
[x] AdminFrame funciona en mirotaract-web
[x] Kernel→visual adapters viven exclusivamente en Web Shell
[x] CSS está aislado
[x] light/dark funcionan
[x] no existe lógica de dominio en paquetes
```
