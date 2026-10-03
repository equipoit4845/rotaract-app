/**
 * Directory sync against a fake kernel Data API (client_credentials +
 * /service/*), on the scratch Postgres. Checks the mapping to the Dir* read
 * model, pagination, presidents / district roles, deactivation, on-demand
 * person sync, and that a kernel outage keeps the last synced data.
 */
import { INestApplication } from '@nestjs/common';
import { execSync } from 'child_process';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';

process.env.MEETINGS_TOKEN_SECRET = 'e2e-secret-e2e-secret-e2e-secret-0123456789';
process.env.MEETINGS_DIRECTORY_SYNC = 'off'; // driven by hand below
process.env.KERNEL_CLIENT_ID = 'mra_test';
process.env.KERNEL_CLIENT_SECRET = 'mrs_secret';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../src/main');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaService } = require('../src/prisma/prisma.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DirectorySyncService } = require('../src/directory/directory-sync.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DirectoryService } = require('../src/directory/directory.service');

const person = (id: string, name: string, email?: string) => ({
  id,
  displayName: name,
  firstName: name.split(' ')[0],
  lastName: name.split(' ')[1] ?? '',
  ...(email ? { email } : {}),
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const member = (orgId: string, p: ReturnType<typeof person>, status = 'ACTIVE') => ({
  membershipId: `m-${orgId}-${p.id}`,
  organizationId: orgId,
  personId: p.id,
  status,
  person: p,
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const authority = (orgId: string, code: string, p: ReturnType<typeof person>) => ({
  appointmentId: `a-${orgId}-${code}-${p.id}`,
  organizationId: orgId,
  periodId: 'per',
  positionCode: code,
  positionName: code,
  status: 'ACTIVE',
  person: { id: p.id, displayName: p.displayName, avatarUrl: null },
});

const P1 = person('k-p1', 'Paula Presidenta', 'p1@example.org');
const P2 = person('k-p2', 'Pedro Socio', 'p2@example.org');
const P3 = person('k-p3', 'Pía Inactiva');
const R = person('k-rdr', 'Rita RDR', 'rdr@example.org');
const S = person('k-sec', 'Sergio Secretario', 'sec@example.org');
const NEW = person('k-new', 'Nadia Nueva', 'new@example.org');

const state = {
  clubXMembers: [member('club-x', P1), member('club-x', P2)],
  tokenRequests: 0,
  authHeaders: new Set<string>(),
};

function fakeKernel() {
  return http.createServer((req, res) => {
    const url = new URL(req.url!, 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && url.pathname === '/k/oauth/token') {
      state.tokenRequests++;
      const expected = 'Basic ' + Buffer.from('mra_test:mrs_secret').toString('base64');
      if (req.headers.authorization !== expected) return json(401, { error: 'invalid_client' });
      return json(200, { access_token: 'svc-token', token_type: 'Bearer', expires_in: 600 });
    }
    state.authHeaders.add(String(req.headers.authorization));
    if (req.headers.authorization !== 'Bearer svc-token') return json(401, {});
    const p = url.pathname.replace(/^\/k/, '');
    if (p === '/service/organizations') {
      const district = {
        id: 'dist',
        type: 'DISTRICT',
        code: 'D4845',
        name: 'Distrito',
        status: 'ACTIVE',
        parentId: null,
        updatedAt: 'x',
      };
      const clubX = {
        id: 'club-x',
        type: 'CLUB',
        code: 'RCX',
        name: 'Club X',
        status: 'ACTIVE',
        parentId: 'dist',
        updatedAt: 'x',
      };
      const clubY = {
        id: 'club-y',
        type: 'CLUB',
        code: 'RCY',
        name: 'Club Y',
        status: 'INACTIVE',
        parentId: 'dist',
        updatedAt: 'x',
      };
      if (!url.searchParams.get('cursor')) {
        return json(200, { items: [district, clubX], pageInfo: { hasMore: true, nextCursor: 'c2' } });
      }
      return json(200, { items: [clubY], pageInfo: { hasMore: false, nextCursor: null } });
    }
    if (p === '/service/organizations/dist/authorities') {
      if (url.searchParams.get('includeDescendants') !== 'true') {
        return json(200, [authority('dist', 'DISTRICT_RDR', R)]);
      }
      return json(200, [
        authority('club-x', 'CLUB_PRESIDENT', P1),
        authority('dist', 'DISTRICT_RDR', R),
        authority('dist', 'DISTRICT_SECRETARY', S),
      ]);
    }
    if (p === '/service/organizations/club-y/authorities') {
      return json(200, [authority('club-y', 'CLUB_PRESIDENT', NEW)]);
    }
    if (p === '/service/organizations/club-x/members')
      return json(200, { items: state.clubXMembers, pageInfo: { hasMore: false, nextCursor: null } });
    if (p === '/service/organizations/club-y/members')
      return json(200, { items: [member('club-y', P3, 'INACTIVE')], pageInfo: { hasMore: false, nextCursor: null } });
    if (p === '/service/organizations/dist/members')
      return json(200, {
        items: [member('dist', R), member('dist', S)],
        pageInfo: { hasMore: false, nextCursor: null },
      });
    if (p === '/service/persons/k-new') return json(200, NEW);
    if (p === '/service/persons/k-new/memberships') {
      return json(200, [
        {
          membershipId: 'mm',
          organizationId: 'club-y',
          organizationName: 'Club Y',
          organizationType: 'CLUB',
          status: 'ACTIVE',
        },
      ]);
    }
    if (p.startsWith('/service/persons/')) return json(403, { message: 'Fuera del alcance de esta app' });
    return json(404, { message: 'not found' });
  });
}

let app: INestApplication;
let server: http.Server;
let prisma: any;
let sync: any;
let directory: any;

beforeAll(async () => {
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    env: process.env,
  });
  server = fakeKernel();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.KERNEL_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/k/`;
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  sync = app.get(DirectorySyncService);
  directory = app.get(DirectoryService);
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
      END LOOP;
    END $$;`);
});

afterAll(async () => {
  await app?.close();
  server?.close();
});

describe('DirectorySyncService', () => {
  it('syncs clubs (paginated), persons, memberships, presidents and district roles', async () => {
    await sync.syncAll();
    const st = await sync.status();
    expect(st).toMatchObject({ lastError: null, clubs: 2 });
    expect(st.lastSuccessAt).toBeTruthy();

    const clubs = await prisma.dirClub.findMany({ orderBy: { id: 'asc' }, include: { standing: true } });
    expect(clubs.map((c: any) => [c.id, c.status])).toEqual([
      ['club-x', 'ACTIVE'],
      ['club-y', 'INACTIVE'],
    ]);
    // standing rows are created with the legacy defaults
    expect(clubs[0].standing).toMatchObject({
      isConstituido: true,
      enabledForDistrictMeetings: true,
      cuotaAldia: false,
    });

    expect(await directory.getRole('k-p1')).toBe('PRESIDENT');
    expect(await directory.getRole('k-p2')).toBe('PARTICIPANT');
    expect(await directory.getRole('k-rdr')).toBe('RDR');
    expect(await directory.getRole('k-sec')).toBe('SECRETARY');
    const p3 = await prisma.dirMembership.findFirst({ where: { personId: 'k-p3' } });
    expect(p3).toMatchObject({ clubId: 'club-y', active: false, isPresident: false });
    expect((await prisma.dirPerson.findUnique({ where: { id: 'k-p1' } })).email).toBe('p1@example.org');
    expect(state.tokenRequests).toBe(1);
    expect([...state.authHeaders]).toEqual(['Bearer svc-token']);
  });

  it('a member that disappears from the kernel is deactivated, never deleted', async () => {
    state.clubXMembers = [member('club-x', P1)];
    await sync.syncAll();
    const p2 = await prisma.dirMembership.findFirst({ where: { personId: 'k-p2' } });
    expect(p2).toMatchObject({ active: false });
    expect(await prisma.dirPerson.findUnique({ where: { id: 'k-p2' } })).not.toBeNull();
    expect(state.tokenRequests).toBe(1); // token reused while valid
  });

  it('on-demand sync of an unknown person (membership + presidency)', async () => {
    expect(await directory.ensurePerson('k-new')).toBe(true);
    expect(await directory.getRole('k-new')).toBe('PRESIDENT');
    // out of scope (403) and no claims -> unknown
    expect(await directory.ensurePerson('k-outsider')).toBe(false);
    // out of scope but with signed token claims -> created from the claims
    expect(await directory.ensurePerson('k-outsider', { name: 'Otro', email: 'o@example.org' })).toBe(true);
  });

  it('kernel down: the sync fails softly and the last data keeps serving', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    server.closeAllConnections?.();
    await sync.syncAll();
    const st = await sync.status();
    expect(st.lastError).toBeTruthy();
    expect(await directory.getRole('k-p1')).toBe('PRESIDENT');
    expect(await prisma.dirClub.count()).toBe(2);
    // unknown persons still get in with their token claims
    expect(await directory.ensurePerson('k-other', { name: 'Ana', email: 'ana@example.org' })).toBe(true);
  });
});
