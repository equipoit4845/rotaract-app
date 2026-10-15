/* eslint-disable */
// One-off: registers Correo Distrital in the Institutional Kernel through the
// kernel's own services (hashing, review, audit and outbox events included),
// acting as the RDR. Idempotent: re-running skips what already exists.
//
// Runs inside the kernel api container:
//   docker cp apps/correo-api/scripts/register-in-kernel.cjs <api>:/tmp/
//   docker cp apps/correo-api/mirotaract.module.json <api>:/tmp/correo.module.json
//   docker exec -e CORREO_ACTOR_PERSON_ID=<rdr personId> <api> node /tmp/register-in-kernel.cjs
//
// The client secret (shown once) is written to /tmp/correo-app.json (0600)
// inside the container, never to stdout.
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const DIST = '/workspace/apps/institutional-kernel-api/dist';
const req = (p) => require(path.join(DIST, p));

const DISTRICT = 'district-4845';
const APP_NAME = 'Correo Distrital';
const PUBLIC_URL = 'https://correo.rotaract4845.com';
const ACTOR = process.env.CORREO_ACTOR_PERSON_ID;
if (!ACTOR) throw new Error('CORREO_ACTOR_PERSON_ID is required');

const manifest = JSON.parse(fs.readFileSync('/tmp/correo.module.json', 'utf8'));
const defaults = Object.fromEntries(
  Object.entries(manifest.configurationSchema.properties).map(([k, v]) => [k, v.default]),
);

const ctx = (operation) => ({
  commandId: randomUUID(),
  actor: { type: 'USER', id: ACTOR },
  operation,
  correlationId: randomUUID(),
  ipAddress: '127.0.0.1',
  userAgent: 'correo-api/register-in-kernel',
});

const log = (step, detail) => console.log(`- ${step}${detail ? `: ${detail}` : ''}`);

