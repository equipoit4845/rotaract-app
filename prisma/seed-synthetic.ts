/**
 * Synthetic sandbox district for local development (E6, `mirotaract dev`).
 *
 *   tsx prisma/seed-synthetic.ts [--json] [--force] [--redirect-uri <url>]...
 *
 * Creates (idempotently) "Distrito 9999 (sandbox)": 6 clubs, ~60 people with
 * obviously fake names and @example.org emails, the current Rotary period
 * (July–June) for the district and every club, club presidents and
 * secretaries, the RDR and the district secretary, test accounts per role
 * with a known password, and a local CONFIDENTIAL developer app
 * (`client_credentials` + `authorization_code`) plus a PUBLIC one for
 * mobile/SPA experiments. Every run issues a NEW client secret for the
 * local app (the previous ones are revoked) and prints the credentials.
 *
 * Safety: it refuses to run when the database holds any organization or
 * account that is not synthetic (codes `SBX-…`, emails `@example.org`),
 * i.e. real data. `--force` (or MIROTARACT_SANDBOX_FORCE=1) overrides that
 * check, never when NODE_ENV=production. Run it only against a disposable
 * database (the one `mirotaract dev` creates).
 *
 * Output: human-readable progress on stderr; with --json, one line on
 * stdout prefixed with `MIROTARACT_SANDBOX_JSON=` (the CLI parses it).
 */
import {
  AccountStatus,
  AppointmentStatus,
  DeveloperAppStatus,
  DeveloperAppType,
  MembershipStatus,
  MembershipTransitionType,
  OrganizationStatus,
  PeriodStatus,
  PlatformRole,
  PrismaClient,
  ScopeType,
  type OrganizationType,
} from "@prisma/client";
import { createRequire } from "node:module";
import { join } from "node:path";

import {
  hashClientSecret,
  newClientId,
  newClientSecret,
} from "../apps/institutional-kernel-api/src/application/developer-apps/credentials";
import {
  isOidcScope,
  isServiceScope,
} from "../apps/institutional-kernel-api/src/application/oauth/scopes";

// argon2 is a dependency of the kernel package, not of the workspace root.
const kernelRequire = createRequire(
  join(__dirname, "../apps/institutional-kernel-api/package.json"),
);
const argon2 = kernelRequire("argon2") as typeof import("argon2");

export const SANDBOX = {
  codePrefix: "SBX-",
  emailDomain: "example.org",
  districtCode: "SBX-D9999",
  districtName: "Distrito 9999 (sandbox)",
  password: "sandbox-9999",
  appName: "App local (sandbox)",
  publicAppName: "App móvil local (sandbox)",
} as const;

const DEFAULT_REDIRECTS = [
  "http://localhost:3000/auth/callback", // template next
  "http://localhost:8000/auth/callback", // template fastapi
];
const PUBLIC_REDIRECTS = ["http://localhost:8765/callback"]; // template flutter (desktop/loopback)

const OIDC = ["openid", "profile", "email", "memberships", "positions"];
const SERVICE = [
  "kernel.service.organizations.read",
  "kernel.service.memberships.read",
  "kernel.service.persons.read",
  "kernel.service.authorities.read",
  "kernel.service.periods.read",
  "kernel.service.authorization.check",
];

const CLUBS = [
  { key: "C01", name: "Rotaract Club Sandbox Norte", city: "Villa Ejemplo" },
  { key: "C02", name: "Rotaract Club Sandbox Sur", city: "Puerto Prueba" },
  { key: "C03", name: "Rotaract Club Sandbox Centro", city: "Villa Ejemplo" },
  { key: "C04", name: "Rotaract Club Sandbox Lago", city: "Lago Ficticio" },
  { key: "C05", name: "Rotaract Club Sandbox Sierra", city: "Cerro Demo" },
  { key: "C06", name: "Rotaract Club Sandbox Río", city: "Puerto Prueba" },
];
const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Elena",
  "Facundo",
  "Gabriela",
  "Hugo",
  "Inés",
  "Julián",
  "Karen",
  "Lucas",
  "Martina",
  "Nicolás",
  "Olivia",
  "Pablo",
  "Romina",
  "Santiago",
  "Tamara",
  "Valentín",
];
// Obviously fake surnames: nobody should mistake these for real people.
const LAST_NAMES = [
  "Ejemplo",
  "Prueba",
  "Muestra",
  "Ficción",
  "Simulacro",
  "Maqueta",
  "Borrador",
  "Ensayo",
  "Demo",
  "Sandbox",
];
const PEOPLE_PER_CLUB = 10;

