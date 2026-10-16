/* eslint-disable */
// One-off (2026-10-16): Santiago Nuñez back as an active member of RC Posadas
// and appointed to Comité IT, through the kernel's own services, acting as
// Facundo Cubells (Comité IT). Idempotent.
//
//   docker cp apps/correo-api/scripts/comite-it-santiago.cjs <api>:/tmp/
//   docker exec <api> node /tmp/comite-it-santiago.cjs
const { randomUUID } = require('crypto');
const path = require('path');

const DIST = '/workspace/apps/institutional-kernel-api/dist';
const req = (p) => require(path.join(DIST, p));

const DISTRICT = 'district-4845';
const PERIOD = 'district-4845-period-2026-2027';
const ACTOR = 'legacy-person-user-cmnnicoay0000r20180x21cku';
const MEMBERSHIP = 'legacy-membership-cmqti9box00tqmy01dguvj9mn'; // RC Posadas

const ctx = (operation) => ({
  commandId: randomUUID(),
  actor: { type: 'USER', id: ACTOR },
  operation,
  correlationId: randomUUID(),
  ipAddress: '127.0.0.1',
  userAgent: 'correo-api/comite-it-santiago',
});
const log = (step, detail) => console.log(`- ${step}${detail ? `: ${detail}` : ''}`);

async function main() {
  const { NestFactory } = require(path.join(DIST, '../node_modules/@nestjs/core'));
  const { AppModule } = req('app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const { PrismaService } = req('infrastructure/prisma/prisma.service.js');
    const { KernelService } = req('application/kernel/kernel.service.js');
    const prisma = app.get(PrismaService);
    const kernel = app.get(KernelService);

    const membership = await prisma.organizationMembership.findUniqueOrThrow({ where: { id: MEMBERSHIP } });
    if (membership.status === 'INACTIVE') {
      await kernel.transitionMembership(
        MEMBERSHIP,
        'ACTIVE',
        'REACTIVATED',
        { reasonText: 'Reactivado para asumir Comité IT del distrito.' },
        ctx('reactivateMembership'),
      );
      log('RC Posadas membership reactivated');
    } else log('RC Posadas membership already', membership.status);

    const it = await prisma.positionDefinition.findUniqueOrThrow({ where: { code: 'DISTRICT_COMITE_IT' } });
    const existing = await prisma.appointment.findFirst({
      where: { organizationId: DISTRICT, periodId: PERIOD, membershipId: MEMBERSHIP, positionDefinitionId: it.id, status: 'ACTIVE' },
    });
    if (existing) return log('Comité IT already active', existing.id);
    const created = await kernel.createAppointment(
      DISTRICT,
      { membershipId: MEMBERSHIP, periodId: PERIOD, positionDefinitionId: it.id, startsAt: new Date().toISOString() },
      ctx('CreateAppointment'),
    );
    await kernel.transitionAppointment(created.id, 'ELECTED', {}, ctx('ELECTEDAppointment'));
    await kernel.transitionAppointment(created.id, 'ACTIVE', {}, ctx('ACTIVEAppointment'));
    log('Comité IT active', created.id);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
