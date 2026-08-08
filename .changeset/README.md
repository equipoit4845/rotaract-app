# Changesets

Versions only the design system packages (`@equipoit4845/design-tokens`,
`icons`, `ui`, `admin-shell`) — every other workspace package is listed in
`.changeset/config.json`'s `ignore` and never gets a Changesets-managed
version bump.

Run `pnpm changeset` after a design-system change that consumers need to
know about, pick the affected package(s) and a semver bump, and write a
one-line summary — it becomes the changelog entry. See
[`docs/08-design-system.md`](../docs/08-design-system.md#publicación) for
the full release flow.

**Why this directory has no pending changeset right now**: the four
packages have never been published. The first release is meant to ship
exactly `0.1.0` — the version already sitting in each `package.json` — not
a changeset-driven bump to `0.2.0`. With no `.md` file here besides this
README, `changesets/action` skips the "Version Packages" PR step and goes
straight to publish on the next run against `main`, releasing `0.1.0` as
written. The first *contentful* changeset should describe the first change
made *after* that initial release, not the initial release itself.