type Role =
  | "SUPERADMIN"
  | "DISTRICT_RDR"
  | "DISTRICT_SECRETARY"
  | "CLUB_PRESIDENT"
  | "CLUB_SECRETARY"
  | "MEMBER";

/** Test accounts per role (index = person number inside the club, 0-based). */
const TEST_ACCOUNTS: Array<{
  email: string;
  role: Role;
  club: string;
  index: number;
  label: string;
}> = [
  {
    email: "admin@example.org",
    role: "SUPERADMIN",
    club: "C03",
    index: 9,
    label: "Superadmin de la plataforma",
  },
  {
    email: "rdr@example.org",
    role: "DISTRICT_RDR",
    club: "C03",
    index: 3,
    label: "Representante Distrital (RDR)",
  },
  {
    email: "secretaria.distrito@example.org",
    role: "DISTRICT_SECRETARY",
    club: "C04",
    index: 3,
    label: "Secretaría distrital",
  },
  {
    email: "presidencia.norte@example.org",
    role: "CLUB_PRESIDENT",
    club: "C01",
    index: 0,
    label: "Presidencia de Sandbox Norte",
  },
  {
    email: "secretaria.norte@example.org",
    role: "CLUB_SECRETARY",
    club: "C01",
    index: 1,
    label: "Secretaría de Sandbox Norte",
  },
  {
    email: "socio.norte@example.org",
    role: "MEMBER",
    club: "C01",
    index: 2,
    label: "Socio/a de Sandbox Norte",
  },
  {
    email: "socio.sur@example.org",
    role: "MEMBER",
    club: "C02",
    index: 2,
    label: "Socio/a de Sandbox Sur (otro club)",
  },
];

function parseArgs(argv: string[]) {
  const options = { json: false, force: false, redirectUris: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--redirect-uri")
      options.redirectUris.push(argv[++i] ?? "");
    else if (arg.startsWith("--redirect-uri="))
      options.redirectUris.push(arg.slice("--redirect-uri=".length));
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  for (const value of (
    process.env.MIROTARACT_SANDBOX_REDIRECT_URIS ?? ""
  ).split(","))
    if (value.trim()) options.redirectUris.push(value.trim());
  if (process.env.MIROTARACT_SANDBOX_FORCE === "1") options.force = true;
  return options;
}

function isLocalRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      !value.includes("#")
    );
  } catch {
    return false;
  }
}

/** Current Rotary year: July 1st → June 30th. */
function currentRotaryYear(now = new Date()) {
  const start =
    now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    code: `SBX-${start}-${String(start + 1).slice(2)}`,
    name: `${start}-${start + 1}`,
    sequence: start,
    startDate: new Date(Date.UTC(start, 6, 1)),
    endDate: new Date(Date.UTC(start + 1, 5, 30)),
  };
}

function log(message: string) {
  process.stderr.write(`[seed-synthetic] ${message}\n`);
}

const prisma = new PrismaClient();

async function assertDisposable(force: boolean) {
  const [foreignOrganizations, foreignAccounts] = await Promise.all([
    prisma.organization.count({
      where: { NOT: { code: { startsWith: SANDBOX.codePrefix } } },
    }),
    prisma.userAccount.count({
      where: {
        NOT: { emailNormalized: { endsWith: `@${SANDBOX.emailDomain}` } },
      },
    }),
  ]);
  if (foreignOrganizations === 0 && foreignAccounts === 0) return;
  const what = `${foreignOrganizations} organización(es) y ${foreignAccounts} cuenta(s) que no son sintéticas`;
  if (process.env.NODE_ENV === "production")
    throw new Error(
      `La base tiene ${what} y NODE_ENV=production. El distrito sintético nunca se carga sobre datos reales.`,
    );
  if (!force)
    throw new Error(
      `La base tiene ${what}: parece una base con datos reales. Abortado. ` +
        "Usá una base descartable (mirotaract dev) o, si sabés lo que hacés, --force.",
    );
  log(`ATENCIÓN: --force con ${what}. Se agregan los datos sintéticos igual.`);
}

