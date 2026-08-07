/** Explicit seed of the verified current club presidents for Rotary year 2026-2027. */
import {
  AppointmentStatus,
  AssignmentEffect,
  MembershipStatus,
  MembershipTransitionType,
  PeriodStatus,
  PrismaClient,
  ScopeType,
} from "@prisma/client";

const prisma = new PrismaClient();
const PERIOD = {
  code: "2026-2027",
  name: "Período rotario 2026-2027",
  sequence: 2026,
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2027-06-30T00:00:00.000Z"),
} as const;
const MINGA_GUAZU_EMAIL = "victorinariosperalta@gmail.com";

const presidents = [
  ["Liry Ovelar", "Rotaract Club Asunción", "liryovel12@gmail.com"],
  [
    "Dulce María Lledó Burguez",
    "Rotaract Club Asunción Catedral",
    "dulcelledob@gmail.com",
  ],
  ["Andrea Meza", "Rotaract Club Capiatá", "aymeza30@gmail.com"],
  [
    "Tania Cáceres",
    "Rotaract Club Ciudad del Este",
    "cacerestania05@gmail.com",
  ],
  [
    "Félix Antonio Sánchez Galeano",
    "Rotaract Club Concepción",
    "felixantoniosanchez.g@gmail.com",
  ],
  [
    "Carolain Antonela Roggensack",
    "Rotaract Club Corrientes Costanera",
    "carolainantonelaroggensack@gmail.com",
  ],
  [
    "Brisa Oriana Zárate",
    "Rotaract Club Costanera de Formosa",
    "brisazara17@gmail.com",
  ],
  ["Maxima Ramirez Arrua", "Rotaract Club Encarnación", "maximrra@gmail.com"],
  ["Diana Benítez", "Rotaract Club Encarnación Norte", "db8410910@gmail.com"],
  [
    "Enrique Castellano",
    "Rotaract Club Encarnación Oeste",
    "enriquecastellano95@gmail.com",
  ],
  [
    "Leticia Fernandez",
    "Rotaract Club Fernando de la Mora",
    "leta.f15@gmail.com",
  ],
  [
    "Ramiro Maximiliano Masacote",
    "Rotaract Club Formosa 9 de julio",
    "maximasacote10@gmail.com",
  ],
  ["Thiago Bejarano", "Rotaract Club Luque", "bejaranothiago7@gmail.com"],
  ["Sandra Dalmaso", "Rotaract Club Mercedes", "sandra18279@gmail.com"],
  [
    "Victorina Ríos peralta",
    "Rotaract Club Minga Guazú",
    "victorinariosperalta@gmail.com",
  ],
  [
    "Héctor Nieves",
    "Rotaract Club Paso de los libres",
    "hectorieves12@gmail.com",
  ],
  ["Nery Acuña", "Rotaract Club Pilar Ñeembucú", "neryrubenh@gmail.com"],
  ["Alan Alberto Darnet", "Rotaract Club Posadas", "adarnet.rtc@gmail.com"],
  ["Alicia Regina", "Rotaract Club Posadas Norte", "aliirb555@gmail.com"],
  [
    "Elena Gonzalez",
    "Rotaract Club Posadas Oeste",
    "gonzalezelenabelen@gmail.com",
  ],
  [
    "Ana Lucia Losch Cabrera",
    "Rotaract Club Resistencia Centro",
    "analucialosch@gmail.com",
  ],
  [
    "Nicolás Gassmann",
    "Rotaract Club Resistencia Oeste",
    "gassmann1nicolas@gmail.com",
  ],
  ["Jazmin Saipe", "Rotaract Club Resistencia Sur", "jazminsaipe@gmail.com"],
  [
    "Verónica Adela Monzón Pando",
    "Rotaract Club Rio Paraná Corrientes",
    "veritusmonpin@gmail.com",
  ],
  [
    "Jhadira Nair Figueredo Vera",
    "Rotaract Club San Lorenzo",
    "jhadirafigueredo18@gmail.com",
  ],
  [
    "Presidente Rotaract Club Santo Tomé",
    "Rotaract Club Santo Tomé",
    "milenatressen.f@gmail.com",
  ],
  [
    "Guadalupe Del Puerto",
    "Rotaract Club Sin Fronteras",
    "guadadelpuerto_98@hotmail.com",
  ],
  [
    "Esteban Florentín Sprung",
    "Rotaract Club Trinidad Asunción",
    "estebanflspr@gmail.com",
  ],
] as const;

