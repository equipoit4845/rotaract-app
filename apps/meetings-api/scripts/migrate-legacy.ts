/**
 * One-off, idempotent migration of the legacy Mi Rotaract district meetings
 * into the meetings-api database.
 *
 *   LEGACY_DATABASE_URL   legacy mi-rotaract Postgres   (read-only session)
 *   KERNEL_DATABASE_URL   Institutional Kernel Postgres (read-only session)
 *   MEETINGS_DATABASE_URL meetings-api Postgres         (written, unless --dry-run)
 *
 *   npx tsx scripts/migrate-legacy.ts --dry-run   # report only, writes nothing
 *   npx tsx scripts/migrate-legacy.ts             # apply
 *
 * Id mapping (contract §"Legacy id mapping"):
 *   - person: kernel Person.externalReference = 'legacy:user:<legacyUserId>'
 *   - club:   kernel Organization.attributes->>'legacyClubId' = '<legacyClubId>'
 * Meeting entities keep their original cuids. Unmapped users / clubs become
 * placeholder Dir* rows ("legacy:user:<id>" / "legacy:club:<id>", inactive)
 * so the history keeps its names, and are listed in the report.
 *
 * Idempotent: every insert is ON CONFLICT DO NOTHING (ids are stable), so a
 * re-run only adds what is missing. ClubStanding is (re)seeded from the legacy
 * Club flags only while nobody edited it in "Habilitación de clubes".
 */
import { Client, types } from 'pg';

// Keep `timestamp without time zone` values as the raw strings Postgres sends:
// parsing them as local-time Dates and re-serialising as UTC would shift them
// by the host's offset (Prisma stores UTC in these columns).
types.setTypeParser(1114, (value: string) => value);

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

type Row = Record<string, any>;

function env(name: string, required = true): string {
  const v = process.env[name];
  if (!v && required) {
    console.error(`Missing env ${name}`);
    process.exit(2);
  }
  return v ?? '';
}

async function connectReadOnly(url: string, label: string): Promise<Client> {
  const c = new Client({ connectionString: url, application_name: `meetings-migrate-legacy:${label}` });
  await c.connect();
  // Every statement of this session is read-only: a bug here can never write.
  await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  await c.query('SET default_transaction_read_only = on');
  return c;
}

const q = async (c: Client, sql: string, params: unknown[] = []): Promise<Row[]> => (await c.query(sql, params)).rows;

// ---------------------------------------------------------------------------

class Report {
  unmappedUsers = new Map<string, { fullName: string; email: string; refs: number }>();
  unmappedClubs = new Map<string, { name: string; code: string; refs: number }>();
  tables: { table: string; source: number; inserted: number; existing: number }[] = [];
  warnings: string[] = [];

  print() {
    console.log(`\n=== Legacy meetings migration ${DRY_RUN ? '(DRY RUN — nothing written)' : ''} ===\n`);
    console.table(this.tables);
    if (this.unmappedClubs.size) {
      console.log(`\nUnmapped legacy clubs (${this.unmappedClubs.size}) -> placeholder DirClub "legacy:club:<id>":`);
      console.table([...this.unmappedClubs.entries()].map(([id, v]) => ({ legacyClubId: id, ...v })));
    } else console.log('\nAll referenced legacy clubs map to a kernel organization.');
    if (this.unmappedUsers.size) {
      console.log(`\nUnmapped legacy users (${this.unmappedUsers.size}) -> placeholder DirPerson "legacy:user:<id>":`);
      console.table([...this.unmappedUsers.entries()].map(([id, v]) => ({ legacyUserId: id, ...v })));
    } else console.log('\nAll referenced legacy users map to a kernel person.');
    if (this.warnings.length) {
      console.log('\nWarnings:');
      for (const w of this.warnings) console.log(`  - ${w}`);
    }
  }
}