async function upsertOrganization(input: {
  code: string;
  name: string;
  slug: string;
  type: OrganizationType;
  parentId: string | null;
  city: string;
}) {
  const data = {
    name: input.name,
    type: input.type,
    parentId: input.parentId,
    status: OrganizationStatus.ACTIVE,
    countryCode: "PY",
    region: "Región Sandbox",
    city: input.city,
    timezone: "America/Asuncion",
    contactEmail: `${input.slug}@${SANDBOX.emailDomain}`,
    description: "Organización sintética para desarrollo local. No es real.",
    attributes: { synthetic: true },
    archivedAt: null,
  };
  return prisma.organization.upsert({
    where: { code: input.code },
    update: data,
    create: { code: input.code, slug: input.slug, ...data },
  });
}

async function ensurePeriod(organizationId: string) {
  const year = currentRotaryYear();
  const existing = await prisma.institutionalPeriod.findUnique({
    where: { organizationId_code: { organizationId, code: year.code } },
  });
  if (existing) {
    if (existing.status !== PeriodStatus.ACTIVE)
      return prisma.institutionalPeriod.update({
        where: { id: existing.id },
        data: { status: PeriodStatus.ACTIVE, closedAt: null },
      });
    return existing;
  }
  return prisma.institutionalPeriod.create({
    data: {
      organizationId,
      code: year.code,
      name: year.name,
      sequence: year.sequence,
      startDate: year.startDate,
      endDate: year.endDate,
      status: PeriodStatus.ACTIVE,
    },
  });
}

async function ensurePerson(
  reference: string,
  firstName: string,
  lastName: string,
  email: string,
) {
  const existing = await prisma.person.findFirst({
    where: { externalReference: reference },
  });
  const data = {
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    primaryEmail: email,
    metadata: { synthetic: true },
  };
  if (existing)
    return prisma.person.update({ where: { id: existing.id }, data });
  return prisma.person.create({
    data: { ...data, externalReference: reference },
  });
}

async function ensureMembership(
  organizationId: string,
  personId: string,
  memberNumber: string,
  status: MembershipStatus,
  joinedAt: Date,
  memberRoleId: string,
) {
  const membership = await prisma.organizationMembership.upsert({
    where: { organizationId_personId: { organizationId, personId } },
    update: { status, memberNumber },
    create: {
      organizationId,
      personId,
      memberNumber,
      status,
      joinedAt,
      statusChangedAt: joinedAt,
      endedAt: status === MembershipStatus.INACTIVE ? new Date() : null,
      transitions: {
        create: [
          {
            type: MembershipTransitionType.CREATED,
            toStatus: MembershipStatus.PENDING,
            effectiveAt: joinedAt,
          },
          {
            type: MembershipTransitionType.ACTIVATED,
            fromStatus: MembershipStatus.PENDING,
            toStatus: MembershipStatus.ACTIVE,
            effectiveAt: joinedAt,
          },
          ...(status === MembershipStatus.ACTIVE
            ? []
            : [
                {
                  type:
                    status === MembershipStatus.ON_LEAVE
                      ? MembershipTransitionType.LEAVE_STARTED
                      : MembershipTransitionType.DEACTIVATED,
                  fromStatus: MembershipStatus.ACTIVE,
                  toStatus: status,
                  effectiveAt: new Date(),
                },
              ]),
        ],
      },
    },
  });
  // Same rule as KernelService.syncMemberRole: ACTIVE/ON_LEAVE hold MEMBER.
  const shouldHold =
    status === MembershipStatus.ACTIVE || status === MembershipStatus.ON_LEAVE;
  const where = {
    personId,
    roleDefinitionId: memberRoleId,
    scopeType: ScopeType.ORGANIZATION,
    organizationId,
    revokedAt: null,
  };
  const held = await prisma.roleAssignment.count({ where });
  if (shouldHold && held === 0)
    await prisma.roleAssignment.create({
      data: { ...where, reason: `membership:${membership.id}` },
    });
  else if (!shouldHold && held > 0)
    await prisma.roleAssignment.updateMany({
      where,
      data: { revokedAt: new Date() },
    });
  return membership;
}

