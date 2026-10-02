#!/usr/bin/env node
// Seeds a DISPOSABLE Kernel for the SDK conformance suite and prints the
// env vars the runners need.
//
//   KERNEL_DATABASE_URL=postgresql://...  MR_BASE_URL=http://127.0.0.1:3911/api/kernel/v1 \
//     node sdks/conformance/seed.mjs > /tmp/conformance.env
//   node --env-file=/tmp/conformance.env sdks/conformance/run-js.mjs
//   .venv/bin/python sdks/conformance/run_python.py --env-file /tmp/conformance.env
//
// It writes through the public API whenever there is one (organizations,
// memberships, periods, appointments) and through Prisma only where a test
// shortcut is unavoidable (activating accounts without the verification
// email, promoting the seed admin, registering apps with a known secret),
// mirroring apps/institutional-kernel-api/test/support/test-app.ts.
//
// NEVER point it at production: it creates users, clubs and apps.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const kernelRequire = createRequire(
  new URL("../../apps/institutional-kernel-api/package.json", import.meta.url),
);
const { PrismaClient } = kernelRequire("@prisma/client");
const argon2 = kernelRequire("argon2");

const BASE = (
  process.env.MR_BASE_URL ?? "http://127.0.0.1:3911/api/kernel/v1"
).replace(/\/+$/, "");
const REDIRECT =
  process.env.MR_REDIRECT_URI ?? "http://localhost:8765/callback";
