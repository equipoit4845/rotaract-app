/**
 * Explicit, opt-in importer for the former Mi Rotaract PostgreSQL dump.
 *
 * Scope intentionally limited to public.User and public.Club. It neither
 * restores Supabase schemas nor creates members, memberships, periods or
 * appointments. Run without --apply for a database-free validation.
 */
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import {
  AccountStatus,
  MembershipStatus,
  MembershipTransitionType,
  OrganizationStatus,
  OrganizationType,
  PlatformRole,
  PrismaClient,
} from "@prisma/client";

type Row = Record<string, string | null>;
type LegacyUser = Row & {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: string;
  isActive: string;
  mustChangePassword: string;
  createdAt: string;
};
type LegacyClub = Row & {
  id: string;
  name: string;
  code: string;
  status: string;
  city: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  description: string | null;
  foundedAt: string | null;
  logoUrl: string | null;
  zone: string | null;
  createdAt: string;
};
type LegacyMembership = Row & {
  id: string;
  userId: string;
  clubId: string;
  title: string | null;
  isPresident: string;
  activeFrom: string;
  activeUntil: string | null;
  clubRole: string;
};

const REQUIRED_TABLES = ["Club", "User", "Membership"];
const BCRYPT_PREFIX = /^\$2[aby]\$\d{2}\$/;
// This is the placeholder club named "Distrito Ejemplo" in the supplied dump.
// It is intentionally not a club in the Kernel hierarchy.
const LEGACY_DISTRICT_PLACEHOLDER_ID = "cmnnanllp0000ry0jwmbvaacc";
const DISTRICT_4845 = {
  id: "district-4845",
  code: "4845",
  name: "Distrito 4845",
  slug: "distrito-4845",
} as const;

function decodeCopyValue(value: string): string | null {
  if (value === "\\N") return null;
  return value.replace(/\\([btnrfv\\]|[0-7]{3})/g, (_whole, escaped) => {
    if (/^[0-7]{3}$/.test(escaped))
      return String.fromCharCode(Number.parseInt(escaped, 8));
    return (
      {
        b: "\b",
        t: "\t",
        n: "\n",
        r: "\r",
        f: "\f",
        v: "\v",
        "\\": "\\",
      } as Record<string, string>
    )[escaped];
  });
}

function parsePublicCopySections(sql: string): Map<string, Row[]> {
  const tables = new Map<string, Row[]>();
  let tableName: string | undefined;
  let columns: string[] = [];

  for (const line of sql.split(/\r?\n/)) {
    const header = line.match(/^COPY public\."([^"]+)" \((.+)\) FROM stdin;$/);
    if (header) {
      tableName = header[1];
      columns = header[2]
        .split(", ")
        .map((column) => column.replaceAll('"', ""));
      tables.set(tableName, []);
      continue;
    }
    if (!tableName) continue;
    if (line === "\\.") {
      tableName = undefined;
      columns = [];
      continue;
    }
    const values = line.split("\t").map(decodeCopyValue);
    if (values.length !== columns.length)
      throw new Error(
        `Invalid COPY row for public.${tableName}: expected ${columns.length} columns, received ${values.length}.`,
      );
    tables
      .get(tableName)
      ?.push(Object.fromEntries(columns.map((key, i) => [key, values[i]])));
  }
  return tables;
}

function table<T extends Row>(tables: Map<string, Row[]>, name: string): T[] {
  const rows = tables.get(name);
  if (!rows) throw new Error(`The dump does not contain public.${name}.`);
  return rows as T[];
}

function email(value: string): string {
  return value.trim().toLowerCase();
}

function date(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function slug(value: string, suffix: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || "club"}-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "Sin nombre",
    lastName: parts.join(" ") || "Sin apellido",
  };
}

function isTrue(value: string | null): boolean {
  return value === "t" || value === "true";
}

function personIdForUser(userId: string): string {
  return `legacy-person-user-${userId}`;
}

function accountIdForUser(userId: string): string {
  return `legacy-account-${userId}`;
}

function clubIdForLegacy(clubId: string): string {
  return `legacy-club-${clubId}`;
}

function organizationIdForLegacyMembership(clubId: string): string {
  return clubId === LEGACY_DISTRICT_PLACEHOLDER_ID
    ? DISTRICT_4845.id
    : clubIdForLegacy(clubId);
}

function membershipIdForLegacy(membershipId: string): string {
  return `legacy-membership-${membershipId}`;
}