/** ACTIVE appointment + the role it derives, as AppointmentService does on activation. */
async function ensureAppointment(input: {
  organizationId: string;
  organizationType: OrganizationType;
  periodId: string;
  membershipId: string;
  personId: string;
  positionCode: string;
  startsAt: Date;
}) {
  const position = await prisma.positionDefinition.findUniqueOrThrow({
    where: { code: input.positionCode },
  });
  let appointment = await prisma.appointment.findFirst({
    where: {
      organizationId: input.organizationId,
      periodId: input.periodId,
      positionDefinitionId: position.id,
      status: AppointmentStatus.ACTIVE,
    },
  });
  if (appointment && appointment.membershipId !== input.membershipId) {
    // Someone else holds it (e.g. data edited by hand): end it, like the kernel would.
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.ENDED, endedAt: new Date() },
    });
    await prisma.roleAssignment.updateMany({
      where: { sourceAppointmentId: appointment.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    appointment = null;
  }
  appointment ??= await prisma.appointment.create({
    data: {
      organizationId: input.organizationId,
      periodId: input.periodId,
      membershipId: input.membershipId,
      positionDefinitionId: position.id,
      status: AppointmentStatus.ACTIVE,
      startsAt: input.startsAt,
      activatedAt: new Date(),
    },
  });
  if (position.defaultRoleCode) {
    const role = await prisma.roleDefinition.findUnique({
      where: { code: position.defaultRoleCode },
    });
    if (role) {
      const held = await prisma.roleAssignment.count({
        where: { sourceAppointmentId: appointment.id, revokedAt: null },
      });
      if (held === 0)
        await prisma.roleAssignment.create({
          data: {
            personId: input.personId,
            roleDefinitionId: role.id,
            scopeType:
              input.organizationType === "DISTRICT"
                ? ScopeType.ORGANIZATION_TREE
                : ScopeType.ORGANIZATION,
            organizationId: input.organizationId,
            periodId: input.periodId,
            sourceAppointmentId: appointment.id,
          },
        });
    }
  }
  return appointment;
}

// E12.3 (docs/19-operations-e12.md): the hosted sandbox sets its own
// passwords; the superadmin one is never the published one.
const accountPassword = () =>
  process.env.MIROTARACT_SANDBOX_PASSWORD || SANDBOX.password;
const superadminPassword = () =>
  process.env.MIROTARACT_SANDBOX_ADMIN_PASSWORD || accountPassword();

async function ensureAccount(
  personId: string,
  email: string,
  superadmin: boolean,
  platformUserRoleId: string,
) {
  const passwordHash = await argon2.hash(
    superadmin ? superadminPassword() : accountPassword(),
  );
  const emailNormalized = email.toLowerCase();
  const existingForPerson = await prisma.userAccount.findUnique({
    where: { personId },
  });
  const data = {
    email,
    emailNormalized,
    passwordHash,
    status: AccountStatus.ACTIVE,
    platformRole: superadmin ? PlatformRole.SUPERADMIN : PlatformRole.USER,
    emailVerifiedAt: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    disabledAt: null,
  };
  const account = existingForPerson
    ? await prisma.userAccount.update({
        where: { id: existingForPerson.id },
        data,
      })
    : await prisma.userAccount.upsert({
        where: { emailNormalized },
        update: { ...data, personId },
        create: { ...data, personId },
      });
  const where = {
    personId,
    roleDefinitionId: platformUserRoleId,
    scopeType: ScopeType.PLATFORM,
    revokedAt: null,
  };
  if ((await prisma.roleAssignment.count({ where })) === 0)
    await prisma.roleAssignment.create({
      data: { ...where, reason: "sandbox:baseline-role" },
    });
  return account;
}

async function ensureApp(input: {
  name: string;
  type: DeveloperAppType;
  organizationId: string;
  ownerPersonId: string;
  grantTypes: string[];
  scopes: string[];
  redirectUris: string[];
  withSecret: boolean;
}) {
  for (const scope of input.scopes)
    if (!isOidcScope(scope) && !isServiceScope(scope))
      throw new Error(`Scope desconocido: ${scope}`);
  for (const uri of input.redirectUris)
    if (!isLocalRedirect(uri))
      throw new Error(
        `La URL de retorno ${uri} no es local (http://localhost o http://127.0.0.1).`,
      );
  const existing = await prisma.developerApp.findFirst({
    where: {
      name: input.name,
      organizationId: input.organizationId,
      status: { not: DeveloperAppStatus.REVOKED },
    },
  });
  const data = {
    description:
      "App sintética del kernel local (mirotaract dev). No existe en producción.",
    type: input.type,
    status: DeveloperAppStatus.ACTIVE,
    suspendedAt: null,
    grantTypes: input.grantTypes,
    scopes: input.scopes,
    redirectUris: [
      ...new Set([...(existing?.redirectUris ?? []), ...input.redirectUris]),
    ],
    // E11: the local kernel's sample app comes approved, so the template
    // works with every scope (new apps start IN_REVIEW).
    reviewStatus: "APPROVED" as const,
    approvedScopes: input.scopes,
    approvedAt: existing?.approvedAt ?? new Date(),
    reviewedAt: new Date(),
  };
  const app = existing
    ? await prisma.developerApp.update({ where: { id: existing.id }, data })
    : await prisma.developerApp.create({
        data: {
          ...data,
          name: input.name,
          clientId: newClientId(),
          organizationId: input.organizationId,
          ownerPersonId: input.ownerPersonId,
        },
      });
  let clientSecret: string | null = null;
  if (input.withSecret) {
    // The plaintext is only known at creation: issue a fresh one per run.
    await prisma.developerAppSecret.updateMany({
      where: { appId: app.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const secret = newClientSecret();
    await prisma.developerAppSecret.create({
      data: {
        appId: app.id,
        secretHash: await hashClientSecret(secret.secret),
        hint: secret.hint,
      },
    });
    clientSecret = secret.secret;
  }
  return { app, clientSecret };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await assertDisposable(options.force);

  const [memberRole, platformUserRole] = await Promise.all([
    prisma.roleDefinition.findUnique({ where: { code: "MEMBER" } }),
    prisma.roleDefinition.findUnique({ where: { code: "PLATFORM_USER" } }),
  ]);
  if (!memberRole || !platformUserRole)
    throw new Error(
      "Faltan los roles base. Corré primero el seed base (prisma/seed.ts).",
    );

  const district = await upsertOrganization({
    code: SANDBOX.districtCode,
    name: SANDBOX.districtName,
    slug: "distrito-9999-sandbox",
    type: "DISTRICT",
    parentId: null,
    city: "Villa Ejemplo",
  });
  const districtPeriod = await ensurePeriod(district.id);
  log(`Distrito ${district.name} (${district.id})`);

  const year = currentRotaryYear();
  const clubs: Array<{
    id: string;
    code: string;
    name: string;
    periodId: string;
  }> = [];
  type SeededPerson = {
    personId: string;
    membershipId: string;
    clubKey: string;
    index: number;
    email: string;
    name: string;
  };
  const people: SeededPerson[] = [];

  for (const [clubIndex, club] of CLUBS.entries()) {
    const organization = await upsertOrganization({
      code: `SBX-${club.key}`,
      name: club.name,
      slug: `sandbox-${slugify(club.name.replace("Rotaract Club Sandbox ", "")).replace(/\./g, "-")}`,
      type: "CLUB",
      parentId: district.id,
      city: club.city,
    });
    const period = await ensurePeriod(organization.id);
    clubs.push({
      id: organization.id,
      code: organization.code,
      name: organization.name,
      periodId: period.id,
    });

    for (let index = 0; index < PEOPLE_PER_CLUB; index++) {
      const n = clubIndex * PEOPLE_PER_CLUB + index;
      const firstName = FIRST_NAMES[n % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(n + clubIndex) % LAST_NAMES.length];
      const testAccount = TEST_ACCOUNTS.find(
        (a) => a.club === club.key && a.index === index,
      );
      const email =
        testAccount?.email ??
        `${slugify(firstName)}.${slugify(lastName)}.${String(n + 1).padStart(2, "0")}@${SANDBOX.emailDomain}`;
      const person = await ensurePerson(
        `sbx:person:${String(n + 1).padStart(2, "0")}`,
        firstName,
        lastName,
        email,
      );
      // A bit of variety: the last two of each club are on leave / inactive.
      const status =
        index === PEOPLE_PER_CLUB - 2
          ? MembershipStatus.ON_LEAVE
          : index === PEOPLE_PER_CLUB - 1 && !testAccount
            ? MembershipStatus.INACTIVE
            : MembershipStatus.ACTIVE;
      const joinedAt = new Date(
        Date.UTC(year.sequence - (index % 4), (index * 3) % 12, 1 + index),
      );
      const membership = await ensureMembership(
        organization.id,
        person.id,
        `${club.key}-${String(index + 1).padStart(3, "0")}`,
        status,
        joinedAt,
        memberRole.id,
      );
      people.push({
        personId: person.id,
        membershipId: membership.id,
        clubKey: club.key,
        index,
        email,
        name: `${firstName} ${lastName}`,
      });
    }

    // Every club: president (#0) and secretary (#1).
    for (const [index, positionCode] of [
      [0, "CLUB_PRESIDENT"],
      [1, "CLUB_SECRETARY"],
    ] as const) {
      const holder = people.find(
        (p) => p.clubKey === club.key && p.index === index,
      )!;
      await ensureAppointment({
        organizationId: organization.id,
        organizationType: "CLUB",
        periodId: period.id,
        membershipId: holder.membershipId,
        personId: holder.personId,
        positionCode,
        startsAt: year.startDate,
      });
    }
  }
  log(`${clubs.length} clubes, ${people.length} personas`);

  // District authorities, held by members of descendant clubs.
  for (const [clubKey, positionCode] of [
    ["C03", "DISTRICT_RDR"],
    ["C04", "DISTRICT_SECRETARY"],
  ] as const) {
    const holder = people.find((p) => p.clubKey === clubKey && p.index === 3)!;
    await ensureAppointment({
      organizationId: district.id,
      organizationType: "DISTRICT",
      periodId: districtPeriod.id,
      membershipId: holder.membershipId,
      personId: holder.personId,
      positionCode,
      startsAt: year.startDate,
    });
  }

  const users = [];
  for (const account of TEST_ACCOUNTS) {
    const holder = people.find(
      (p) => p.clubKey === account.club && p.index === account.index,
    )!;
    await ensureAccount(
      holder.personId,
      account.email,
      account.role === "SUPERADMIN",
      platformUserRole.id,
    );
    users.push({
      role: account.role,
      label: account.label,
      email: account.email,
      name: holder.name,
      personId: holder.personId,
      club: clubs.find((c) => c.code === `SBX-${account.club}`)!.name,
    });
  }
  log(`${users.length} cuentas de prueba (contraseña: ${accountPassword()})`);

  const rdr = users.find((u) => u.role === "DISTRICT_RDR")!;
  const confidential = await ensureApp({
    name: SANDBOX.appName,
    type: DeveloperAppType.CONFIDENTIAL,
    organizationId: district.id,
    ownerPersonId: rdr.personId,
    grantTypes: ["client_credentials", "authorization_code"],
    scopes: [...OIDC, ...SERVICE],
    redirectUris: [...DEFAULT_REDIRECTS, ...options.redirectUris],
    withSecret: true,
  });
  const publicApp = await ensureApp({
    name: SANDBOX.publicAppName,
    type: DeveloperAppType.PUBLIC,
    organizationId: district.id,
    ownerPersonId: rdr.personId,
    grantTypes: ["authorization_code", "refresh_token"],
    scopes: OIDC,
    redirectUris: PUBLIC_REDIRECTS,
    withSecret: false,
  });
  log(
    `App local ${confidential.app.clientId} (secreto nuevo emitido; los anteriores quedaron revocados)`,
  );

  const result = {
    district: { id: district.id, code: district.code, name: district.name },
    period: { code: year.code, name: year.name },
    clubs: clubs.map(({ id, code, name }) => ({ id, code, name })),
    people: people.length,
    password: accountPassword(),
    users,
    app: {
      id: confidential.app.id,
      clientId: confidential.app.clientId,
      clientSecret: confidential.clientSecret,
      organizationId: district.id,
      type: confidential.app.type,
      grantTypes: confidential.app.grantTypes,
      scopes: confidential.app.scopes,
      redirectUris: confidential.app.redirectUris,
    },
    publicApp: {
      id: publicApp.app.id,
      clientId: publicApp.app.clientId,
      redirectUris: publicApp.app.redirectUris,
      scopes: publicApp.app.scopes,
    },
  };
  if (options.json)
    process.stdout.write(`MIROTARACT_SANDBOX_JSON=${JSON.stringify(result)}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(
      `[seed-synthetic] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