const PASSWORD = "conformance-password-0001";
const tag = `conf-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;

if (!process.env.KERNEL_DATABASE_URL) {
  console.error(
    "Falta KERNEL_DATABASE_URL (base de datos DESCARTABLE del kernel).",
  );
  process.exit(2);
}
for (const forbidden of [":5432/", "@postgres:"])
  if (
    process.env.KERNEL_DATABASE_URL.includes(forbidden) &&
    !process.env.MR_SEED_I_KNOW_WHAT_I_AM_DOING
  ) {
    console.error(
      `KERNEL_DATABASE_URL contiene "${forbidden}" (¿producción?). Abortado.`,
    );
    process.exit(2);
  }

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.KERNEL_DATABASE_URL } },
});

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method !== "GET" ? { "idempotency-key": randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok)
    throw new Error(
      `${method} ${path} → ${response.status} ${text.slice(0, 300)}`,
    );
  return data;
}

async function account(label, firstName) {
  const email = `${tag}-${label}@example.test`;
  const registered = await api("POST", "/auth/register", {
    body: { email, password: PASSWORD, firstName, lastName: label },
  });
  await prisma.userAccount.update({
    where: { id: registered.id },
    data: { status: "ACTIVE", emailVerifiedAt: new Date() },
  });
  const role = await prisma.roleDefinition.findUnique({
    where: { code: "PLATFORM_USER" },
  });
  if (role)
    await prisma.roleAssignment.create({
      data: {
        personId: registered.personId,
        roleDefinitionId: role.id,
        scopeType: "PLATFORM",
        effect: "ALLOW",
        validFrom: new Date(),
      },
    });
  const login = async () =>
    (await api("POST", "/auth/login", { body: { email, password: PASSWORD } }))
      .accessToken;
  return {
    personId: registered.personId,
    accountId: registered.id,
    email,
    login,
  };
}

async function main() {
  const superadmin = await account("admin", "Admin");
  await prisma.userAccount.updateMany({
    where: { personId: superadmin.personId },
    data: { platformRole: "SUPERADMIN" },
  });
  const admin = await superadmin.login();
  const as = (method, path, body) => api(method, path, { token: admin, body });

  const district = await as("POST", "/organizations", {
    type: "DISTRICT",
    code: `D-${tag}`,
    name: `Distrito ${tag}`,
    slug: `d-${tag}`,
  });
  await as("POST", `/organizations/${district.id}/activate`);
  const club = async (label) => {
    const created = await as("POST", "/organizations", {
      type: "CLUB",
      code: `${label}-${tag}`,
      name: `Club ${label} ${tag}`,
      slug: `${label.toLowerCase()}-${tag}`,
      parentId: district.id,
    });
    await as("POST", `/organizations/${created.id}/activate`);
    return created.id;
  };
  const clubA = await club("A");
  const clubB = await club("B");

  const activeMember = async (personId, organizationId) => {
    const membership = await as(
      "POST",
      `/organizations/${organizationId}/memberships`,
      { personId },
    );
    await as("POST", `/memberships/${membership.id}/activate`);
    return membership.id;
  };

  // The person who logs in with "Ingresar con Mi Rotaract".
  const member = await account("member", "Ana");
  const memberMembership = await activeMember(member.personId, clubA);
  // Extra members without account, so members pagination (limit=2) has 3+ pages.
  for (const name of ["Bruno", "Carla", "Dario", "Elena"]) {
    const person = await as("POST", "/persons", {
      firstName: name,
      lastName: tag,
    });
    await activeMember(person.id, clubA);
  }
  // Somebody in club B only (outside the app's scope).
  const outsider = await as("POST", "/persons", {
    firstName: "Fuera",
    lastName: tag,
  });
  await activeMember(outsider.id, clubB);

  // A current period + president in club A (authorities/periods).
  const period = await as("POST", `/organizations/${clubA}/periods`, {
    code: `P-${tag}`,
    name: "2026-2027",
    sequence: 1,
    startDate: "2026-07-01",
    endDate: "2027-06-30",
  });
  await as("POST", `/periods/${period.id}/schedule`);
  await as("POST", `/periods/${period.id}/activate`);
  const presidency = await prisma.positionDefinition.findUniqueOrThrow({
    where: { code: "CLUB_PRESIDENT" },
  });
  const appointment = await as("POST", `/organizations/${clubA}/appointments`, {
    membershipId: memberMembership,
    periodId: period.id,
    positionDefinitionId: presidency.id,
  });
  await as("POST", `/appointments/${appointment.id}/elect`);
  await as("POST", `/appointments/${appointment.id}/activate`);

  // Apps, with the Kernel's credential formats (docs/11 §Credenciales).
  const newClientId = () => `mra_${randomBytes(10).toString("hex")}`;
  const confidentialId = newClientId();
  const secret = `mrs_${randomBytes(32).toString("base64url")}`;
  const oidcScopes = ["openid", "profile", "email", "memberships", "positions"];
  const confidential = await prisma.developerApp.create({
    data: {
      clientId: confidentialId,
      name: `Conformance server ${tag}`,
      type: "CONFIDENTIAL",
      organizationId: clubA,
      ownerPersonId: superadmin.personId,
      grantTypes: ["client_credentials", "authorization_code", "refresh_token"],
      scopes: [
        ...oidcScopes,
        "kernel.service.persons.read",
        "kernel.service.organizations.read",
        "kernel.service.memberships.read",
        "kernel.service.authorities.read",
        "kernel.service.periods.read",
        "kernel.service.authorization.check",
      ],
      redirectUris: [REDIRECT],
    },
  });
  await prisma.developerAppSecret.create({
    data: {
      appId: confidential.id,
      secretHash: await argon2.hash(secret, { type: argon2.argon2id }),
      hint: secret.slice(-4),
    },
  });
  const publicId = newClientId();
  await prisma.developerApp.create({
    data: {
      clientId: publicId,
      name: `Conformance SPA ${tag}`,
      type: "PUBLIC",
      organizationId: clubA,
      ownerPersonId: superadmin.personId,
      grantTypes: ["authorization_code", "refresh_token"],
      scopes: oidcScopes,
      redirectUris: [REDIRECT],
    },
  });

  const env = {
    MR_BASE_URL: BASE,
    MR_CLIENT_ID: confidentialId,
    MR_CLIENT_SECRET: secret,
    MR_ORG_ID: clubA,
    MR_OTHER_ORG_ID: clubB,
    MR_DISTRICT_ID: district.id,
    MR_PERSON_ID: member.personId,
    MR_OUTSIDER_PERSON_ID: outsider.id,
    MR_PUBLIC_CLIENT_ID: publicId,
    MR_REDIRECT_URI: REDIRECT,
    // Platform session token (10 min): drives /oauth/authorize like the Web.
    MR_USER_ACCESS_TOKEN: await member.login(),
    MR_USER_EMAIL: member.email,
    MR_USER_PASSWORD: PASSWORD,
  };
  // KEY=value: usable with `node --env-file`, `docker --env-file` and
  // `set -a; . ./file; set +a` (no value contains spaces or quotes).
  for (const [key, value] of Object.entries(env))
    console.log(`${key}=${value}`);
  // Fingerprint only, never the secret itself, on stderr.
  console.error(
    `seed ${tag} ok (secret sha256 ${createHash("sha256").update(secret).digest("hex").slice(0, 8)})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
