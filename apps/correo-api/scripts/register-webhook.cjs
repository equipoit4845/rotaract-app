/* eslint-disable */
// One-off: subscribes Correo Distrital to the kernel events it handles,
// through the kernel's own WebhooksService (acting as the RDR), then sends a
// ping.v1 test delivery. Idempotent: an endpoint with the same URL is reused
// (its secret cannot be read again; rotate it from the console if lost).
//
//   docker cp apps/correo-api/scripts/register-webhook.cjs <api>:/tmp/
//   docker exec -e CORREO_ACTOR_PERSON_ID=<rdr personId> <api> node /tmp/register-webhook.cjs
//
// The signing secret (shown once) goes to /tmp/correo-webhook.json (0600)
// inside the container, never to stdout.
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const DIST = '/workspace/apps/institutional-kernel-api/dist';
const req = (p) => require(path.join(DIST, p));
const URL_ = 'https://correo.rotaract4845.com/correo-api/webhooks/mirotaract';
const EVENTS = ['appointment.activated.v1', 'appointment.ended.v1'];
const ACTOR = process.env.CORREO_ACTOR_PERSON_ID;
if (!ACTOR) throw new Error('CORREO_ACTOR_PERSON_ID is required');

const ctx = (operation) => ({
  commandId: randomUUID(),
  actor: { type: 'USER', id: ACTOR },
  operation,
  correlationId: randomUUID(),
  ipAddress: '127.0.0.1',
  userAgent: 'correo-api/register-webhook',
});

async function main() {
  const { NestFactory } = require(path.join(DIST, '../node_modules/@nestjs/core'));
  const { AppModule } = req('app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const { PrismaService } = req('infrastructure/prisma/prisma.service.js');
    const { WebhooksService } = req('application/webhooks/webhooks.service.js');
    const prisma = app.get(PrismaService);
    const webhooks = app.get(WebhooksService);

    const devApp = await prisma.developerApp.findFirstOrThrow({
      where: { organizationId: 'district-4845', name: 'Correo Distrital' },
    });
    let endpoint = (await webhooks.list(devApp.id)).find((e) => e.url === URL_);
    if (endpoint) {
      console.log(`- endpoint exists: ${endpoint.id}`);
    } else {
      const created = await webhooks.create(
        devApp.id,
        { url: URL_, eventTypes: EVENTS, description: 'Alta y vencimiento de casillas por cargo' },
        ctx('createWebhookEndpoint'),
      );
      endpoint = created.endpoint;
      fs.writeFileSync('/tmp/correo-webhook.json', JSON.stringify({ endpointId: endpoint.id, secret: created.secret }), {
        mode: 0o600,
      });
      console.log(`- endpoint created: ${endpoint.id} (${EVENTS.join(', ')}; secret in /tmp/correo-webhook.json)`);
    }
    if (process.env.SEND_TEST === '1') {
      const delivery = await webhooks.sendTest(devApp.id, endpoint.id, ctx('sendWebhookTest'));
      console.log(`- ping queued: delivery ${delivery.id} (${delivery.status})`);
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
