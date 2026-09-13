/**
 * Veterinary professional tag in the database — Phase 2.5 PROMPT-002.
 *
 * The gates of the prompt, each against a real Postgres:
 *  - migration-existing-data: 0031 runs on a database that already holds
 *    Phase 2 profiles and applications, backfills only what the data supports
 *    and leaves profiles and claim history as they were;
 *  - one-tag-concurrency: one current tag per account, from the index itself
 *    and through two service calls racing for the same account;
 *  - authorization: who may change a tag, and a tag never opening a context;
 *  - rollback: a tag written inside a failing transaction is not there afterwards.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { actorFor } from '../helpers/mating.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { createDatabase } from '../../src/db/client.ts';
import { MIGRATIONS_FOLDER, migrateTo } from '../../src/db/migrate.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { cities } from '../../src/db/schema/geography.ts';
import { vetApplications, vetProfiles, vetTagAssignments } from '../../src/db/schema/vets.ts';
import { createSession, resolveSession, setSessionContext } from '../../src/identity/session.ts';
import { decideVetApplication, submitVetApplication } from '../../src/vets/onboarding.ts';
import { currentVetTag, endVetTag, publicVetTag, replaceVetTag, vetTagHistory } from '../../src/vets/professional-tags.ts';
import type { Actor } from '../../src/authz/actor.ts';

let testDb: TestDb;
let storage: string;
let reviewer: Actor;
let tehranCityId: string;
let counter = 0;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  storage = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-vet-tag-'));
  reviewer = actorFor(await createTestAccount(testDb.db, '09990250001'), 'REVIEW_OPERATOR');
  const [tehran] = await testDb.db.select().from(cities).where(and(eq(cities.provinceCode, 'tehran'), eq(cities.nameFa, 'تهران')));
  tehranCityId = tehran!.id;
});

after(async () => {
  await testDb?.drop();
  if (storage) await fs.rm(storage, { recursive: true, force: true });
});

const pgCode = (error: unknown): string | undefined =>
  (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
const appCode = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

async function newAccountId(): Promise<string> {
  counter += 1;
  // Its own prefix: 0999025xxxx is the reviewer's range.
  return createTestAccount(testDb.db, '0999026' + String(counter).padStart(4, '0'));
}

const grant = (accountId: string, tag: string, practiceScope: string | null, who: Actor | null = reviewer) =>
  testDb.db.transaction((tx) => replaceVetTag(tx, who, { accountId, tag, practiceScope, reasonFa: 'SYNTHETIC دلیل', source: { type: 'TEST' } }));

// ── migration-existing-data ────────────────────────────────────────────────

test('0031 runs on a database with Phase 2 data, backfills verified owned profiles only and changes nothing else', async () => {
  const upgraded = await createTestDb({ migrate: false });
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'hamzist-migrations-0030-'));
  try {
    // The release before this one: every migration up to 0030.
    await fs.cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = path.join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as { entries: { tag: string }[] };
    // The release before 0031 has neither 0031 nor anything written after it.
    const cut = journal.entries.findIndex((entry) => entry.tag === '0031_vet-professional-tag');
    for (const entry of journal.entries.slice(cut)) await fs.rm(path.join(folder, entry.tag + '.sql'));
    journal.entries = journal.entries.slice(0, cut);
    await fs.writeFile(journalPath, JSON.stringify(journal));
    const previous = createDatabase(upgraded.url);
    try {
      await migrate(previous.db, { migrationsFolder: folder });
    } finally {
      await previous.pool.end();
    }

    // Data as Phase 2 left it.
    const { db, pool } = createDatabase(upgraded.url);
    const verifiedAt = new Date('2026-03-01T08:00:00Z');
    let ids: { verified: string; unverified: string; merged: string; verifiedProfile: string; application: string };
    try {
      const account = async (mobile: string) =>
        (await db.execute<{ id: string }>(sql`insert into account (mobile, status) values (${mobile}, 'ACTIVE') returning id`)).rows[0]!.id;
      const verified = await account('09990259001');
      const unverified = await account('09990259002');
      const merged = await account('09990259003');
      const profile = async (accountId: string | null, code: string | null, at: Date | null, mergedInto: string | null = null) =>
        (
          await db.execute<{ id: string }>(
            sql`insert into vet_profile (account_id, display_name_fa, council_code, council_verified_at, merged_into_profile_id)
                values (${accountId}, ${'دامپزشک ' + (code ?? 'بدون کد')}, ${code}, ${at}, ${mergedInto}) returning id`,
          )
        ).rows[0]!.id;
      const verifiedProfile = await profile(verified, 'SYN-UP-1', verifiedAt);
      await profile(unverified, 'SYN-UP-2', null);
      await profile(merged, 'SYN-UP-3', verifiedAt, verifiedProfile);
      await profile(null, null, null);
      const application = (
        await db.execute<{ id: string }>(
          sql`insert into vet_application (account_id, kind, vet_profile_id, display_name_fa, council_code, status)
              values (${verified}, 'PROFILE', ${verifiedProfile}, 'دامپزشک SYN-UP-1', 'SYN-UP-1', 'APPROVED') returning id`,
        )
      ).rows[0]!.id;
      ids = { verified, unverified, merged, verifiedProfile, application };
    } finally {
      await pool.end();
    }

    await migrateTo(upgraded.url);

    const after = createDatabase(upgraded.url);
    try {
      const tags = await after.db.select().from(vetTagAssignments);
      assert.equal(tags.length, 1, 'only the verified, owned, unmerged profile gets a tag');
      const [tag] = tags;
      assert.equal(tag!.accountId, ids.verified);
      assert.equal(tag!.tag, 'UNLICENSED');
      assert.equal(tag!.practiceScope, 'NOT_DECLARED', 'general or specialist is not invented');
      assert.equal(tag!.startedAt.toISOString(), verifiedAt.toISOString(), 'the tag starts when the code was verified');
      assert.equal(tag!.sourceType, 'BACKFILL_VET_PROFILE');
      assert.equal(tag!.sourceId, ids.verifiedProfile);
      assert.equal(tag!.endedAt, null);

      assert.equal((await after.db.select().from(vetProfiles)).length, 4, 'every profile is still there');
      const [application] = await after.db.select().from(vetApplications).where(eq(vetApplications.id, ids.application));
      assert.equal(application!.status, 'APPROVED', 'the application history is not rewritten');
      assert.equal(application!.vetProfileId, ids.verifiedProfile);
    } finally {
      await after.pool.end();
    }
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
    await upgraded.drop();
  }
});

// ── invariants in the database ─────────────────────────────────────────────

test('the database refuses a second current tag, a scope that does not fit, and any rewrite of history', async () => {
  const accountId = await newAccountId();
  const row = (tag: string, practiceScope: string | null) =>
    testDb.db.execute(
      sql`insert into vet_tag_assignment (account_id, tag, practice_scope, source_type) values (${accountId}, ${tag}, ${practiceScope}, 'TEST')`,
    );

  await assert.rejects(row('STUDENT', 'GENERAL'), (error) => pgCode(error) === '23514', 'a student has no scope');
  await assert.rejects(row('LICENSED', null), (error) => pgCode(error) === '23514', 'a doctor has one');

  // Two current tags written at the same moment on two connections: exactly one survives.
  const results = await Promise.allSettled([row('UNLICENSED', 'GENERAL'), row('LICENSED', 'GENERAL')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(pgCode(rejected.reason), '23505');

  const [current] = await testDb.db.select().from(vetTagAssignments).where(eq(vetTagAssignments.accountId, accountId));
  const update = (patch: ReturnType<typeof sql>) =>
    testDb.db.execute(sql`update vet_tag_assignment set ${patch} where id = ${current!.id}`);
  await assert.rejects(update(sql`tag = 'TRUSTED'`), (error) => pgCode(error) === '23001', 'the tag of a row never changes');
  await assert.rejects(update(sql`started_at = now() - interval '1 year'`), (error) => pgCode(error) === '23001');
  await assert.rejects(testDb.db.execute(sql`delete from vet_tag_assignment where id = ${current!.id}`), (error) => pgCode(error) === '23001');

  await update(sql`ended_at = now(), end_reason_fa = 'پایان'`);
  await assert.rejects(update(sql`ended_at = now() + interval '1 day'`), (error) => pgCode(error) === '23001', 'an ended row is final');
  await assert.rejects(update(sql`end_reason_fa = 'بازنویسی'`), (error) => pgCode(error) === '23001');
});

// ── one-tag-concurrency through the service ────────────────────────────────

test('replacing ends the previous tag, and asking for the same tag again writes nothing', async () => {
  const accountId = await newAccountId();
  const first = await grant(accountId, 'UNLICENSED', 'GENERAL');
  const same = await grant(accountId, 'UNLICENSED', 'GENERAL');
  assert.equal(same.id, first.id, 'a replayed event does not add a row');

  const licensed = await grant(accountId, 'LICENSED', 'GENERAL');
  const history = await vetTagHistory(testDb.db, reviewer, accountId);
  assert.deepEqual(history.map((row) => [row.tag, row.endedAt === null]), [['UNLICENSED', false], ['LICENSED', true]]);
  assert.equal((await currentVetTag(testDb.db, accountId))!.id, licensed.id);
  assert.deepEqual(await publicVetTag(testDb.db, accountId), { tag: 'LICENSED', labelFa: 'دکتر دامپزشک - عمومی - دارای پروانه فعالیت' });

  const audit = await testDb.db.select().from(auditEvents).where(and(eq(auditEvents.targetType, 'VET_TAG'), eq(auditEvents.targetId, licensed.id)));
  assert.equal(audit.length, 1);
  assert.deepEqual((audit[0]!.before as { tag: string }).tag, 'UNLICENSED');
});

test('two replacements racing for one account run one after the other and leave exactly one current tag', async () => {
  const accountId = await newAccountId();
  await grant(accountId, 'UNLICENSED', 'SPECIALIST');

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let firstHoldsLock!: () => void;
  const locked = new Promise<void>((resolve) => (firstHoldsLock = resolve));

  const first = testDb.db.transaction(async (tx) => {
    const row = await replaceVetTag(tx, reviewer, { accountId, tag: 'LICENSED', practiceScope: 'SPECIALIST', reasonFa: 'SYNTHETIC پرداخت', source: { type: 'TEST' } });
    firstHoldsLock();
    await gate; // still uncommitted: the second must wait for it
    return row;
  });
  await locked;
  const second = testDb.db.transaction((tx) =>
    replaceVetTag(tx, null, { accountId, tag: 'TRUSTED', practiceScope: 'SPECIALIST', reasonFa: 'SYNTHETIC معتمد', source: { type: 'TEST' } }),
  );
  // Give the second call time to reach the lock before the first commits.
  await new Promise((resolve) => setTimeout(resolve, 150));
  release();
  const [a, b] = await Promise.all([first, second]);

  const history = await testDb.db.select().from(vetTagAssignments).where(eq(vetTagAssignments.accountId, accountId));
  assert.equal(history.length, 3);
  assert.equal(history.filter((row) => row.endedAt === null).length, 1, 'one current tag');
  assert.equal((await currentVetTag(testDb.db, accountId))!.id, b.id, 'the later call saw the earlier one and replaced it');
  assert.notEqual(history.find((row) => row.id === a.id)!.endedAt, null);
});

// ── rollback ───────────────────────────────────────────────────────────────

test('a tag changed inside a transaction that fails is not changed at all', async () => {
  const accountId = await newAccountId();
  const before = await grant(accountId, 'UNLICENSED', 'GENERAL');
  await assert.rejects(
    testDb.db.transaction(async (tx) => {
      await replaceVetTag(tx, reviewer, { accountId, tag: 'LICENSED', practiceScope: 'GENERAL', reasonFa: 'SYNTHETIC', source: { type: 'TEST' } });
      throw new Error('the payment effect failed after the tag');
    }),
    /payment effect failed/,
  );
  const current = await currentVetTag(testDb.db, accountId);
  assert.equal(current!.id, before.id);
  assert.equal(current!.endedAt, null);
  assert.equal((await testDb.db.select().from(vetTagAssignments).where(eq(vetTagAssignments.accountId, accountId))).length, 1);
});

test('an approval that fails after writing the tag leaves no tag, no profile and the application in review', async () => {
  counter += 1;
  const applicantId = await newAccountId();
  const applicant = actorFor(applicantId, 'USER');
  const application = await submitVetApplication(testDb.db, storage, applicant, {
    kind: 'PROFILE',
    displayNameFa: 'دامپزشک متقاضی Tag ' + counter,
    councilCode: 'SYN-TAG-' + counter,
    cityId: tehranCityId,
    documents: [{ kind: 'COUNCIL_CARD', bytes: PNG, originalName: 'card.png' }],
  });

  // The notification is the last write of an approval; make it fail on this database only.
  await testDb.db.execute(sql`create function fail_notification() returns trigger language plpgsql as $$ begin raise exception 'notification store unavailable'; end; $$`);
  await testDb.db.execute(sql`create trigger fail_notification before insert on notification for each row execute function fail_notification()`);
  try {
    await assert.rejects(
      decideVetApplication(testDb.db, reviewer, { applicationId: application.id, expectedVersion: application.version, decision: 'APPROVE', reasonFa: 'SYNTHETIC تأیید' }),
    );
  } finally {
    await testDb.db.execute(sql`drop trigger fail_notification on notification`);
    await testDb.db.execute(sql`drop function fail_notification()`);
  }
  assert.equal(await currentVetTag(testDb.db, applicantId), null);
  assert.equal((await testDb.db.select().from(vetProfiles).where(eq(vetProfiles.accountId, applicantId))).length, 0);
  const [still] = await testDb.db.select().from(vetApplications).where(eq(vetApplications.id, application.id));
  assert.equal(still!.status, 'SUBMITTED');

  // The same approval, with nothing failing, gives the tag its verified code supports.
  const approved = await decideVetApplication(testDb.db, reviewer, {
    applicationId: application.id,
    expectedVersion: application.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC تأیید',
  });
  const tag = await currentVetTag(testDb.db, applicantId);
  assert.equal(tag!.tag, 'UNLICENSED');
  assert.equal(tag!.practiceScope, 'NOT_DECLARED');
  assert.equal(tag!.sourceType, 'LEGACY_VET_APPLICATION');
  assert.equal(tag!.sourceId, approved.id);
  assert.equal(tag!.grantedByAccountId, reviewer.accountId);
});

// ── authorization ──────────────────────────────────────────────────────────

test('only the reviewer side or the server changes a tag, never for its own account, and never an undeclared scope by hand', async () => {
  const accountId = await newAccountId();
  for (const context of ['USER', 'BREEDER', 'TRUSTED_VET', 'AUTHOR', 'CONTENT_ADMIN', 'GENETICS_OPERATOR'] as const) {
    const outsider = actorFor(await newAccountId(), context);
    await assert.rejects(grant(accountId, 'LICENSED', 'GENERAL', outsider), appCode('FORBIDDEN'), context);
  }
  await assert.rejects(grant(accountId, 'LICENSED', 'GENERAL', actorFor(accountId, 'USER')), appCode('FORBIDDEN'), 'the account itself');
  await assert.rejects(grant(reviewer.accountId, 'LICENSED', 'GENERAL', reviewer), appCode('FORBIDDEN'), 'a reviewer about themselves');
  await assert.rejects(grant(accountId, 'UNLICENSED', 'NOT_DECLARED'), appCode('VALIDATION'));
  await assert.rejects(grant(accountId, 'BADGE', 'GENERAL'), appCode('VALIDATION'));
  assert.equal(await currentVetTag(testDb.db, accountId), null, 'nothing was written by any refused call');

  // The server itself (null actor) may change a tag. STUDENT is not used here: it needs a verified student case (PROMPT-004).
  await grant(accountId, 'UNLICENSED', 'GENERAL', null);
  await assert.rejects(vetTagHistory(testDb.db, actorFor(await newAccountId(), 'USER'), accountId), appCode('FORBIDDEN'), 'another account cannot read the history');
  assert.equal((await vetTagHistory(testDb.db, actorFor(accountId, 'USER'), accountId)).length, 1, 'the account reads its own');

  await assert.rejects(
    testDb.db.transaction((tx) => endVetTag(tx, actorFor(accountId, 'USER'), { accountId, reasonFa: 'SYNTHETIC', source: { type: 'TEST' } })),
    appCode('FORBIDDEN'),
  );
  await testDb.db.transaction((tx) => endVetTag(tx, reviewer, { accountId, reasonFa: 'SYNTHETIC تعلیق', source: { type: 'TEST' } }));
  assert.equal(await currentVetTag(testDb.db, accountId), null);
});

test('a trusted tag without the TRUSTED_VET role opens no trusted context', async () => {
  const accountId = await newAccountId();
  await grant(accountId, 'TRUSTED', 'GENERAL');

  const plain = await createSession(testDb.db, accountId, 'USER');
  await assert.rejects(setSessionContext(testDb.db, plain.sessionId, 'TRUSTED_VET'), appCode('FORBIDDEN'));

  // Even a session row that claims the context resolves to USER: the role is read, the tag is not.
  const claimed = await createSession(testDb.db, accountId, 'TRUSTED_VET');
  const resolved = await resolveSession(testDb.db, claimed.token);
  assert.equal(resolved!.actor.context, 'USER');
  assert.deepEqual(resolved!.actor.activeRoles, []);
});
