import assert from "node:assert/strict";
import { test } from "node:test";

import { isHabilitado, quorumRequired } from "@/lib/club-standing";
import {
  activeNavHref,
  ADMIN_ROLES,
  decideGuard,
  DISTRICT_ROLES,
  ROTARACT_ROLES,
  visibleNav,
} from "@/lib/permissions";

const guard = (
  role: string | null,
  allowRoles?: string[],
  extra: { isLoading?: boolean; error?: string } = {},
) =>
  decideGuard({
    user: role ? { role } : null,
    isLoading: extra.isLoading ?? false,
    error: extra.error,
    allowRoles,
    pathname: "/admin/meetings/m1/live",
  });

test("loading shows the skeleton", () => {
  assert.deepEqual(guard(null, DISTRICT_ROLES, { isLoading: true }), {
    kind: "loading",
  });
});

test("no user goes to Ingresar con Mi Rotaract with returnTo", () => {
  assert.deepEqual(guard(null, DISTRICT_ROLES), {
    kind: "login",
    href: "/auth/login?returnTo=%2Fadmin%2Fmeetings%2Fm1%2Flive",
  });
});

test("meetings-api unreachable is an error, not a login loop", () => {
  assert.deepEqual(guard(null, DISTRICT_ROLES, { error: "fetch failed" }), {
    kind: "error",
    message: "fetch failed",
  });
});

test("/admin/meetings: SECRETARY, RDR, SUPERADMIN only (legacy DISTRICT_ROLES)", () => {
  for (const role of ["SECRETARY", "RDR", "SUPERADMIN"])
    assert.equal(guard(role, DISTRICT_ROLES).kind, "allow");
  for (const role of ["PRESIDENT", "PARTICIPANT"]) {
    assert.deepEqual(guard(role, DISTRICT_ROLES), {
      kind: "redirect",
      href: "/meetings",
    });
  }
});

test("/admin layout lets a PRESIDENT through (legacy ADMIN_ROLES), the nested guard stops them", () => {
  assert.equal(guard("PRESIDENT", ADMIN_ROLES).kind, "allow");
  assert.equal(guard("PRESIDENT", DISTRICT_ROLES).kind, "redirect");
  assert.equal(guard("PARTICIPANT", ADMIN_ROLES).kind, "redirect");
});

test("meetings and history are for every Rotaract role, not COMPANY", () => {
  for (const role of [
    "PARTICIPANT",
    "PRESIDENT",
    "SECRETARY",
    "RDR",
    "SUPERADMIN",
  ]) {
    assert.equal(guard(role, ROTARACT_ROLES).kind, "allow");
  }
  assert.equal(guard("COMPANY", ROTARACT_ROLES).kind, "redirect");
});

test("nav: Administrar and Habilitación for district roles, Delegaciones for presidents, SUPERADMIN sees all", () => {
  const labels = (role: string) => visibleNav(role).map((e) => e.label);
  assert.deepEqual(labels("PARTICIPANT"), ["Mis reuniones", "Historial"]);
  assert.deepEqual(labels("PRESIDENT"), [
    "Mis reuniones",
    "Historial",
    "Delegaciones",
  ]);
  assert.deepEqual(labels("SECRETARY"), [
    "Mis reuniones",
    "Administrar",
    "Historial",
    "Habilitación de clubes",
  ]);
  assert.deepEqual(labels("RDR"), [
    "Mis reuniones",
    "Administrar",
    "Historial",
    "Habilitación de clubes",
  ]);
  assert.equal(labels("SUPERADMIN").length, 5);
});

test("nav highlights the most specific entry", () => {
  assert.equal(activeNavHref("/meetings"), "/meetings");
  assert.equal(activeNavHref("/meetings/abc/live"), "/meetings");
  assert.equal(activeNavHref("/admin/meetings/abc"), "/admin/meetings");
  assert.equal(activeNavHref("/history/abc"), "/history");
  assert.equal(activeNavHref("/admin/clubes"), "/admin/clubes");
  assert.equal(activeNavHref("/meetings-api/x"), null);
});

test("club standing: habilitado needs all four flags and ACTIVE; quorum is ceil(2/3)", () => {
  const base = {
    id: "c1",
    name: "Club",
    code: "C1",
    status: "ACTIVE",
    isConstituido: true,
    cuotaAldia: true,
    informeAlDia: true,
    enabledForDistrictMeetings: true,
  };
  assert.equal(isHabilitado(base), true);
  assert.equal(isHabilitado({ ...base, cuotaAldia: false }), false);
  assert.equal(isHabilitado({ ...base, isConstituido: false }), false);
  assert.equal(isHabilitado({ ...base, status: "INACTIVE" }), false);
  assert.equal(quorumRequired(10), 7);
  assert.equal(quorumRequired(9), 6);
  assert.equal(quorumRequired(0), 0);
});
