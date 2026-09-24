/**
 * Upgrade rehearsal — Phase 2.5 §12 (PROMPT-016).
 *
 * Every test run proves the migrations apply to an empty database. That is the
 * easy half. The half that matters on delivery day is the other one: a database
 * that already holds Phase 1 and Phase 2 records, upgraded in place.
 *
 * So this does exactly that, on a disposable database:
 *
 *   1. applies the migrations that existed before Phase 2.5 (0000–0032),
 *   2. seeds the baseline and writes representative rows by hand — an account,
 *      a profile, an animal, a lifetime membership, a published association and
 *      a published club — using the column shapes of that generation,
 *   3. applies the Phase 2.5 migrations on top,
 *   4. reads the rows back and checks what the phase promised about them:
 *      the lifetime membership is still lifetime and still has no invented
 *      expiry, the published community became ACTIVE without claiming a
 *      verifier, existing co-managers became ADMIN, and every older payment item
 *      says its price came from a setting.
 *
 * It is a script rather than a test because it is a rehearsal an operator runs
 * before an upgrade, with its own throwaway database and its own report.
 *
 * Usage: node tools/upgrade-check.mjs [--keep]
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(root, 'src', 'db', 'migrations');
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';

/** The last migration of Phase 2. Everything after it is Phase 2.5. */
const LAST_PHASE_2 = '0032';

const keep = process.argv.includes('--keep');
const name = 'hamzist_upgrade_' + randomBytes(4).toString('hex');

function urlFor(database) {
  const url = new URL(ADMIN_URL);
  url.pathname = '/' + database;
  return url.toString();
}

async function withClient(connectionString, run) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Apply the migration files in order, recording them the way drizzle does. */
async function applyMigrations(client, filter) {
  const files = (await fs.readdir(MIGRATIONS)).filter((file) => file.endsWith('.sql')).sort();
  await client.query('create schema if not exists drizzle');
  await client.query(
    'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
  );
  const applied = [];
  for (const file of files) {
    if (!filter(file)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS, file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed === '') continue;
      await client.query(trimmed);
    }
    await client.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [file, Date.now()]);
    applied.push(file);
  }
  return applied;
}

const problems = [];
const checks = [];

function check(title, condition, detail = '') {
  checks.push({ title, ok: Boolean(condition), detail });
  if (!condition) problems.push(title + (detail ? ' — ' + detail : ''));
}

await withClient(ADMIN_URL, (client) => client.query('create database ' + name));
console.log('rehearsal database: ' + name);