type President = (typeof presidents)[number];

async function resolve(president: President) {
  const [name, clubName, email] = president;
  const account = await prisma.userAccount.findUnique({
    where: { emailNormalized: email.toLowerCase() },
  });
  const organization = await prisma.organization.findFirst({
    where: { name: clubName, type: "CLUB" },
  });
  const membership =
    account && organization
      ? await prisma.organizationMembership.findUnique({
          where: {
            organizationId_personId: {
              organizationId: organization.id,
              personId: account.personId,
            },
          },
        })
      : null;
  return { name, clubName, email, account, organization, membership };
}

async function preflight() {
  const resolved = await Promise.all(presidents.map(resolve));
  const errors: string[] = [];
  for (const item of resolved) {
    if (!item.account) errors.push(`Account missing: ${item.email}.`);
    if (!item.organization) errors.push(`Club missing: ${item.clubName}.`);
    if (item.membership && item.membership.status !== MembershipStatus.ACTIVE)
      errors.push(
        `Membership is not active: ${item.email} / ${item.clubName}.`,
      );
    if (
      !item.membership &&
      item.email !== MINGA_GUAZU_EMAIL &&
      item.account &&
      item.organization
    )
      errors.push(
        `Active membership missing: ${item.email} / ${item.clubName}.`,
      );
  }
  const presidentPosition = await prisma.positionDefinition.findUnique({
    where: { code: "CLUB_PRESIDENT" },
  });
  const presidentRole = await prisma.roleDefinition.findUnique({
    where: { code: "CLUB_PRESIDENT" },
  });
  if (!presidentPosition)
    errors.push("PositionDefinition CLUB_PRESIDENT is missing.");
  if (!presidentRole) errors.push("RoleDefinition CLUB_PRESIDENT is missing.");
  return {
    errors,
    presidents: presidents.length,
    readyMemberships: resolved.filter(
      (item) => item.membership?.status === MembershipStatus.ACTIVE,
    ).length,
    membershipsToCreate: resolved.filter((item) => !item.membership).length,
  };
}

