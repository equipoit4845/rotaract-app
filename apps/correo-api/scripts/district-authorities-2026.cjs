/* eslint-disable */
// One-off (2026-10-16): the district's authorities for 2026-2027, through the
// kernel's own services (audit, outbox events and role derivation included),
// acting as the outgoing RDR. Idempotent: re-running skips what is done.
//
//   1. Agustina Rivas Piasentini: first name "Agustin" → "Agustina".
//   2. New district position "Comité IT" (DISTRICT_COMITE_IT) with its own
//      role, carrying the same permissions as the RDR's.
//   3. Facundo Cubells: Comité IT (before leaving RDR, so his personal
//      mailbox never goes read-only).
//   4. Facundo Cubells leaves RDR; Julio Casola (RC Asunción) becomes RDR.
//   5. Agustina Rivas Piasentini becomes Secretary.
//
// Runs inside the kernel api container:
//   docker cp apps/correo-api/scripts/district-authorities-2026.cjs <api>:/tmp/
//   docker exec <api> node /tmp/district-authorities-2026.cjs
const { randomUUID } = require('crypto');
const path = require('path');

const DIST = '/workspace/apps/institutional-kernel-api/dist';
const req = (p) => require(path.join(DIST, p));

const DISTRICT = 'district-4845';
const PERIOD = 'district-4845-period-2026-2027';
const FACUNDO = 'legacy-person-user-cmnnicoay0000r20180x21cku';
const FACUNDO_MEMBERSHIP = 'legacy-membership-cmnnicqd40004r201gpjyfmco';
const FACUNDO_RDR = 'manual-appointment-rdr-fmatias-2026-2027';
const JULIO_MEMBERSHIP = 'legacy-membership-cmo3c3iuo000bpb01nloxhde1';
const AGUSTINA = 'legacy-person-user-cmonhpsfm0003mu019aaqi8ij';
const AGUSTINA_MEMBERSHIP = 'legacy-membership-cmonhpsis0005mu0138k7n2o2';
const IT_CODE = 'DISTRICT_COMITE_IT';

const ctx = (operation) => ({
  commandId: randomUUID(),
  actor: { type: 'USER', id: FACUNDO },
  operation,
  correlationId: randomUUID(),
  ipAddress: '127.0.0.1',
  userAgent: 'correo-api/district-authorities-2026',
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

    // An ACTIVE appointment of this membership in this position, else create and activate one.
    const appoint = async (label, membershipId, positionDefinitionId) => {
      const existing = await prisma.appointment.findFirst({
        where: { organizationId: DISTRICT, periodId: PERIOD, membershipId, positionDefinitionId, status: 'ACTIVE' },
      });
      if (existing) return log(`${label} already active`, existing.id);
      const created = await kernel.createAppointment(
        DISTRICT,
        { membershipId, periodId: PERIOD, positionDefinitionId, startsAt: new Date().toISOString() },
        ctx('CreateAppointment'),
      );
      await kernel.transitionAppointment(created.id, 'ELECTED', {}, ctx('ELECTEDAppointment'));
      await kernel.transitionAppointment(created.id, 'ACTIVE', {}, ctx('ACTIVEAppointment'));
      log(`${label} active`, created.id);
    };

    // 1. Agustina's first name.
    const agustina = await prisma.person.findUniqueOrThrow({ where: { id: AGUSTINA } });
    if (agustina.firstName === 'Agustin') {
      await kernel.updatePerson(AGUSTINA, { firstName: 'Agustina' }, ctx('UpdatePerson'));
      log('Agustina first name fixed');
    } else log('Agustina first name already', agustina.firstName);

    // 2. Comité IT, with the RDR's permissions.
    let it = await prisma.positionDefinition.findUnique({ where: { code: IT_CODE } });
    if (!it) {
      it = await kernel.createPosition(
        {
          code: IT_CODE,
          name: 'Comité IT',
          description: 'Comité de Tecnología del distrito: administra Mi Rotaract y sus aplicaciones.',
          organizationType: 'DISTRICT',
          ownerOrganizationId: DISTRICT,
          isSingletonPerPeriod: false,
          grantsPermissions: true,
        },
        ctx('CreatePositionDefinition'),
      );
      log('Comité IT position created', it.id);
    } else log('Comité IT position exists', it.id);
    const rdr = await prisma.positionDefinition.findUniqueOrThrow({ where: { code: 'DISTRICT_RDR' } });
    const wanted = await kernel.positionPermissions(rdr.id);
    const have = new Set((await kernel.positionPermissions(it.id)).map((p) => p.id));
    for (const permission of wanted.filter((p) => !have.has(p.id)))
      await kernel.positionPermission(it.id, permission.id, true, ctx('AttachPermissionToPosition'));
    log('Comité IT permissions', `${wanted.length} (as RDR)`);

    // 3. Facundo → Comité IT.
    await appoint('Facundo Comité IT', FACUNDO_MEMBERSHIP, it.id);

    // 4. Facundo leaves RDR, Julio takes it.
    const facundoRdr = await prisma.appointment.findUniqueOrThrow({ where: { id: FACUNDO_RDR } });
    if (facundoRdr.status === 'ACTIVE') {
      await kernel.transitionAppointment(FACUNDO_RDR, 'ENDED', {}, ctx('ENDEDAppointment'));
      log('Facundo RDR ended');
    } else log('Facundo RDR already', facundoRdr.status);
    await appoint('Julio RDR', JULIO_MEMBERSHIP, rdr.id);

    // 5. Agustina → Secretary.
    const secretary = await prisma.positionDefinition.findUniqueOrThrow({ where: { code: 'DISTRICT_SECRETARY' } });
    await appoint('Agustina Secretaría', AGUSTINA_MEMBERSHIP, secretary.id);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
