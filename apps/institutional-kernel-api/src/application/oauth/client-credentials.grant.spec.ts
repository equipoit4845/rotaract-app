import { ClientCredentialsGrant } from "./client-credentials.grant";
import { OAuthError } from "./oauth-error";

const app = {
  id: "app_1",
  clientId: "mra_1",
  organizationId: "club_1",
  scopes: [
    "openid",
    "kernel.service.organizations.read",
    "kernel.service.persons.read",
  ],
} as any;

function grant() {
  const keys = { sign: jest.fn().mockResolvedValue("signed.jwt") };
  return { grant: new ClientCredentialsGrant(keys as any), keys };
}

describe("ClientCredentialsGrant", () => {
  it("issues every service scope of the app when none is requested", async () => {
    const { grant: subject, keys } = grant();

    const response = await subject.issue(app, undefined);

    expect(response).toEqual({
      access_token: "signed.jwt",
      token_type: "Bearer",
      expires_in: 600,
      scope: "kernel.service.organizations.read kernel.service.persons.read",
    });
    expect(keys.sign).toHaveBeenCalledWith(
      {
        client_id: "mra_1",
        azp: "mra_1",
        token_use: "service",
        scope: "kernel.service.organizations.read kernel.service.persons.read",
        org: "club_1",
      },
      {
        audience: "institutional-kernel",
        subject: "app:mra_1",
        expiresIn: 600,
      },
    );
  });

  it("narrows the token to a requested subset", async () => {
    const { grant: subject } = grant();
    const response = await subject.issue(
      app,
      "kernel.service.persons.read  kernel.service.persons.read",
    );
    expect(response.scope).toBe("kernel.service.persons.read");
  });

  it.each([
    "kernel.service.memberships.read",
    // OIDC scopes are for people, never part of a service token
    "openid",
    "kernel.service.persons.read unknown",
  ])("rejects %s with invalid_scope", async (scope) => {
    const { grant: subject, keys } = grant();
    const error = await subject.issue(app, scope).catch((e) => e);
    expect(error).toBeInstanceOf(OAuthError);
    expect(error.error).toBe("invalid_scope");
    expect(error.status).toBe(400);
    expect(keys.sign).not.toHaveBeenCalled();
  });
});

describe("ClientCredentialsGrant — app in review (E11.1)", () => {
  const inReview = { ...app, approvedScopes: [], approvedAt: null };

  it("issues only the scopes without personal data", async () => {
    const { grant: subject } = grant();
    const response = await subject.issue(inReview, undefined);
    expect(response.scope).toBe("kernel.service.organizations.read");
  });

  it("refuses a personal-data scope until the district approves it", async () => {
    const { grant: subject } = grant();
    const error = await subject
      .issue(inReview, "kernel.service.persons.read")
      .catch((e) => e);
    expect(error).toBeInstanceOf(OAuthError);
    expect(error.error).toBe("invalid_scope");
    expect(error.description).toMatch(/review/);
  });

  it("refuses when nothing can be issued yet", async () => {
    const { grant: subject } = grant();
    const error = await subject
      .issue(
        {
          ...inReview,
          scopes: ["kernel.service.persons.read"],
        },
        undefined,
      )
      .catch((e) => e);
    expect(error.error).toBe("invalid_scope");
  });

  it("issues approved scopes after a re-review is opened for new ones", async () => {
    const { grant: subject } = grant();
    const response = await subject.issue(
      {
        ...app,
        scopes: [...app.scopes, "kernel.service.persons.contact.read"],
        approvedScopes: app.scopes,
        approvedAt: new Date(),
      },
      undefined,
    );
    expect(response.scope).toBe(
      "kernel.service.organizations.read kernel.service.persons.read",
    );
  });
});
