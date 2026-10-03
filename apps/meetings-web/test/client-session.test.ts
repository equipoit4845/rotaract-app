import assert from "node:assert/strict";
import { test } from "node:test";

import { toAuthUser } from "@/context/AuthContext";
import { isAuthError, normalizeSnapshot } from "@/hooks/useMeetingRoom";
import { isTokenStale, REFRESH_MARGIN_MS } from "@/lib/session-token";

test("token refresh: stale when missing or within a minute of expiry", () => {
  const now = 1_000_000;
  assert.equal(isTokenStale(null, now), true);
  assert.equal(
    isTokenStale({ token: "t", expiresAt: now + 15 * 60_000 }, now),
    false,
  );
  assert.equal(
    isTokenStale({ token: "t", expiresAt: now + REFRESH_MARGIN_MS }, now),
    true,
  );
  assert.equal(isTokenStale({ token: "t", expiresAt: now - 1 }, now), true);
});

test("socket auth errors trigger a token refresh", () => {
  assert.equal(isAuthError("unauthorized"), true);
  assert.equal(isAuthError("Unauthorized: jwt expired"), true);
  assert.equal(isAuthError("No autenticado"), true);
  assert.equal(isAuthError("El acceso ha sido delegado"), false);
  assert.equal(isAuthError(undefined), false);
});

test("/auth/me maps to the legacy AuthUser (clubs → memberships)", () => {
  const user = toAuthUser({
    id: "per_1",
    fullName: "Ana",
    email: "ana@x.test",
    role: "PRESIDENT",
    clubs: [{ id: "org_1", name: "Club Centro", isPresident: true }],
  });
  assert.equal(user.id, "per_1");
  assert.equal(user.role, "PRESIDENT");
  assert.deepEqual(user.memberships, [
    {
      clubId: "org_1",
      clubName: "Club Centro",
      clubCode: "",
      title: "Presidente",
      isPresident: true,
    },
  ]);
  // Legacy `{ user }` envelope is accepted too.
  assert.equal(
    toAuthUser({
      user: {
        id: "p",
        fullName: "B",
        email: "b",
        role: "PARTICIPANT",
        clubs: [],
      },
    }).id,
    "p",
  );
});

test("snapshot keeps the timer topicId so the admin can stop the timer (contract fix #5)", () => {
  const snap = normalizeSnapshot({
    meeting: {
      id: "m1",
      status: "LIVE",
      type: "ORDINARY",
      transcriptionEnabled: true,
    },
    currentTopic: { id: "t1", title: "Asistencia", type: "DISCUSSION" },
    topics: [],
    timers: [
      {
        id: "tm1",
        type: "TOPIC",
        topicId: "t1",
        plannedDurationSec: 300,
        elapsedSec: 320,
      },
    ],
  });
  assert.equal(snap.activeTimer?.topicId, "t1");
  assert.equal(snap.activeTimer?.remainingSec, 0);
  assert.equal(snap.activeTimer?.overtimeSec, 20);
  assert.equal(snap.currentTopicId, "t1");
});
