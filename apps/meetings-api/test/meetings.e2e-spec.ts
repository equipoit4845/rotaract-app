/**
 * End-to-end smoke test of meetings-api against a real (scratch) Postgres.
 *
 *   MEETINGS_DATABASE_URL=postgresql://...  (migrations are applied here)
 *   npx jest --config ./test/jest-e2e.json --runInBand
 *
 * The kernel directory is stubbed with seeded Dir* rows (sync disabled).
 * Drives a whole district meeting through REST and socket.io-client.
 */
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';

const SECRET = 'e2e-secret-e2e-secret-e2e-secret-0123456789';
process.env.MEETINGS_TOKEN_SECRET = SECRET;
process.env.MEETINGS_DIRECTORY_SYNC = 'off';
process.env.MEETINGS_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'meetings-e2e-'));
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;

if (!process.env.MEETINGS_DATABASE_URL) {
  throw new Error('MEETINGS_DATABASE_URL must point to a scratch database');
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../src/main');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaService } = require('../src/prisma/prisma.service');

const P = '/meetings-api';
const jwt = new JwtService({ secret: SECRET });

const people = {
  sec: { id: 'p-sec', name: 'Sole Secretaria' },
  rdr: { id: 'p-rdr', name: 'Ramiro RDR' },
  pA: { id: 'p-pres-a', name: 'Ana Presidenta A' },
  pB: { id: 'p-pres-b', name: 'Bruno Presidente B' },
  pC: { id: 'p-pres-c', name: 'Carla Presidenta C' },
  pD: { id: 'p-pres-d', name: 'Diego Presidente D' },
  mA2: { id: 'p-mem-a2', name: 'Martín Socio A' },
  dB: { id: 'p-del-b', name: 'Delfina Delegada B' },
  out: { id: 'p-outsider', name: 'Oscar Externo' },
} as const;
type Who = keyof typeof people;

function token(who: Who, opts: { aud?: string; iss?: string; secret?: string } = {}) {
  const p = people[who];
  return jwt.sign(
    { sub: p.id, name: p.name, email: `${p.id}@example.org`, role: 'SUPERADMIN' /* must be ignored */ },
    {
      secret: opts.secret ?? SECRET,
      audience: opts.aud ?? 'meetings-api',
      issuer: opts.iss ?? 'meetings-web',
      algorithm: 'HS256',
      expiresIn: '15m',
    },
  );
}

let app: INestApplication;
let prisma: InstanceType<typeof PrismaService>;
let baseUrl: string;
const sockets: Socket[] = [];

const http = () => request(app.getHttpServer());
const as = (who: Who) => ({
  get: (url: string) => http().get(P + url).set('Authorization', `Bearer ${token(who)}`),
  post: (url: string, body?: object) =>
    http().post(P + url).set('Authorization', `Bearer ${token(who)}`).send(body ?? {}),
  patch: (url: string, body?: object) =>
    http().patch(P + url).set('Authorization', `Bearer ${token(who)}`).send(body ?? {}),
  del: (url: string) => http().delete(P + url).set('Authorization', `Bearer ${token(who)}`),
});

function connect(who: Who | null): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(baseUrl, {
      auth: who ? { token: token(who) } : {},
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', (err) => reject(err));
  });
}

async function join(s: Socket, meetingId: string) {
  return (await s.timeout(10000).emitWithAck('meeting.join', { meetingId })) as { event: string; data: any };
}

