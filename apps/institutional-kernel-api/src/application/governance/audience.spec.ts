import {
  defaultLaunchUrl,
  isValidIcon,
  isValidLaunchUrl,
  matchesAudience,
  type PersonContexts,
} from "./audience";
import { suggestedListing } from "./app-catalog.service";

const member: PersonContexts = {
  memberships: [{ organizationId: "club_a", organizationType: "CLUB" }],
  appointments: [],
};
const president: PersonContexts = {
  memberships: [{ organizationId: "club_a", organizationType: "CLUB" }],
  appointments: [
    {
      organizationId: "club_a",
      organizationType: "CLUB",
      positionCode: "CLUB_PRESIDENT",
    },
  ],
};
const secretary: PersonContexts = {
  memberships: [{ organizationId: "club_b", organizationType: "CLUB" }],
  appointments: [
    {
      organizationId: "club_b",
      organizationType: "CLUB",
      positionCode: "CLUB_SECRETARY",
    },
  ],
};
const rdr: PersonContexts = {
  memberships: [{ organizationId: "club_c", organizationType: "CLUB" }],
  appointments: [
    {
      organizationId: "district",
      organizationType: "DISTRICT",
      positionCode: "DISTRICT_RDR",
    },
  ],
};
const nobody: PersonContexts = { memberships: [], appointments: [] };

const rule = (audiences: string[], positionCodes: string[] = []) => ({
  audiences,
  positionCodes,
});

describe("matchesAudience", () => {
  it.each([
    ["DISTRICT_MEMBERS", member, true],
    ["DISTRICT_MEMBERS", nobody, false],
    ["CLUB_PRESIDENTS", president, true],
    ["CLUB_PRESIDENTS", member, false],
    ["CLUB_PRESIDENTS", secretary, false],
    ["CLUB_PRESIDENTS", rdr, false],
    ["CLUB_AUTHORITIES", secretary, true],
    ["CLUB_AUTHORITIES", president, true],
    ["CLUB_AUTHORITIES", member, false],
    ["CLUB_AUTHORITIES", rdr, false],
    ["DISTRICT_AUTHORITIES", rdr, true],
    ["DISTRICT_AUTHORITIES", president, false],
  ])("%s for %#", (audience, person, expected) => {
    expect(matchesAudience(rule([audience]), person)).toBe(expected);
  });

  it("combines audiences: presidents and district authorities (Reuniones)", () => {
    const reuniones = rule(["CLUB_PRESIDENTS", "DISTRICT_AUTHORITIES"]);
    expect(matchesAudience(reuniones, president)).toBe(true);
    expect(matchesAudience(reuniones, rdr)).toBe(true);
    expect(matchesAudience(reuniones, member)).toBe(false);
    expect(matchesAudience(reuniones, secretary)).toBe(false);
  });

  it("matches specific position codes", () => {
    const secretaries = rule(["POSITIONS"], ["CLUB_SECRETARY"]);
    expect(matchesAudience(secretaries, secretary)).toBe(true);
    expect(matchesAudience(secretaries, president)).toBe(false);
  });

  it("hides the app for members of a club where its module is not active", () => {
    const everyone = rule(["DISTRICT_MEMBERS", "CLUB_PRESIDENTS"]);
    const hidden = new Set(["club_a"]);
    expect(matchesAudience(everyone, president, hidden)).toBe(false);
    expect(matchesAudience(everyone, member, hidden)).toBe(false);
    expect(matchesAudience(everyone, secretary, hidden)).toBe(true);
    // A district position is not a club context.
    expect(
      matchesAudience(rule(["DISTRICT_AUTHORITIES"]), rdr, new Set(["club_c"])),
    ).toBe(true);
  });

  it("matches nobody without audiences", () => {
    expect(matchesAudience(rule([]), president)).toBe(false);
  });
});

describe("listing fields", () => {
  it.each([
    ["calendar-days", true],
    ["https://cdn.example/icon.png", true],
    ["http://cdn.example/icon.png", false],
    ["Calendar Days", false],
    ["javascript:alert(1)", false],
  ])("icon %s valid = %p", (icon, expected) => {
    expect(isValidIcon(icon)).toBe(expected);
  });

  it.each([
    ["https://reuniones.rotaract4845.com", true],
    ["http://localhost:3002", true],
    ["http://reuniones.example", false],
    ["ftp://x", false],
  ])("launch url %s valid = %p", (url, expected) => {
    expect(isValidLaunchUrl(url)).toBe(expected);
  });

  it("defaults the launch URL to the origin of a redirect URI", () => {
    expect(
      defaultLaunchUrl([
        "myapp://callback",
        "https://reuniones.rotaract4845.com/api/auth/callback",
      ]),
    ).toBe("https://reuniones.rotaract4845.com");
    expect(defaultLaunchUrl([])).toBeNull();
  });

  it("pre-fills from the E8 module's ui when there is one", () => {
    const app = {
      name: "Reuniones",
      description: "Actas y asistencia",
      redirectUris: ["https://reuniones.rotaract4845.com/callback"],
    };
    expect(suggestedListing(app)).toMatchObject({
      published: false,
      displayName: "Reuniones",
      shortDescription: "Actas y asistencia",
      icon: null,
      launchUrl: "https://reuniones.rotaract4845.com",
      audiences: [],
    });
    expect(
      suggestedListing(app, {
        moduleId: "meetings",
        navLabel: "Reuniones del club",
        entryUrl: "https://reuniones.rotaract4845.com/panel",
        icon: "calendar-days",
      }),
    ).toMatchObject({
      displayName: "Reuniones del club",
      icon: "calendar-days",
      launchUrl: "https://reuniones.rotaract4845.com/panel",
    });
  });
});