async function main() {
  const legacy = await connectReadOnly(env('LEGACY_DATABASE_URL'), 'legacy');
  const kernel = await connectReadOnly(env('KERNEL_DATABASE_URL'), 'kernel');
  const targetUrl = env('MEETINGS_DATABASE_URL', !DRY_RUN);
  const target = targetUrl
    ? DRY_RUN
      ? await connectReadOnly(targetUrl, 'meetings-dry-run')
      : new Client({ connectionString: targetUrl, application_name: 'meetings-migrate-legacy' })
    : null;
  if (target && !DRY_RUN) await target.connect();
  const report = new Report();

  try {
    // --- 1. Kernel id maps ---------------------------------------------------
    const kPersons = await q(
      kernel,
      `SELECT id, "firstName", "lastName", "displayName", "primaryEmail", "archivedAt",
              substring("externalReference" from 13) AS legacy_id
         FROM "Person" WHERE "externalReference" LIKE 'legacy:user:%'`,
    );
    const personByLegacy = new Map<string, Row>(kPersons.map((p) => [p.legacy_id, p]));
    const kClubs = await q(
      kernel,
      `SELECT id, name, code, status::text AS status, attributes->>'legacyClubId' AS legacy_id
         FROM "Organization" WHERE type = 'CLUB' AND attributes ? 'legacyClubId'`,
    );
    const clubByLegacy = new Map<string, Row>(kClubs.map((c) => [c.legacy_id, c]));

    // --- 2. Legacy reference data -------------------------------------------
    const lUsers = await q(legacy, `SELECT id, "fullName", email, role::text AS role, "isActive" FROM "User"`);
    const legacyUser = new Map<string, Row>(lUsers.map((u) => [u.id, u]));
    const lClubs = await q(
      legacy,
      `SELECT id, name, code, status::text AS status, "isConstituido", "enabledForDistrictMeetings", "cuotaAldia", "informeAlDia" FROM "Club"`,
    );
    const legacyClub = new Map<string, Row>(lClubs.map((c) => [c.id, c]));

    const dirPersons = new Map<string, Row>();
    const dirClubs = new Map<string, Row>();
    const now = new Date().toISOString();

    const mapUser = (legacyId: string | null | undefined): string | null => {
      if (!legacyId) return null;
      const k = personByLegacy.get(legacyId);
      if (k) {
        if (!dirPersons.has(k.id)) {
          dirPersons.set(k.id, {
            id: k.id,
            fullName: (k.displayName?.trim() || `${k.firstName} ${k.lastName}`.trim()) as string,
            email: k.primaryEmail ?? null,
            isActive: !k.archivedAt,
            platformRole: null,
            externalReference: `legacy:user:${legacyId}`,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
        return k.id;
      }
      const lu = legacyUser.get(legacyId);
      const placeholder = `legacy:user:${legacyId}`;
      const entry = report.unmappedUsers.get(legacyId) ?? {
        fullName: lu?.fullName ?? '?',
        email: lu?.email ?? '?',
        refs: 0,
      };
      entry.refs++;
      report.unmappedUsers.set(legacyId, entry);
      if (!dirPersons.has(placeholder)) {
        dirPersons.set(placeholder, {
          id: placeholder,
          fullName: lu?.fullName ?? `Usuario ${legacyId}`,
          email: lu?.email ?? null,
          isActive: false,
          platformRole: null,
          externalReference: placeholder,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
      return placeholder;
    };

    const mapClub = (legacyId: string | null | undefined): string | null => {
      if (!legacyId) return null;
      const k = clubByLegacy.get(legacyId);
      if (k) {
        if (!dirClubs.has(k.id)) {
          dirClubs.set(k.id, {
            id: k.id,
            name: k.name,
            code: k.code,
            status: k.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
        return k.id;
      }
      const lc = legacyClub.get(legacyId);
      const placeholder = `legacy:club:${legacyId}`;
      const entry = report.unmappedClubs.get(legacyId) ?? { name: lc?.name ?? '?', code: lc?.code ?? '?', refs: 0 };
      entry.refs++;
      report.unmappedClubs.set(legacyId, entry);
      if (!dirClubs.has(placeholder)) {
        dirClubs.set(placeholder, {
          id: placeholder,
          name: lc?.name ?? `Club ${legacyId}`,
          code: lc?.code ?? placeholder,
          status: 'INACTIVE',
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
      return placeholder;
    };

    // --- 3. Legacy meetings and related rows --------------------------------
    const meetings = await q(legacy, `SELECT * FROM "Meeting" ORDER BY "createdAt"`);
    const meetingIds = meetings.map((m) => m.id);
    const inMeetings = `= ANY($1::text[])`;
    const topics = await q(legacy, `SELECT * FROM "AgendaTopic" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const sessions = await q(
      legacy,
      `SELECT * FROM "VoteSession" WHERE "meetingId" ${inMeetings} ORDER BY round, "openedAt"`,
      [meetingIds],
    );
    const sessionIds = sessions.map((s) => s.id);
    const candidates = await q(legacy, `SELECT * FROM "VoteCandidate" WHERE "voteSessionId" = ANY($1::text[])`, [
      sessionIds,
    ]);
    const votes = await q(legacy, `SELECT * FROM "Vote" WHERE "voteSessionId" = ANY($1::text[]) ORDER BY "createdAt"`, [
      sessionIds,
    ]);
    const sealed = await q(legacy, `SELECT * FROM "SealedVote" WHERE "voteSessionId" = ANY($1::text[])`, [sessionIds]);
    const motions = await q(legacy, `SELECT * FROM "Motion" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const participants = await q(legacy, `SELECT * FROM "MeetingParticipant" WHERE "meetingId" ${inMeetings}`, [
      meetingIds,
    ]);
    const speaking = await q(legacy, `SELECT * FROM "SpeakingRequest" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const timers = await q(legacy, `SELECT * FROM "TimerSession" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const audit = await q(legacy, `SELECT * FROM "AuditLog" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const cartas = await q(legacy, `SELECT * FROM "CartaPoder" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const attendance = await q(legacy, `SELECT * FROM "ClubMeetingAttendance" WHERE "meetingId" ${inMeetings}`, [
      meetingIds,
    ]);
    const actas = await q(legacy, `SELECT * FROM "MeetingActa" WHERE "meetingId" ${inMeetings}`, [meetingIds]);
    const topicIds = topics.map((t) => t.id);
    const transcriptions = await q(legacy, `SELECT * FROM "TopicTranscription" WHERE "topicId" = ANY($1::text[])`, [
      topicIds,
    ]);
    const attachments = await q(
      legacy,
      `SELECT * FROM "Attachment" WHERE "entityType" = 'meeting' AND "entityId" ${inMeetings}`,
      [meetingIds],
    );

    // Map ids (persons/clubs) on every row ---------------------------------
    const tMeetings = meetings.map((m) => ({
      ...m,
      clubId: mapClub(m.clubId),
      createdById: mapUser(m.createdById),
      currentSpeakerId: mapUser(m.currentSpeakerId),
      nextSpeakerId: mapUser(m.nextSpeakerId),
    }));
    const tSessions = sessions.map((s) => ({
      ...s,
      openedById: mapUser(s.openedById),
      closedById: mapUser(s.closedById),
    }));
    const tCandidates = candidates.map((c) => ({ ...c, userId: mapUser(c.userId) }));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const meetingById = new Map(meetings.map((m) => [m.id, m]));
    const participantClub = new Map(participants.map((p) => [`${p.meetingId}:${p.userId}`, p.clubId as string | null]));
    const ballotSeen = new Set<string>();
    const tVotes = votes.map((v) => {
      const s = sessionById.get(v.voteSessionId)!;
      const m = meetingById.get(s.meetingId)!;
      // ballotClubId: the club the ballot counted for (also for SECRET votes,
      // where the legacy Vote.clubId is null), only for district meetings.
      let ballot: string | null = null;
      if (m.isDistrictMeeting) {
        const legacyClubId = v.clubId ?? participantClub.get(`${s.meetingId}:${v.userId}`) ?? null;
        ballot = mapClub(legacyClubId);
        if (ballot) {
          const key = `${v.voteSessionId}:${ballot}`;
          if (ballotSeen.has(key)) {
            report.warnings.push(
              `Vote ${v.id}: second ballot of club ${legacyClubId} in session ${v.voteSessionId} (legacy race) — kept with ballotClubId=null`,
            );
            ballot = null;
          } else ballotSeen.add(key);
        }
      }
      return { ...v, userId: mapUser(v.userId), clubId: mapClub(v.clubId), ballotClubId: ballot };
    });
    const tSealed = sealed.map((s) => ({ ...s, clubId: mapClub(s.clubId), receivedById: mapUser(s.receivedById) }));
    const tMotions = motions.map((m) => ({
      ...m,
      proposedByUserId: mapUser(m.proposedByUserId),
      proposedByClubId: mapClub(m.proposedByClubId),
      secondedByUserId: mapUser(m.secondedByUserId),
      secondedByClubId: mapClub(m.secondedByClubId),
    }));
    const tParticipants = participants.map((p) => ({ ...p, userId: mapUser(p.userId), clubId: mapClub(p.clubId) }));
    const tSpeaking = speaking.map((r) => ({ ...r, userId: mapUser(r.userId) }));
    const tAudit = audit.map((a) => ({ ...a, clubId: mapClub(a.clubId), actorUserId: mapUser(a.actorUserId) }));
    const tCartas = cartas.map((c) => ({
      ...c,
      clubId: mapClub(c.clubId),
      presidentUserId: mapUser(c.presidentUserId),
      delegateUserId: mapUser(c.delegateUserId),
      secretaryUserId: mapUser(c.secretaryUserId),
      verifiedById: mapUser(c.verifiedById),
    }));
    const tAttendance = attendance.map((a) => ({
      ...a,
      clubId: mapClub(a.clubId),
      attendeeUserId: mapUser(a.attendeeUserId),
    }));
    const tActas = actas.map((a) => ({ ...a, publishedById: mapUser(a.publishedById) }));
    const tTranscriptions = transcriptions.map((t) => ({ ...t, userId: mapUser(t.userId) }));
    const tAttachments = attachments.map((a) => ({ ...a, uploadedById: mapUser(a.uploadedById) }));
    if (attachments.some((a) => a.storageBackend !== 'fs')) {
      report.warnings.push(
        `${attachments.filter((a) => a.storageBackend !== 'fs').length} meeting attachment(s) live in R2: rows are copied, files must be copied into MEETINGS_UPLOAD_DIR/<storageKey> by hand`,
      );
    }

    // ClubStanding from the legacy Club flags (every mapped legacy club).
    for (const c of lClubs) if (clubByLegacy.has(c.id)) mapClub(c.id);
    const standings = lClubs
      .filter((c) => clubByLegacy.has(c.id))
      .map((c) => ({
        clubId: clubByLegacy.get(c.id)!.id,
        isConstituido: c.isConstituido,
        cuotaAldia: c.cuotaAldia,
        informeAlDia: c.informeAlDia,
        enabledForDistrictMeetings: c.enabledForDistrictMeetings,
        updatedById: null,
        updatedAt: now,
      }));

    // DistrictStaff: legacy DISTRICT_SECRETARY -> SECRETARY, SUPERADMIN -> SUPERADMIN.
    const staff: Row[] = [];
    for (const u of lUsers) {
      const role = u.role === 'DISTRICT_SECRETARY' ? 'SECRETARY' : u.role === 'SUPERADMIN' ? 'SUPERADMIN' : null;
      if (!role) continue;
      if (!u.isActive) {
        report.warnings.push(`Legacy ${u.role} ${u.fullName} <${u.email}> is inactive: not added to DistrictStaff`);
        continue;
      }
      const k = personByLegacy.get(u.id);
      if (!k) {
        report.warnings.push(
          `Legacy ${u.role} ${u.fullName} <${u.email}> has no kernel person: not added to DistrictStaff`,
        );
        continue;
      }
      mapUser(u.id);
      staff.push({
        personId: k.id,
        role,
        note: `Migrado de legacy (${u.role})`,
        createdById: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    const legacyRdrs = lUsers.filter((u) => u.role === 'DISTRICT_RDR');
    for (const u of legacyRdrs) {
      report.warnings.push(
        `Legacy DISTRICT_RDR ${u.fullName}: RDR comes from the kernel DISTRICT_RDR appointment, not DistrictStaff`,
      );
    }

    // --- 4. Write (or count) ------------------------------------------------
    const plan: [string, Row[], string][] = [
      ['DirPerson', [...dirPersons.values()], 'id'],
      ['DirClub', [...dirClubs.values()], 'id'],
      ['ClubStanding', standings, 'clubId'],
      ['DistrictStaff', staff, 'personId'],
      ['Meeting', tMeetings, 'id'],
      ['AgendaTopic', topics, 'id'],
      ['VoteSession', tSessions, 'id'],
      ['VoteCandidate', tCandidates, 'id'],
      ['Vote', tVotes, 'id'],
      ['SealedVote', tSealed, 'id'],
      ['Motion', tMotions, 'id'],
      ['MeetingParticipant', tParticipants, 'id'],
      ['SpeakingRequest', tSpeaking, 'id'],
      ['TimerSession', timers, 'id'],
      ['AuditLog', tAudit, 'id'],
      ['CartaPoder', tCartas, 'id'],
      ['ClubMeetingAttendance', tAttendance, 'id'],
      ['MeetingActa', tActas, 'id'],
      ['TopicTranscription', tTranscriptions, 'id'],
      ['Attachment', tAttachments, 'id'],
    ];

    if (target && !DRY_RUN) await target.query('BEGIN');
    for (const [table, rows, key] of plan) {
      let existing = 0;
      let inserted = 0;
      if (target) {
        const ids = rows.map((r) => r[key]);
        existing = ids.length
          ? Number(
              (await q(target, `SELECT count(*)::int AS n FROM "${table}" WHERE "${key}" = ANY($1::text[])`, [ids]))[0]
                .n,
            )
          : 0;
        if (!DRY_RUN) {
          inserted = await insertRows(target, table, rows);
          if (table === 'ClubStanding') {
            // reseed rows nobody edited by hand (e.g. defaults created by a sync)
            await target.query(
              `UPDATE "ClubStanding" t SET "isConstituido" = s."isConstituido", "cuotaAldia" = s."cuotaAldia",
                      "informeAlDia" = s."informeAlDia", "enabledForDistrictMeetings" = s."enabledForDistrictMeetings",
                      "updatedAt" = now()
                 FROM json_populate_recordset(null::"ClubStanding", $1::json) s
                WHERE t."clubId" = s."clubId" AND t."updatedById" IS NULL`,
              [JSON.stringify(rows)],
            );
          }
        }
      }
      report.tables.push({ table, source: rows.length, inserted, existing });
      if (VERBOSE) console.log(`${table}: ${rows.length} source rows`);
    }
    if (target && !DRY_RUN) await target.query('COMMIT');

    report.print();
    if (DRY_RUN) {
      console.log(
        `\nDry run: ${meetings.length} meeting(s) would be migrated${target ? '' : ' (MEETINGS_DATABASE_URL not set: "existing" not computed)'}.`,
      );
    }
  } catch (err) {
    if (target && !DRY_RUN) await target.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await legacy.end();
    await kernel.end();
    if (target) await target.end();
  }
}

/** Generic idempotent insert: JSON -> record of the target table, ON CONFLICT DO NOTHING. */
async function insertRows(c: Client, table: string, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = (
    await q(
      c,
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    )
  ).map((r) => r.column_name as string);
  const present = cols.filter((col) => rows.some((r) => col in r));
  const list = present.map((col) => `"${col}"`).join(', ');
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => Object.fromEntries(present.map((col) => [col, r[col] ?? null])));
    const res = await c.query(
      `INSERT INTO "${table}" (${list})
       SELECT ${list} FROM json_populate_recordset(null::"${table}", $1::json)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(chunk)],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
