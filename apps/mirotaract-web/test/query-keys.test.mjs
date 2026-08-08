import assert from "node:assert/strict";
import test from "node:test";

const { organizationKeys } =
  await import("../src/lib/api/organizations/organizations.keys.ts");
const { membershipKeys } =
  await import("../src/lib/api/memberships/memberships.keys.ts");

test("organizationKeys.list is deterministic and filter-scoped, not a single flat key for every filter", () => {
  const a = organizationKeys.list({ type: "CLUB" });
  const b = organizationKeys.list({ type: "CLUB" });
  const c = organizationKeys.list({ type: "DISTRICT" });

  assert.deepEqual(a, b, "same filters must serialize to the same key");
  assert.notDeepEqual(a, c, "different filters must produce different keys");
  assert.equal(
    a.length > 2,
    true,
    "must be hierarchical (all -> list -> filters), not a flat 1-2 element key",
  );
});

test("organizationKeys.detail is a prefix of organizationKeys.children/ancestors/descendants (so invalidating detail cascades)", () => {
  const detail = organizationKeys.detail("org_1");
  const children = organizationKeys.children("org_1");
  assert.deepEqual(children.slice(0, detail.length), detail);
});

test("membershipKeys.organizationList is scoped per organization, not shared across organizations", () => {
  const a = membershipKeys.organizationList("org_1", {});
  const b = membershipKeys.organizationList("org_2", {});
  assert.notDeepEqual(a, b);
});