function validate(
  clubs: LegacyClub[],
  users: LegacyUser[],
  memberships: LegacyMembership[],
): string[] {
  const errors: string[] = [];
  const emails = new Map<string, number>();
  const clubCodes = new Map<string, number>();
  for (const user of users) {
    const normalized = email(user.email);
    emails.set(normalized, (emails.get(normalized) ?? 0) + 1);
  }
  for (const [address, count] of emails)
    if (count > 1)
      errors.push(`Duplicated public.User email: ${address} (${count} rows).`);
  for (const club of clubs) {
    const code = club.code.trim();
    if (!code) errors.push(`Club ${club.id} has no code.`);
    clubCodes.set(code, (clubCodes.get(code) ?? 0) + 1);
  }
  for (const [code, count] of clubCodes)
    if (count > 1)
      errors.push(`Duplicated public.Club code: ${code} (${count} rows).`);
  const clubIds = new Set(clubs.map((club) => club.id));
  const userIds = new Set(users.map((user) => user.id));
  for (const membership of memberships) {
    if (
      membership.clubId !== LEGACY_DISTRICT_PLACEHOLDER_ID &&
      !clubIds.has(membership.clubId)
    )
      errors.push(
        `Membership ${membership.id} references excluded or unknown club ${membership.clubId}.`,
      );
    if (!userIds.has(membership.userId))
      errors.push(
        `Membership ${membership.id} references unknown user ${membership.userId}.`,
      );
  }
  return errors;
}

