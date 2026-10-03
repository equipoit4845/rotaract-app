import { BadRequestException } from "@nestjs/common";

import {
  effectiveServiceScopes,
  isTester,
  maySignIn,
  pendingScopes,
  reviewAfterScopeChange,
  validateGovernanceFields,
  validateReviewDecision,
} from "./review-policy";

const ALL_TRUE = {
  purpose: true,
  data: true,
  owner: true,
  privacyPolicy: true,
  contact: true,
};

const complete = {
  purpose: "Agenda de reuniones del distrito",
  privacyPolicyUrl: "https://reuniones.example/privacidad",
  contactEmail: "equipo@example.org",
};

describe("review policy — what works before approval", () => {
  const app = {
    ownerPersonId: "owner",
    testAccountEmails: ["tester@example.org"],
    scopes: [
      "openid",
      "profile",
      "kernel.service.organizations.read",
      "kernel.service.persons.read",
    ],
    approvedScopes: [] as string[],
    approvedAt: null,
  };

  it("lists the scopes that still need the district's approval", () => {
    expect(pendingScopes({ ...app, approvedScopes: ["openid"] })).toEqual([
      "profile",
      "kernel.service.organizations.read",
      "kernel.service.persons.read",
    ]);
  });

  it("issues only scopes without personal data to a service token in review", () => {
    expect(effectiveServiceScopes(app)).toEqual([
      "kernel.service.organizations.read",
    ]);
  });

  it("issues every approved service scope once approved", () => {
    expect(
      effectiveServiceScopes({ ...app, approvedScopes: app.scopes }),
    ).toEqual([
      "kernel.service.organizations.read",
      "kernel.service.persons.read",
    ]);
  });

  it("lets only the owner and the test accounts sign in while in review", () => {
    const requested = ["openid", "profile"];
    expect(maySignIn(app, { personId: "owner" }, requested)).toBe(true);
    expect(
      maySignIn(
        app,
        { personId: "p2", email: "Tester@Example.org" },
        requested,
      ),
    ).toBe(true);
    expect(
      maySignIn(
        app,
        { personId: "p3", email: "someone@example.org" },
        requested,
      ),
    ).toBe(false);
  });

  it("lets anybody sign in with approved scopes", () => {
    expect(
      maySignIn(
        { ...app, approvedScopes: ["openid", "profile"] },
        { personId: "p3", email: "someone@example.org" },
        ["openid", "profile"],
      ),
    ).toBe(true);
    expect(isTester(app, { personId: "p3", email: null })).toBe(false);
  });
});

describe("review policy — scope changes", () => {
  const approved = {
    scopes: ["openid", "profile"],
    approvedScopes: ["openid", "profile"],
    approvedAt: new Date(),
    reviewStatus: "APPROVED",
  };

  it("reopens the review when an approved app asks for new data", () => {
    expect(
      reviewAfterScopeChange(approved, ["openid", "profile", "email"]),
    ).toEqual({
      approvedScopes: ["openid", "profile"],
      reviewStatus: "IN_REVIEW",
      reopened: true,
    });
  });

  it("drops approval of data the app no longer asks for, without reopening", () => {
    expect(reviewAfterScopeChange(approved, ["openid"])).toEqual({
      approvedScopes: ["openid"],
      reviewStatus: "APPROVED",
      reopened: false,
    });
  });

  it("goes back to approved when the extra data is removed again", () => {
    expect(
      reviewAfterScopeChange({ ...approved, reviewStatus: "IN_REVIEW" }, [
        "openid",
        "profile",
      ]),
    ).toEqual({
      approvedScopes: ["openid", "profile"],
      reviewStatus: "APPROVED",
      reopened: false,
    });
  });

  it("changes nothing for an edit without new data", () => {
    expect(
      reviewAfterScopeChange(approved, ["openid", "profile"]),
    ).toBeUndefined();
  });

  it("keeps a never-approved app in review", () => {
    expect(
      reviewAfterScopeChange(
        {
          scopes: ["openid"],
          approvedScopes: [],
          approvedAt: null,
          reviewStatus: "IN_REVIEW",
        },
        ["openid", "email"],
      ),
    ).toBeUndefined();
  });
});

describe("review policy — the RDR's decision", () => {
  it("approves with every checklist item and the data behind it", () => {
    expect(
      validateReviewDecision(
        { decision: "approve", checklist: ALL_TRUE },
        complete,
      ),
    ).toEqual({ decision: "approve", checklist: ALL_TRUE, reason: null });
  });

  it("refuses to approve with an unchecked item", () => {
    expect(() =>
      validateReviewDecision(
        { decision: "approve", checklist: { ...ALL_TRUE, contact: false } },
        complete,
      ),
    ).toThrow(/todos los puntos/);
  });

  it("refuses to approve an app that did not fill in the checklist data", () => {
    expect(() =>
      validateReviewDecision(
        { decision: "approve", checklist: ALL_TRUE },
        { ...complete, privacyPolicyUrl: null, contactEmail: null },
      ),
    ).toThrow(/la política de privacidad, el contacto/);
  });

  it("requires a reason to reject", () => {
    expect(() =>
      validateReviewDecision(
        { decision: "reject", checklist: {}, reason: "no" },
        complete,
      ),
    ).toThrow(BadRequestException);
    expect(
      validateReviewDecision(
        {
          decision: "reject",
          checklist: { purpose: true },
          reason: "Falta explicar para qué usa el teléfono",
        },
        complete,
      ).checklist,
    ).toEqual({
      purpose: true,
      data: false,
      owner: false,
      privacyPolicy: false,
      contact: false,
    });
  });

  it("rejects an unknown decision", () => {
    expect(() =>
      validateReviewDecision({ decision: "maybe" }, complete),
    ).toThrow(BadRequestException);
  });
});

describe("review policy — checklist data", () => {
  it("normalizes and validates what the team fills in", () => {
    expect(
      validateGovernanceFields({
        purpose: "  Agenda  ",
        privacyPolicyUrl: "https://example.org/privacidad",
        contactEmail: "Equipo@Example.org",
        testAccountEmails: ["A@x.org", "a@x.org", " "],
      }),
    ).toEqual({
      purpose: "Agenda",
      privacyPolicyUrl: "https://example.org/privacidad",
      contactEmail: "equipo@example.org",
      testAccountEmails: ["a@x.org"],
    });
  });

  it.each([
    [{ privacyPolicyUrl: "http://example.org/privacidad" }, /https/],
    [{ contactEmail: "no-es-un-correo" }, /correo/],
    [{ testAccountEmails: ["x"] }, /no es un correo/],
    [
      {
        testAccountEmails: Array.from({ length: 21 }, (_, i) => `t${i}@x.org`),
      },
      /hasta 20/,
    ],
  ])("rejects %p", (input, message) => {
    expect(() => validateGovernanceFields(input)).toThrow(message);
  });

  it("leaves untouched what was not sent", () => {
    expect(validateGovernanceFields({ name: "x" })).toEqual({});
  });
});