async function apply(): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const position = await tx.positionDefinition.findUniqueOrThrow({
        where: { code: "CLUB_PRESIDENT" },
      });
      const role = await tx.roleDefinition.findUniqueOrThrow({
        where: { code: "CLUB_PRESIDENT" },
      });
      for (const president of presidents) {
        const [name, clubName, email] = president;
        const account = await tx.userAccount.findUniqueOrThrow({
          where: { emailNormalized: email.toLowerCase() },
        });
        const organization = await tx.organization.findFirstOrThrow({
          where: { name: clubName, type: "CLUB" },
        });
        let membership = await tx.organizationMembership.findUnique({
          where: {
            organizationId_personId: {
              organizationId: organization.id,
              personId: account.personId,
            },
          },
        });
        if (!membership) {
          if (email !== MINGA_GUAZU_EMAIL)
            throw new Error(`Refusing to infer membership for ${email}.`);
          membership = await tx.organizationMembership.create({
            data: {
              id: "current-president-membership-minga-guazu-2026",
              organizationId: organization.id,
              personId: account.personId,
              status: MembershipStatus.ACTIVE,
              joinedAt: PERIOD.startDate,
              metadata: {
                importSource: "current-club-presidents-2026-2027",
                inferredForAppointment: "CLUB_PRESIDENT",
              },
            },
          });
          await tx.membershipTransition.create({
            data: {
              membershipId: membership.id,
              type: MembershipTransitionType.CREATED,
              toStatus: MembershipStatus.ACTIVE,
              effectiveAt: PERIOD.startDate,
              reasonCode: "CURRENT_PRESIDENT_IMPORT",
              commandId: "seed-current-club-presidents-2026-2027",
            },
          });
        }
        if (membership.status !== MembershipStatus.ACTIVE)
          throw new Error(`Membership is not active for ${email}.`);
        const otherActivePeriod = await tx.institutionalPeriod.findFirst({
          where: {
            organizationId: organization.id,
            status: PeriodStatus.ACTIVE,
            code: { not: PERIOD.code },
          },
        });
        if (otherActivePeriod)
          throw new Error(
            `Club ${clubName} already has active period ${otherActivePeriod.code}.`,
          );
        const period = await tx.institutionalPeriod.upsert({
          where: {
            organizationId_code: {
              organizationId: organization.id,
              code: PERIOD.code,
            },
          },
          update: {},
          create: {
            id: `rotary-period-2026-2027-${organization.id}`,
            organizationId: organization.id,
            ...PERIOD,
            status: PeriodStatus.ACTIVE,
          },
        });
        if (period.status !== PeriodStatus.ACTIVE)
          throw new Error(
            `Period ${PERIOD.code} for ${clubName} is not active.`,
          );
        const activeAppointment = await tx.appointment.findFirst({
          where: {
            organizationId: organization.id,
            periodId: period.id,
            positionDefinitionId: position.id,
            status: AppointmentStatus.ACTIVE,
          },
        });
        if (
          activeAppointment &&
          activeAppointment.membershipId !== membership.id
        )
          throw new Error(
            `Club ${clubName} already has another active president for ${PERIOD.code}.`,
          );
        const appointment =
          activeAppointment ??
          (await tx.appointment.create({
            data: {
              id: `current-president-2026-2027-${organization.id}`,
              organizationId: organization.id,
              membershipId: membership.id,
              periodId: period.id,
              positionDefinitionId: position.id,
              status: AppointmentStatus.ACTIVE,
              startsAt: PERIOD.startDate,
              endsAt: PERIOD.endDate,
              activatedAt: PERIOD.startDate,
            },
          }));
        const roleAssignment = await tx.roleAssignment.findFirst({
          where: { sourceAppointmentId: appointment.id, revokedAt: null },
        });
        if (!roleAssignment)
          await tx.roleAssignment.create({
            data: {
              personId: account.personId,
              roleDefinitionId: role.id,
              sourceAppointmentId: appointment.id,
              effect: AssignmentEffect.ALLOW,
              scopeType: ScopeType.ORGANIZATION,
              organizationId: organization.id,
              periodId: period.id,
              validFrom: PERIOD.startDate,
              validUntil: PERIOD.endDate,
              reason: `Current president import: ${name}`,
            },
          });
      }
    },
    { isolationLevel: "Serializable" },
  );
}

async function main(): Promise<void> {
  try {
    const result = await preflight();
    if (!process.argv.includes("--apply")) {
      console.log(
        JSON.stringify(
          { mode: "dry-run", period: PERIOD.code, ...result },
          null,
          2,
        ),
      );
      if (result.errors.length) process.exitCode = 1;
      return;
    }
    if (
      process.env.CURRENT_PRESIDENTS_CONFIRM !==
      "IMPORT_CURRENT_CLUB_PRESIDENTS"
    )
      throw new Error(
        "Refusing to write. Set CURRENT_PRESIDENTS_CONFIRM=IMPORT_CURRENT_CLUB_PRESIDENTS after reviewing dry-run.",
      );
    if (result.errors.length)
      throw new Error(
        `Refusing to write ${result.errors.length} invalid current-president assignments.`,
      );
    await apply();
    console.log(
      JSON.stringify(
        { mode: "applied", period: PERIOD.code, ...result },
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