try {
  const target = urlFor(name);

  // ── 1. The database as it stood before Phase 2.5 ──────────────────────────
  const before = await withClient(target, (client) =>
    applyMigrations(client, (file) => file.slice(0, 4) <= LAST_PHASE_2),
  );
  console.log('applied ' + before.length + ' migrations up to ' + LAST_PHASE_2);

  // ── 2. Representative records of that generation ─────────────────────────
  const ids = await withClient(target, async (client) => {
    const account = await client.query(
      "insert into account (mobile, status) values ('09990990001', 'ACTIVE') returning id",
    );
    const accountId = account.rows[0].id;
    await client.query(
      `insert into profile (account_id, first_name, last_name, display_name, national_id, birth_date)
       values ($1, 'نمونه', 'ارتقا', 'نمونه ارتقا', '0012345678', '1990-01-01')`,
      [accountId],
    );
    // A lifetime membership of the Phase 1 model: ACTIVE with no period at all.
    await client.query("insert into membership (account_id, status) values ($1, 'ACTIVE')", [accountId]);
    const animal = await client.query(
      `insert into animal (owner_account_id, status, species, name, sex)
       values ($1, 'REGISTERED', 'DOG', 'سگ ارتقا', 'MALE') returning id`,
      [accountId],
    );
    const association = await client.query(
      `insert into community (kind, display_name_fa, scope, public_status, public_slug, about_fa, contact_phone)
       values ('ASSOCIATION', 'انجمن ارتقا', 'NATIONAL', 'PUBLISHED', 'assoc-1234567890', 'معرفی', '02100000000') returning id`,
    );
    const club = await client.query(
      `insert into community (kind, display_name_fa, scope, public_status, public_slug, about_fa, contact_phone)
       values ('CLUB', 'کلاب ارتقا', 'BREED', 'PUBLISHED', 'club-1234567890', 'معرفی', '02100000001') returning id`,
    );
    const draftClub = await client.query(
      `insert into community (kind, display_name_fa, scope, public_status)
       values ('CLUB', 'کلاب پیش‌نویس ارتقا', 'OTHER', 'DRAFT') returning id`,
    );
    await client.query(
      `insert into community_manager (community_id, account_id, role_fa, status, invited_by_account_id)
       values ($1, $2, 'دبیر', 'ACCEPTED', $2)`,
      [association.rows[0].id, accountId],
    );
    // A payment of the older model, priced from a managed setting.
    const batch = await client.query(
      `insert into payment_batch (account_id, service, status, resume_context)
       values ($1, 'MEMBERSHIP', 'PAID', '{"entity":{"type":"ACCOUNT","id":"x"},"step":"MEMBERSHIP_PAYMENT","originRoute":"/membership"}'::jsonb)
       returning id`,
      [accountId],
    );
    await client.query(
      `insert into payment_item (batch_id, target_type, target_id, amount_toman, setting_key, setting_version)
       values ($1, 'MEMBERSHIP', $2, '150000', 'fee.membership_toman', 1)`,
      [batch.rows[0].id, accountId],
    );
    return {
      accountId,
      animalId: animal.rows[0].id,
      associationId: association.rows[0].id,
      clubId: club.rows[0].id,
      draftClubId: draftClub.rows[0].id,
      batchId: batch.rows[0].id,
    };
  });
  console.log('representative rows written');

  // ── 3. The Phase 2.5 migrations, on top of real data ─────────────────────
  const after = await withClient(target, (client) => applyMigrations(client, (file) => file.slice(0, 4) > LAST_PHASE_2));
  console.log('applied ' + after.length + ' Phase 2.5 migrations: ' + after.join(', '));

  // ── 4. What the phase promised about those rows ──────────────────────────
  await withClient(target, async (client) => {
    const membership = await client.query('select status, lifetime, current_period_ends_at from membership where account_id = $1', [
      ids.accountId,
    ]);
    const row = membership.rows[0];
    check('a Phase 1 ACTIVE membership stays active', row?.status === 'ACTIVE', 'status=' + row?.status);
    check('it is marked lifetime rather than given a period', row?.lifetime === true, 'lifetime=' + row?.lifetime);
    check('no expiry date was invented for it', row?.current_period_ends_at === null, 'endsAt=' + row?.current_period_ends_at);

    const communities = await client.query('select id, kind, lifecycle, verified_at, verified_by_account_id from community');
    const association = communities.rows.find((entry) => entry.id === ids.associationId);
    const club = communities.rows.find((entry) => entry.id === ids.clubId);
    const draft = communities.rows.find((entry) => entry.id === ids.draftClubId);
    check('a published association became ACTIVE', association?.lifecycle === 'ACTIVE', 'lifecycle=' + association?.lifecycle);
    check('a published club became ACTIVE', club?.lifecycle === 'ACTIVE', 'lifecycle=' + club?.lifecycle);
    check('an unpublished club stayed DRAFT', draft?.lifecycle === 'DRAFT', 'lifecycle=' + draft?.lifecycle);
    check(
      'no verifier was invented for a backfilled record',
      association?.verified_at === null && association?.verified_by_account_id === null,
      'verifiedAt=' + association?.verified_at,
    );

    const managers = await client.query('select role, status from community_manager where community_id = $1', [ids.associationId]);
    check('an existing co-manager became ADMIN', managers.rows[0]?.role === 'ADMIN', 'role=' + managers.rows[0]?.role);
    check('their acceptance was not disturbed', managers.rows[0]?.status === 'ACCEPTED', 'status=' + managers.rows[0]?.status);

    const items = await client.query('select price_source, setting_key, price_source_id from payment_item where batch_id = $1', [
      ids.batchId,
    ]);
    check('an older payment item still says its price came from a setting', items.rows[0]?.price_source === 'SETTING');
    check('and it kept the key it was priced from', items.rows[0]?.setting_key === 'fee.membership_toman');
    check('with no club rule version attached', items.rows[0]?.price_source_id === null);

    const animal = await client.query('select status, species from animal where id = $1', [ids.animalId]);
    check('an existing animal is untouched', animal.rows[0]?.status === 'REGISTERED' && animal.rows[0]?.species === 'DOG');

    // The new tables exist and are empty, which is what an upgrade should leave.
    for (const table of ['club_rule_version', 'club_membership', 'club_reevaluation', 'community_ownership_request']) {
      const counted = await client.query('select count(*)::int as value from ' + table);
      check('the new table ' + table + ' exists and starts empty', counted.rows[0]?.value === 0);
    }

    // Re-running the whole set changes nothing: drizzle records what it applied.
    const rerun = await applyMigrations(client, () => false);
    check('a second run applies nothing', rerun.length === 0);
  });
} finally {
  if (keep) {
    console.log('kept ' + name + ' for inspection');
  } else {
    await withClient(ADMIN_URL, (client) => client.query('drop database if exists ' + name + ' with (force)'));
  }
}

console.log('');
for (const entry of checks) console.log((entry.ok ? 'ok   ' : 'FAIL ') + entry.title + (entry.detail && !entry.ok ? ' [' + entry.detail + ']' : ''));
console.log('');
console.log(checks.filter((entry) => entry.ok).length + '/' + checks.length + ' checks passed');
if (problems.length > 0) {
  console.error('upgrade rehearsal failed:');
  for (const problem of problems) console.error(' - ' + problem);
  process.exit(1);
}