function nextEvent<T = any>(s: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seedDirectory() {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
      END LOOP;
    END $$;`);
  const clubs = [
    { id: 'club-a', name: 'Rotaract Club A', code: 'RCA' },
    { id: 'club-b', name: 'Rotaract Club B', code: 'RCB' },
    { id: 'club-c', name: 'Rotaract Club C', code: 'RCC' },
    { id: 'club-d', name: 'Rotaract Club D', code: 'RCD' },
    { id: 'club-e', name: 'Rotaract Club E (no habilitado)', code: 'RCE' },
  ];
  await prisma.dirClub.createMany({ data: clubs.map((c) => ({ ...c, status: 'ACTIVE' })) });
  await prisma.clubStanding.createMany({
    data: [
      ...['club-a', 'club-b', 'club-c', 'club-d'].map((clubId) => ({
        clubId,
        isConstituido: true,
        cuotaAldia: true,
        informeAlDia: true,
        enabledForDistrictMeetings: true,
      })),
      { clubId: 'club-e', isConstituido: true, cuotaAldia: false, informeAlDia: false, enabledForDistrictMeetings: false },
    ],
  });
  await prisma.dirPerson.createMany({
    data: Object.values(people).map((p) => ({ id: p.id, fullName: p.name, email: `${p.id}@example.org` })),
  });
  await prisma.dirMembership.createMany({
    data: [
      { personId: people.pA.id, clubId: 'club-a', isPresident: true },
      { personId: people.mA2.id, clubId: 'club-a' },
      { personId: people.pB.id, clubId: 'club-b', isPresident: true },
      { personId: people.dB.id, clubId: 'club-b' },
      { personId: people.pC.id, clubId: 'club-c', isPresident: true },
      { personId: people.pD.id, clubId: 'club-d', isPresident: true },
    ],
  });
  await prisma.dirDistrictRole.create({ data: { personId: people.rdr.id, role: 'RDR' } });
  await prisma.districtStaff.create({ data: { personId: people.sec.id, role: 'SECRETARY' } });
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    env: process.env,
  });
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  prisma = app.get(PrismaService);
  await seedDirectory();
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await sleep(600); // let disconnect handlers and debounced snapshots settle
  await app?.close();
});

describe('meetings-api smoke', () => {
  let meetingId: string;
  let topicVote: string;
  let topicElection: string;

  it('health is public', async () => {
    const res = await http().get(`${P}/health`).expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('rejects missing / foreign tokens', async () => {
    await http().get(`${P}/meetings`).expect(401);
    const bad = jwt.sign({ sub: people.sec.id }, { secret: SECRET, audience: 'other', issuer: 'meetings-web' });
    await http().get(`${P}/meetings`).set('Authorization', `Bearer ${bad}`).expect(401);
    const badIss = token('sec', { iss: 'someone' });
    await http().get(`${P}/meetings`).set('Authorization', `Bearer ${badIss}`).expect(401);
    const badSecret = token('sec', { secret: 'x'.repeat(40) });
    await http().get(`${P}/meetings`).set('Authorization', `Bearer ${badSecret}`).expect(401);
  });

  it('auth/me resolves the role from the directory, ignoring token claims', async () => {
    expect((await as('sec').get('/auth/me').expect(200)).body).toMatchObject({ role: 'SECRETARY' });
    expect((await as('rdr').get('/auth/me').expect(200)).body).toMatchObject({ role: 'RDR' });
    const pa = (await as('pA').get('/auth/me').expect(200)).body;
    expect(pa).toMatchObject({ id: people.pA.id, role: 'PRESIDENT', clubs: [{ id: 'club-a', isPresident: true }] });
    expect((await as('mA2').get('/auth/me').expect(200)).body.role).toBe('PARTICIPANT');
  });

  it('unknown persons are created from the token claims when the kernel is unavailable', async () => {
    const t = jwt.sign(
      { sub: 'p-new', name: 'Nueva Persona', email: 'new@example.org' },
      { secret: SECRET, audience: 'meetings-api', issuer: 'meetings-web', expiresIn: '5m' },
    );
    const res = await http().get(`${P}/auth/me`).set('Authorization', `Bearer ${t}`).expect(200);
    expect(res.body).toMatchObject({ id: 'p-new', fullName: 'Nueva Persona', role: 'PARTICIPANT', clubs: [] });
  });

  it('club lookups and Habilitación de clubes', async () => {
    const clubs = (await as('pA').get('/clubs').expect(200)).body;
    expect(clubs).toHaveLength(5);
    expect(clubs[0]).toHaveProperty('enabledForDistrictMeetings');
    const clubA = (await as('sec').get('/clubs/club-a').expect(200)).body;
    expect(clubA.authorities[0]).toMatchObject({ userId: people.pA.id, isPresident: true });
    expect((await as('sec').get('/district/clubs/club-b').expect(200)).body.authorities).toHaveLength(2);
    const standing = (await as('sec').get('/clubs/standing').expect(200)).body;
    expect(standing.filter((c: any) => c.inQuorumBase)).toHaveLength(4);
    await as('pA').get('/clubs/standing').expect(403);
    await as('pA').patch('/clubs/standing', { clubId: 'club-e', cuotaAldia: true }).expect(403);
    const patched = (await as('sec').patch('/clubs/standing', { clubId: 'club-e', cuotaAldia: true }).expect(200)).body;
    expect(patched).toMatchObject({ clubId: 'club-e', cuotaAldia: true, enabledForDistrictMeetings: false });
    const users = (await as('sec').get('/users').expect(200)).body;
    expect(users.find((u: any) => u.id === people.rdr.id).role).toBe('RDR');
  });

  it('secretary creates a district meeting; presidents of enabled clubs become participants', async () => {
    await as('pA').post('/meetings', { title: 'x', clubId: 'club-a' }).expect(403);
    const res = await as('sec')
      .post('/meetings', { title: 'Asamblea de prueba', description: 'Smoke', clubId: 'club-a', type: 'ORDINARY' })
      .expect(201);
    meetingId = res.body.id;
    expect(res.body).toMatchObject({ status: 'DRAFT', quorumRequired: 3, isDistrictMeeting: true });
    expect(res.body.club.name).toBe('Rotaract Club A');
    const detail = (await as('sec').get(`/meetings/${meetingId}`).expect(200)).body;
    expect(detail.participants.map((p: any) => p.userId).sort()).toEqual(
      [people.pA.id, people.pB.id, people.pC.id, people.pD.id].sort(),
    );
  });

  it('fix 1: non-participants never read a meeting, participants never read a DRAFT', async () => {
    await as('mA2').get(`/meetings/${meetingId}`).expect(404);
    const list = (await as('mA2').get('/meetings').expect(200)).body;
    expect(list).toHaveLength(0);
  });

  it('agenda topics and bulk import (CSV)', async () => {
    topicVote = (await as('sec').post(`/meetings/${meetingId}/topics`, { title: 'Aprobación del balance', type: 'VOTING', estimatedDurationSec: 600 }).expect(201)).body.id;
    topicElection = (await as('sec').post(`/meetings/${meetingId}/topics`, { title: 'Elección de sede', type: 'VOTING' }).expect(201)).body.id;
    const csv = '﻿title,description,type,durationMin\nInforme del RDR,Informe,INFORMATIVO,10\n';
    const bulk = await http()
      .post(`${P}/meetings/${meetingId}/topics/bulk?mode=strict`)
      .set('Authorization', `Bearer ${token('sec')}`)
      .attach('file', Buffer.from(csv), { filename: 'agenda.csv', contentType: 'text/csv' })
      .expect(207);
    expect(bulk.body).toMatchObject({ total: 1, created: 1, failed: 0 });
    const topics = (await as('sec').get(`/meetings/${meetingId}/topics`).expect(200)).body;
    expect(topics.map((t: any) => t.title)).toEqual(['Aprobación del balance', 'Elección de sede', 'Informe del RDR']);
    expect(topics[2]).toMatchObject({ type: 'INFORMATIVE', estimatedDurationSec: 600 });
  });

  it('attachments only while DRAFT', async () => {
    const up = await http()
      .post(`${P}/meetings/${meetingId}/attachments`)
      .set('Authorization', `Bearer ${token('sec')}`)
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'orden del dia.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(up.body.fileName).toBe('orden_del_dia.pdf');
    const list = (await as('pA').get(`/meetings/${meetingId}/attachments`).expect(200)).body;
    expect(list).toHaveLength(1);
    const dl = await as('pA').get(`/attachments/${up.body.id}/download`).expect(200);
    expect(dl.body.toString()).toContain('%PDF');
  });

  it('carta poder: only the club president (or district) creates it; secretary verifies', async () => {
    await as('pA').post(`/meetings/${meetingId}/carta-poder`, { clubId: 'club-b', delegateUserId: people.dB.id }).expect(403);
    await as('pA').get(`/meetings/${meetingId}/carta-poder/my-club/club-b`).expect(403);
    const cp = (await as('pB').post(`/meetings/${meetingId}/carta-poder`, { clubId: 'club-b', delegateUserId: people.dB.id }).expect(201)).body;
    expect(cp).toMatchObject({ status: 'PENDING_SECRETARY', club: { id: 'club-b' }, delegateUser: { id: people.dB.id } });
    await as('pB').post(`/meetings/${meetingId}/carta-poder`, { clubId: 'club-b', delegateUserId: people.dB.id }).expect(400);
    expect((await as('pB').get(`/meetings/${meetingId}/carta-poder/my-club/club-b`).expect(200)).body).toHaveLength(1);
    await as('pB').patch(`/meetings/${meetingId}/carta-poder/${cp.id}/verify`).expect(403);
    const verified = (await as('sec').patch(`/meetings/${meetingId}/carta-poder/${cp.id}/verify`).expect(200)).body;
    expect(verified.status).toBe('VERIFIED');
  });

  it('schedule and start: attendance topic first, informational until quorum', async () => {
    await as('sec').post(`/meetings/${meetingId}/schedule`).expect(201);
    const started = (await as('sec').post(`/meetings/${meetingId}/start`).expect(201)).body;
    expect(started).toMatchObject({ status: 'LIVE', isInformationalOnly: true, quorumMet: false });
    const topics = (await as('sec').get(`/meetings/${meetingId}/topics`).expect(200)).body;
    expect(topics[0]).toMatchObject({ title: 'Asistencia', isAttendanceTopic: true, status: 'ACTIVE' });
    expect(started.currentTopicId).toBe(topics[0].id);
    // agenda is locked to the attendance topic until attendance is closed
    await as('sec').post(`/meetings/${meetingId}/topics/current`, { topicId: topicVote }).expect(400);
    // attachments are frozen once the meeting left DRAFT
    await http()
      .post(`${P}/meetings/${meetingId}/attachments`)
      .set('Authorization', `Bearer ${token('sec')}`)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(403);
  });

  it('socket: unauthenticated connections are refused with "unauthorized"', async () => {
    await expect(connect(null)).rejects.toThrow('unauthorized');
  });

  let sA: Socket, sB: Socket, sC: Socket, sD: Socket, sDel: Socket, sSec: Socket;

  it('socket: presidents and the delegate join (secretary as observer)', async () => {
    sSec = await connect('sec');
    const secJoin = await join(sSec, meetingId);
    expect(secJoin.event).toBe('meeting.snapshot');

    sA = await connect('pA');
    const a = await join(sA, meetingId);
    expect(a.event).toBe('meeting.snapshot');
    expect(a.data.meeting).toMatchObject({ id: meetingId, status: 'LIVE' });

    // pB is still an auto-created participant of club B, so (as in legacy) the
    // existing participant row wins over the delegation check; the delegate
    // joins afterwards and becomes club B's attendee.
    sB = await connect('pB');
    expect((await join(sB, meetingId)).event).toBe('meeting.snapshot');

    sDel = await connect('dB');
    expect((await join(sDel, meetingId)).event).toBe('meeting.snapshot');
    sC = await connect('pC');
    await join(sC, meetingId);
    sD = await connect('pD');
    const d = await join(sD, meetingId);
    expect(d.data.quorum).toMatchObject({ required: 3, present: 4, met: true });
    // the secretary is an observer: not a participant, no attendance
    const att = await prisma.clubMeetingAttendance.findMany({ where: { meetingId } });
    expect(att.map((x: any) => x.clubId).sort()).toEqual(['club-a', 'club-b', 'club-c', 'club-d']);
    expect(att.find((x: any) => x.clubId === 'club-b').attendeeUserId).toBe(people.dB.id);
  });

  it('lock attendance -> quorum met, agenda unlocked', async () => {
    await sleep(400); // let the debounced join snapshots go out first
    const snap = nextEvent(sA, 'meeting.snapshot');
    const locked = (await as('sec').post(`/meetings/${meetingId}/lock-attendance`).expect(201)).body;
    expect(locked).toMatchObject({ attendanceLocked: true, quorumMet: true, isInformationalOnly: false });
    const s = await snap;
    expect(s.meeting.attendanceLocked).toBe(true);
    expect(s.topics[0].status).toBe('DONE');
    await as('sec').post(`/meetings/${meetingId}/topics/current`, { topicId: topicVote }).expect(201);
  });

  it('timers carry topicId (fix 5) and stop', async () => {
    const t = (await as('sec').post(`/meetings/${meetingId}/timers/topic/start`, { topicId: topicVote, durationSec: 120 }).expect(201)).body;
    const active = (await as('pA').get(`/meetings/${meetingId}/timers/active`).expect(200)).body;
    expect(active).toMatchObject({ id: t.id, topicId: topicVote, plannedDurationSec: 120 });
    await as('sec').post(`/meetings/${meetingId}/timers/stop`, { timerId: t.id }).expect(201);
  });

  it('speaking queue', async () => {
    const r = (await as('pC').post(`/meetings/${meetingId}/queue/request`).expect(201)).body;
    await as('pC').post(`/meetings/${meetingId}/queue/request`).expect(400);
    const st = (await as('sec').post(`/meetings/${meetingId}/queue/current-speaker`, { userId: people.pC.id }).expect(201)).body;
    expect(st.currentSpeaker).toMatchObject({ id: people.pC.id, fullName: people.pC.name });
    await as('pC').post(`/meetings/${meetingId}/queue/release-floor`).expect(201);
    await as('pC').post(`/meetings/${meetingId}/queue/cancel`, { requestId: r.id }).expect(201);
  });

  let yesNoSession: string;

  it('YES/NO vote: one ballot per club, tie, RDR tiebreak', async () => {
    const opened = nextEvent(sA, 'meeting.vote.opened');
    yesNoSession = (await as('sec').post(`/meetings/${meetingId}/vote/open`, { topicId: topicVote, votingMethod: 'PUBLIC', requiredMajority: 'SIMPLE' }).expect(201)).body.id;
    expect((await opened).voteSessionId).toBe(yesNoSession);
    await as('sec').post(`/meetings/${meetingId}/vote/open`, { topicId: topicVote }).expect(400);

    await as('pA').post(`/meetings/${meetingId}/vote`, { voteSessionId: yesNoSession, choice: 'YES' }).expect(201);
    const viaSocket = await sC.timeout(5000).emitWithAck('vote.submit', { meetingId, voteSessionId: yesNoSession, choice: 'YES' });
    expect(viaSocket.event).toBe('vote.confirmed');
    await as('dB').post(`/meetings/${meetingId}/vote`, { voteSessionId: yesNoSession, choice: 'NO' }).expect(201);
    // the delegating president cannot vote for club B
    await as('pB').post(`/meetings/${meetingId}/vote`, { voteSessionId: yesNoSession, choice: 'YES' }).expect(403);
    // the RDR never votes (Art. 49)
    await as('rdr').post(`/meetings/${meetingId}/vote`, { voteSessionId: yesNoSession, choice: 'YES' }).expect(403);

    // a second member of club A (eligible participant) is blocked: one ballot per club
    await prisma.meetingParticipant.create({ data: { meetingId, userId: people.mA2.id, clubId: 'club-a', canVote: true } });
    const dup = await as('mA2').post(`/meetings/${meetingId}/vote`, { voteSessionId: yesNoSession, choice: 'NO' }).expect(403);
    expect(dup.body.message).toBe('Tu club ya emitió un voto en esta votación');
    // ...also at the database level
    await expect(
      prisma.vote.create({ data: { voteSessionId: yesNoSession, userId: people.mA2.id, ballotClubId: 'club-a', choice: 'NO' } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await as('pD').post(`/meetings/${meetingId}/vote/manual`, { voteSessionId: yesNoSession, clubId: 'club-d', choice: 'NO' }).expect(403);
    await as('sec').post(`/meetings/${meetingId}/vote/manual`, { voteSessionId: yesNoSession, clubId: 'club-d', choice: 'NO' }).expect(201);

    const live = (await as('pA').get(`/meetings/${meetingId}/vote/${yesNoSession}/result`).expect(200)).body;
    expect(live).toMatchObject({ yes: 2, no: 2, isTied: true, approved: null });
    await as('out').get(`/meetings/${meetingId}/vote/${yesNoSession}/result`).expect(404);
    await as('out').get(`/meetings/${meetingId}/vote/current`).expect(404);

    const closedEvt = nextEvent(sA, 'meeting.vote.closed');
    await as('sec').post(`/meetings/${meetingId}/vote/close`, { voteSessionId: yesNoSession }).expect(201);
    expect(await closedEvt).toMatchObject({ isTied: true, counts: { yes: 2, no: 2, abstain: 0 } });

    await as('sec').post(`/meetings/${meetingId}/vote/rdr-tiebreaker`, { voteSessionId: yesNoSession, choice: 'YES' }).expect(403);
    const tb = (await as('rdr').post(`/meetings/${meetingId}/vote/rdr-tiebreaker`, { voteSessionId: yesNoSession, choice: 'YES' }).expect(201)).body;
    expect(tb).toMatchObject({ approved: true, rdrTiebreakerUsed: true, yes: 3 });
    await as('rdr').post(`/meetings/${meetingId}/vote/rdr-tiebreaker`, { voteSessionId: yesNoSession, choice: 'NO' }).expect(400);
  });

  let electionSession: string;
  let runoffSession: string;

  it('candidate election: no absolute majority -> runoff -> winner', async () => {
    await as('sec').post(`/meetings/${meetingId}/topics/current`, { topicId: topicElection }).expect(201);
    const open = (await as('sec')
      .post(`/meetings/${meetingId}/vote/open`, {
        topicId: topicElection,
        ballotType: 'CANDIDATE',
        requiredMajority: 'ABSOLUTE',
        electionType: 'EVENT',
        candidates: [{ displayName: 'Sede Norte' }, { displayName: 'Sede Sur' }, { displayName: 'Sede Este' }],
      })
      .expect(201)).body;
    electionSession = open.id;
    const current = (await as('pA').get(`/meetings/${meetingId}/vote/current`).expect(200)).body;
    const [norte, sur, este] = current.candidates;
    expect(norte.displayName).toBe('Sede Norte');

    await as('pA').post(`/meetings/${meetingId}/vote`, { voteSessionId: electionSession, choice: 'YES', candidateId: norte.id }).expect(201);
    await as('pC').post(`/meetings/${meetingId}/vote`, { voteSessionId: electionSession, choice: 'YES', candidateId: sur.id }).expect(201);
    await as('dB').post(`/meetings/${meetingId}/vote`, { voteSessionId: electionSession, choice: 'YES', candidateId: norte.id }).expect(201);
    await as('pD').post(`/meetings/${meetingId}/vote`, { voteSessionId: electionSession, choice: 'YES', candidateId: este.id }).expect(201);
    await as('pD').post(`/meetings/${meetingId}/vote`, { voteSessionId: electionSession, choice: 'YES' }).expect(400);

    const closed = (await as('sec').post(`/meetings/${meetingId}/vote/close`, { voteSessionId: electionSession }).expect(201)).body;
    // Norte 2/4 is not > 4/2
    expect(closed.result.candidateResult).toMatchObject({ winner: null, needsRunoff: true, isTied: false });
    expect(closed.result.candidateResult.runoffCandidates[0].displayName).toBe('Sede Norte');

    const opened = nextEvent(sA, 'meeting.vote.opened');
    const runoff = (await as('sec').post(`/meetings/${meetingId}/vote/runoff`, { previousSessionId: electionSession }).expect(201)).body;
    runoffSession = runoff.id;
    expect(runoff).toMatchObject({ round: 2, previousSessionId: electionSession, requiredMajority: 'ABSOLUTE' });
    expect(runoff.candidates).toHaveLength(2);
    expect((await opened).round).toBe(2);
    const [r1, r2] = runoff.candidates;
    await as('pA').post(`/meetings/${meetingId}/vote`, { voteSessionId: runoffSession, choice: 'YES', candidateId: r1.id }).expect(201);
    await as('pC').post(`/meetings/${meetingId}/vote`, { voteSessionId: runoffSession, choice: 'YES', candidateId: r2.id }).expect(201);
    await as('dB').post(`/meetings/${meetingId}/vote`, { voteSessionId: runoffSession, choice: 'YES', candidateId: r1.id }).expect(201);
    await as('pD').post(`/meetings/${meetingId}/vote`, { voteSessionId: runoffSession, choice: 'ABSTAIN' }).expect(201);
    const final = (await as('sec').post(`/meetings/${meetingId}/vote/close`, { voteSessionId: runoffSession }).expect(201)).body;
    expect(final.result.candidateResult.winner.displayName).toBe(r1.displayName);
    await as('sec').post(`/meetings/${meetingId}/vote/runoff`, { previousSessionId: runoffSession }).expect(400);
  });

  it('SECRET vote: masked while open, voter names never exported', async () => {
    await as('sec').post(`/meetings/${meetingId}/topics/current`, { topicId: topicVote }).expect(201);
    const sid = (await as('sec').post(`/meetings/${meetingId}/vote/open`, { topicId: topicVote, votingMethod: 'SECRET' }).expect(201)).body.id;
    const resultEvt = nextEvent(sA, 'meeting.vote.result');
    await as('pA').post(`/meetings/${meetingId}/vote`, { voteSessionId: sid, choice: 'YES' }).expect(201);
    expect(await resultEvt).toMatchObject({ counts: null, approved: null });
    await as('pC').post(`/meetings/${meetingId}/vote`, { voteSessionId: sid, choice: 'NO' }).expect(201);
    await as('dB').post(`/meetings/${meetingId}/vote`, { voteSessionId: sid, choice: 'YES' }).expect(201);
    const masked = (await as('pA').get(`/meetings/${meetingId}/vote/${sid}/result`).expect(200)).body;
    expect(masked).toMatchObject({ yes: 0, no: 0, total: 3, approved: null });
    const snap = (await join(sA, meetingId)).data;
    expect(snap.voteResult).toMatchObject({ yes: 0, no: 0, total: 3 });
    expect(snap.activeVote.votedClubIds.sort()).toEqual(['club-a', 'club-b', 'club-c']);
    const votes = await prisma.vote.findMany({ where: { voteSessionId: sid } });
    expect(votes.every((v: any) => v.clubId === null && v.ballotClubId)).toBe(true);
    await as('sec').post(`/meetings/${meetingId}/vote/close`, { voteSessionId: sid }).expect(201);
    const after = (await as('pA').get(`/meetings/${meetingId}/vote/${sid}/result`).expect(200)).body;
    expect(after).toMatchObject({ yes: 2, no: 1, approved: true });
    const detailed = (await as('sec').get(`/meetings/${meetingId}/vote/${sid}/detailed`).expect(200)).body;
    expect(detailed.votes).toEqual([]);
    const csv = (await as('sec').get(`/history/meetings/${meetingId}/votes/export`).expect(200)).body.csv as string;
    expect(csv.split('\n')[0]).toBe('Tema,Elección,Usuario');
    expect(csv).toContain('Aprobación del balance,YES,Voto secreto');
    expect(csv).toContain(people.pA.name); // public sessions keep names
    expect(csv.split('\n').filter((l) => l.includes('Voto secreto'))).toHaveLength(3);
  });

  it('motions: propose, second by another club, vote', async () => {
    await as('out').post(`/meetings/${meetingId}/motions`, { title: 'Moción externa' }).expect(404);
    const m = (await as('pC').post(`/meetings/${meetingId}/motions`, { title: 'Bajar la cuota', description: 'Propuesta' }).expect(201)).body;
    await as('pC').post(`/meetings/${meetingId}/motions/${m.id}/second`).expect(400);
    await as('pD').post(`/meetings/${meetingId}/motions/${m.id}/second`).expect(201);
    const launched = (await as('sec').post(`/meetings/${meetingId}/motions/${m.id}/launch-vote`, { votingMethod: 'PUBLIC', requiredMajority: 'SIMPLE' }).expect(201)).body;
    expect(launched.status).toBe('VOTING');
    await as('pA').post(`/meetings/${meetingId}/vote`, { voteSessionId: launched.voteSessionId, choice: 'NO' }).expect(201);
    await as('pC').post(`/meetings/${meetingId}/vote`, { voteSessionId: launched.voteSessionId, choice: 'YES' }).expect(201);
    await as('pD').post(`/meetings/${meetingId}/vote`, { voteSessionId: launched.voteSessionId, choice: 'YES' }).expect(201);
    await as('sec').post(`/meetings/${meetingId}/vote/close`, { voteSessionId: launched.voteSessionId }).expect(201);
    const motion = await prisma.motion.findUnique({ where: { id: m.id } });
    expect(motion.status).toBe('APPROVED');
  });

  it('finish -> acta draft, generate is idempotent, PDF', async () => {
    await as('sec').post(`/meetings/${meetingId}/finish`).expect(201);
    const acta = (await as('pA').get(`/meetings/${meetingId}/acta`).expect(200)).body;
    expect(acta.status).toBe('DRAFT');
    const again = (await as('sec').post(`/meetings/${meetingId}/acta/generate`).expect(201)).body;
    expect(again.id).toBe(acta.id);
    const content = JSON.parse(acta.contentJson);
    expect(content.header).toMatchObject({ title: 'Asamblea de prueba', quorumMet: true, club: 'Rotaract Club A' });
    expect(content.attendance.clubs).toHaveLength(4);
    expect(content.attendance.clubs.find((c: any) => c.name === 'Rotaract Club B')).toMatchObject({
      representative: people.dB.name,
      isDelegate: true,
    });
    const balance = content.topics.find((t: any) => t.title === 'Aprobación del balance');
    expect(balance.vote).toBeDefined();
    expect(content.motions).toHaveLength(1);

    const ai = (await as('sec').post(`/meetings/${meetingId}/acta/autocomplete-ai`).expect(201)).body;
    const aiContent = JSON.parse(ai.contentJson);
    // no AI keys in tests: the legacy fixed template is used
    expect(aiContent.topics[1].summary).toContain('Se abrió el espacio de debate sobre el tema');

    const pdf = await as('pA').get(`/meetings/${meetingId}/acta/pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await as('out').get(`/meetings/${meetingId}/acta/pdf`).expect(404);

    await as('sec').patch(`/meetings/${meetingId}/acta`, { contentJson: JSON.stringify({ ...content, observations: 'ok' }) }).expect(200);
    await as('sec').post(`/meetings/${meetingId}/acta/publish`).expect(201);
    await as('sec').patch(`/meetings/${meetingId}/acta`, { contentJson: '{}' }).expect(400);
  });

  it('history and audit trail', async () => {
    const votes = (await as('pA').get(`/history/meetings/${meetingId}/votes`).expect(200)).body;
    expect(votes.length).toBeGreaterThanOrEqual(5);
    const audit = (await as('pA').get(`/history/meetings/${meetingId}/audit`).expect(200)).body;
    const actions = audit.map((a: any) => a.action);
    for (const a of ['meeting.created', 'meeting.started', 'participant.joined', 'meeting.attendance.locked', 'vote.cast', 'vote.manual_cast', 'vote.rdr.tiebreaker', 'vote.session.runoff.opened', 'meeting.finished', 'acta.published']) {
      expect(actions).toContain(a);
    }
    const list = (await as('pA').get('/history/meetings').expect(200)).body;
    expect(list.find((m: any) => m.id === meetingId)).toBeDefined();
  });

  it('leaving marks the participant LEFT', async () => {
    sC.emit('leave_meeting', { meetingId });
    await sleep(500);
    const p = await prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId, userId: people.pC.id } } });
    expect(p.attendanceStatus).toBe('LEFT');
  });
});