async function main(): Promise<void> {
  const dumpPath = process.env.LEGACY_IMPORT_DUMP_PATH;
  if (!dumpPath)
    throw new Error(
      "Set LEGACY_IMPORT_DUMP_PATH to the SQL dump before running the legacy importer.",
    );

  const tables = parsePublicCopySections(
    await readFile(resolve(dumpPath), "utf8"),
  );
  for (const name of REQUIRED_TABLES)
    if (!tables.has(name)) throw new Error(`Missing public.${name} in dump.`);
  const legacyClubs = table<LegacyClub>(tables, "Club");
  const excludedClub = legacyClubs.find(
    (club) => club.id === LEGACY_DISTRICT_PLACEHOLDER_ID,
  );
  if (!excludedClub)
    throw new Error(
      `Expected district placeholder ${LEGACY_DISTRICT_PLACEHOLDER_ID} was not found in public.Club.`,
    );
  const clubs = legacyClubs.filter(
    (club) => club.id !== LEGACY_DISTRICT_PLACEHOLDER_ID,
  );
  const users = table<LegacyUser>(tables, "User");
  const memberships = table<LegacyMembership>(tables, "Membership");
  const errors = validate(clubs, users, memberships);
  const summary = {
    district: DISTRICT_4845.code,
    excludedLegacyClub: {
      id: excludedClub.id,
      name: excludedClub.name,
    },
    clubs: clubs.length,
    users: users.length,
    membershipRows: memberships.length,
    districtMembershipRows: memberships.filter(
      (membership) => membership.clubId === LEGACY_DISTRICT_PLACEHOLDER_ID,
    ).length,
    clubMembershipRows: memberships.filter(
      (membership) => membership.clubId !== LEGACY_DISTRICT_PLACEHOLDER_ID,
    ).length,
    uniqueMemberships: new Set(
      memberships.map(
        (membership) => `${membership.userId}\u0000${membership.clubId}`,
      ),
    ).size,
    errors,
  };

  if (!process.argv.includes("--apply")) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          scope: ["District", "Club", "User", "Membership"],
          ...summary,
        },
        null,
        2,
      ),
    );
    if (errors.length) process.exitCode = 1;
    return;
  }
  if (process.env.LEGACY_IMPORT_CONFIRM !== "IMPORT_LEGACY_USERS_AND_CLUBS")
    throw new Error(
      "Refusing to write. Set LEGACY_IMPORT_CONFIRM=IMPORT_LEGACY_USERS_AND_CLUBS after reviewing dry-run.",
    );
  if (errors.length)
    throw new Error(
      `Refusing to write ${errors.length} invalid legacy records. Run dry-run for details.`,
    );

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.organization.upsert({
        where: { id: DISTRICT_4845.id },
        update: {},
        create: {
          ...DISTRICT_4845,
          type: OrganizationType.DISTRICT,
          status: OrganizationStatus.ACTIVE,
          timezone: "America/Argentina/Cordoba",
          attributes: { importSource: "legacy-mi-rotaract" },
        },
      });
      for (const club of clubs) {
        await tx.organization.upsert({
          where: { id: clubIdForLegacy(club.id) },
          update: { parentId: DISTRICT_4845.id },
          create: {
            id: clubIdForLegacy(club.id),
            parentId: DISTRICT_4845.id,
            code: club.code,
            name: club.name,
            slug: slug(club.name, club.code),
            type: OrganizationType.CLUB,
            status:
              club.status === "ACTIVE"
                ? OrganizationStatus.ACTIVE
                : OrganizationStatus.INACTIVE,
            timezone: "America/Argentina/Cordoba",
            city: club.city,
            region: club.zone,
            contactEmail: club.contactEmail ? email(club.contactEmail) : null,
            contactPhone: club.contactPhone,
            description: club.description,
            foundedAt: date(club.foundedAt),
            logoUrl: club.logoUrl,
            attributes: {
              importSource: "legacy-mi-rotaract",
              legacyClubId: club.id,
            },
            createdAt: date(club.createdAt) ?? new Date(),
          },
        });
      }
      for (const user of users) {
        const accountEmail = email(user.email);
        const personId = personIdForUser(user.id);
        const name = splitName(user.fullName);
        await tx.person.upsert({
          where: { id: personId },
          update: {},
          create: {
            id: personId,
            ...name,
            displayName: user.fullName,
            primaryEmail: accountEmail,
            externalReference: `legacy:user:${user.id}`,
            metadata: {
              importSource: "legacy-mi-rotaract",
              legacyUserId: user.id,
              legacyRole: user.role,
            },
            createdAt: date(user.createdAt) ?? new Date(),
          },
        });
        const existing = await tx.userAccount.findUnique({
          where: { emailNormalized: accountEmail },
        });
        if (existing) {
          if (existing.personId !== personId)
            throw new Error(
              `Account email collision: ${accountEmail} belongs to another Kernel person.`,
            );
          continue;
        }
        const bcryptHash = BCRYPT_PREFIX.test(user.passwordHash)
          ? user.passwordHash
          : null;
        await tx.userAccount.create({
          data: {
            id: accountIdForUser(user.id),
            personId,
            email: accountEmail,
            emailNormalized: accountEmail,
            passwordHash:
              bcryptHash ??
              (await argon2.hash(randomBytes(48).toString("base64url"))),
            mustChangePassword: !bcryptHash || isTrue(user.mustChangePassword),
            status:
              user.isActive === "t"
                ? AccountStatus.ACTIVE
                : AccountStatus.DISABLED,
            platformRole:
              user.role === "SUPERADMIN"
                ? PlatformRole.SUPERADMIN
                : PlatformRole.USER,
            emailVerifiedAt:
              user.isActive === "t"
                ? (date(user.createdAt) ?? new Date())
                : null,
            createdAt: date(user.createdAt) ?? new Date(),
          },
        });
      }
      for (const membership of memberships) {
        const organizationId = organizationIdForLegacyMembership(
          membership.clubId,
        );
        const personId = personIdForUser(membership.userId);
        const existing = await tx.organizationMembership.findUnique({
          where: { organizationId_personId: { organizationId, personId } },
        });
        if (existing) continue;
        const endedAt = date(membership.activeUntil);
        const status: MembershipStatus =
          endedAt && endedAt < new Date() ? "INACTIVE" : "ACTIVE";
        const created = await tx.organizationMembership.create({
          data: {
            id: membershipIdForLegacy(membership.id),
            organizationId,
            personId,
            status,
            joinedAt: date(membership.activeFrom),
            endedAt,
            metadata: {
              importSource: "legacy-mi-rotaract",
              legacyMembershipId: membership.id,
              legacyOrganizationId: membership.clubId,
              legacyClubRole: membership.clubRole,
              legacyTitle: membership.title,
              legacyIsPresident: isTrue(membership.isPresident),
              // Deliberately metadata only: this import must not create appointments.
            },
            createdAt: date(membership.activeFrom) ?? new Date(),
          },
        });
        await tx.membershipTransition.create({
          data: {
            membershipId: created.id,
            type: MembershipTransitionType.CREATED,
            toStatus: status,
            effectiveAt: date(membership.activeFrom) ?? new Date(),
            reasonCode: "LEGACY_IMPORT",
            commandId: `legacy-import:${membership.id}`,
            createdAt: date(membership.activeFrom) ?? new Date(),
          },
        });
      }
    });
    console.log(
      JSON.stringify(
        {
          mode: "applied",
          scope: ["District", "Club", "User", "Membership"],
          ...summary,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