async function main() {
  const { NestFactory } = require(path.join(DIST, '../node_modules/@nestjs/core'));
  const { AppModule } = req('app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const { PrismaService } = req('infrastructure/prisma/prisma.service.js');
    const { DeveloperAppsService } = req('application/developer-apps/developer-apps.service.js');
    const { AppReviewService } = req('application/governance/app-review.service.js');
    const { KernelService } = req('application/kernel/kernel.service.js');
    const prisma = app.get(PrismaService);
    const apps = app.get(DeveloperAppsService);
    const reviews = app.get(AppReviewService);
    const kernel = app.get(KernelService);

    // 1. Developer app: login (authorization_code) + own access (client_credentials).
    let devApp = await prisma.developerApp.findFirst({ where: { organizationId: DISTRICT, name: APP_NAME } });
    if (devApp) {
      log('app exists', devApp.clientId);
    } else {
      const created = await apps.create(
        {
          organizationId: DISTRICT,
          name: APP_NAME,
          description:
            'Correo @rotaract4845.com para la Representación Distrital, la Secretaría y la Tesorería mientras dura su mandato.',
          type: 'CONFIDENTIAL',
          grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
          scopes: [
            'openid',
            'profile',
            'positions',
            'kernel.service.authorities.read',
            'kernel.service.periods.read',
            'kernel.service.persons.read',
            'kernel.service.authorization.check',
          ],
          redirectUris: [`${PUBLIC_URL}/auth/callback`],
          purpose:
            'Bandeja de correo del Distrito 4845 para las autoridades distritales (RDR, Secretaría y Tesorería). Cada una recibe y envía desde nombre.apellido@rotaract4845.com y desde la dirección de su cargo. La casilla se abre sola al asumir el cargo y queda en solo lectura al terminar el mandato o el período. Usa el nombre de la persona para armar su dirección, sus cargos vigentes para saber qué casillas le tocan, los períodos para el vencimiento y el chequeo de permisos para decidir quién entra. No lee emails, teléfonos ni fechas de nacimiento.',
          privacyPolicyUrl: `${PUBLIC_URL}/privacidad`,
          contactEmail: 'facundo@cubells.com.ar',
        },
        ctx('createDeveloperApp'),
      );
      devApp = created.app;
      fs.writeFileSync(
        '/tmp/correo-app.json',
        JSON.stringify({ appId: devApp.id, clientId: devApp.clientId, clientSecret: created.clientSecret }),
        { mode: 0o600 },
      );
      log('app created', `${devApp.clientId} (secret in /tmp/correo-app.json)`);
    }

    // 2. RDR review: approve with the full checklist.
    devApp = await prisma.developerApp.findUniqueOrThrow({ where: { id: devApp.id } });
    if (devApp.reviewStatus === 'APPROVED') {
      log('review already approved');
    } else {
      await reviews.decide(
        devApp.id,
        {
          decision: 'approve',
          checklist: { purpose: true, data: true, owner: true, privacyPolicy: true, contact: true },
          reason: 'App distrital del equipo de Mi Rotaract; scopes mínimos, sin datos de contacto.',
        },
        ctx('reviewDeveloperApp'),
      );
      log('review approved');
    }

    // 3. Module `correo`, owned by the app.
    if (await prisma.moduleDefinition.findUnique({ where: { id: manifest.id } })) {
      log('module exists', manifest.id);
    } else {
      await kernel.registerModule({ appId: devApp.id, manifest }, ctx('registerModule'));
      log('module registered', `${manifest.id}@${manifest.version}`);
    }

    // 4. Installed and active in the district.
    let installation = await prisma.moduleInstallation.findUnique({
      where: { moduleId_organizationId: { moduleId: manifest.id, organizationId: DISTRICT } },
    });
    if (!installation) {
      await kernel.installModule(DISTRICT, manifest.id, { configuration: defaults }, ctx('installModule'));
      log('module installed', DISTRICT);
      installation = await prisma.moduleInstallation.findUniqueOrThrow({
        where: { moduleId_organizationId: { moduleId: manifest.id, organizationId: DISTRICT } },
      });
    }
    if (installation.status === 'ACTIVE') {
      log('installation active');
    } else {
      await kernel.transitionInstallation(DISTRICT, manifest.id, 'ACTIVE', ctx('activateModuleInstallation'));
      log('installation activated');
    }

    // 5. Tesorería distrital needs its own role before it can hold permissions.
    const positions = Object.fromEntries(
      (
        await prisma.positionDefinition.findMany({
          where: { code: { in: ['DISTRICT_RDR', 'DISTRICT_SECRETARY', 'DISTRICT_TREASURER'] } },
        })
      ).map((p) => [p.code, p]),
    );
    if (!positions.DISTRICT_TREASURER.defaultRoleCode) {
      await kernel.updatePosition(
        positions.DISTRICT_TREASURER.id,
        { grantsPermissions: true },
        ctx('updatePositionDefinition'),
      );
      positions.DISTRICT_TREASURER = await prisma.positionDefinition.findUniqueOrThrow({
        where: { id: positions.DISTRICT_TREASURER.id },
      });
      log('treasurer role created', positions.DISTRICT_TREASURER.defaultRoleCode);
    }

    // 6. Module permissions on the positions.
    const permissionIds = Object.fromEntries(
      (
        await prisma.permissionDefinition.findMany({
          where: { code: { in: ['correo.mailbox.use', 'correo.mailbox.manage'] } },
        })
      ).map((p) => [p.code, p.id]),
    );
    const grants = [
      ['DISTRICT_RDR', 'correo.mailbox.use'],
      ['DISTRICT_SECRETARY', 'correo.mailbox.use'],
      ['DISTRICT_TREASURER', 'correo.mailbox.use'],
      ['DISTRICT_RDR', 'correo.mailbox.manage'],
    ];
    for (const [code, permission] of grants) {
      const current = await kernel.positionPermissions(positions[code].id);
      const has = JSON.stringify(current).includes(`"${permission}"`);
      if (has) {
        log('already granted', `${permission} → ${code}`);
        continue;
      }
      await kernel.positionPermission(positions[code].id, permissionIds[permission], true, ctx('attachPermissionToPosition'));
      log('granted', `${permission} → ${code}`);
    }
  } finally {
    await app.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('FAILED:', error?.response ?? error?.message ?? error);
    process.exit(1);
  },
);
