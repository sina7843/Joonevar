/**
 * Upgrade rehearsal — Phase 2.5 §12 (PROMPT-016), extended in PHASE-3 PROMPT-014.
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
 * Phase 3 then repeats the exercise on the same database rather than a fresh
 * one, because that is the upgrade an operator actually performs: a Phase 1
 * database that became a Phase 2.5 database now becomes a Phase 3 one. It
 * writes the records of that generation — an owner, a dog, its microchip, a
 * kennel, a membership period, a payment and a club membership, and the
 * notification rows all of that produced — applies 0041 to 0052 on top, and
 * checks that every one of them came through unchanged, that the new tables
 * arrived empty, and that a previous release still runs: the inserts the old
 * code makes are made again, against the new schema, naming only the columns
 * that existed before 0041. That last check is what DEC-0179 promises, and
 * until now nothing rehearsed it against real data.
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

/** The last migration of Phase 2.5. Everything after it is Phase 3. */
const LAST_PHASE_2_5 = '0040';

/** The last migration of Phase 3. Everything after it is Phase 4 (PHASE-4 PROMPT-002). */
const LAST_PHASE_3 = '0052';

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
  // Bounded at both ends. Without the upper bound this stage quietly swallowed
  // every later phase as soon as one existed, and a rehearsal that applies
  // everything at once rehearses no upgrade boundary at all.
  const after = await withClient(target, (client) =>
    applyMigrations(client, (file) => file.slice(0, 4) > LAST_PHASE_2 && file.slice(0, 4) <= LAST_PHASE_2_5),
  );
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

  // ── 5. The records a Phase 2.5 database actually holds ───────────────────
  const legacy = await withClient(target, async (client) => {
    await client.query(
      `insert into microchip (animal_id, number, bound_via, read_method, bound_by_account_id)
       values ($1, '985112345678901', 'IMPLANT', 'BLUETOOTH_READER', $2)`,
      [ids.animalId, ids.accountId],
    );
    const kennel = await client.query(
      "insert into kennel (owner_account_id, status) values ($1, 'APPROVED') returning id",
      [ids.accountId],
    );
    const period = await client.query(
      `insert into membership_period (account_id, kind, status, tariff_setting_key, tariff_setting_version, amount_toman, period_days, starts_at, ends_at)
       values ($1, 'INITIAL', 'ACTIVE', 'fee.membership_toman', 1, '150000', 365, now(), now() + interval '365 days')
       returning id`,
      [ids.accountId],
    );
    await client.query('insert into club_membership (community_id, account_id, status) values ($1, $2, $3)', [
      ids.clubId,
      ids.accountId,
      'ACTIVE',
    ]);
    const notification = await client.query(
      `insert into notification (recipient_account_id, kind, entity_type, entity_id, step, origin_route, title_fa, body_fa)
       values ($1, 'CLUB_MEMBERSHIP_APPROVED', 'COMMUNITY', $2, 'CLUB_MEMBERSHIP', '/clubs', 'عضویت تأیید شد', 'متن اعلان')
       returning id`,
      [ids.accountId, ids.clubId],
    );
    return { kennelId: kennel.rows[0].id, periodId: period.rows[0].id, notificationId: notification.rows[0].id };
  });
  console.log('Phase 2.5 generation rows written');

  // ── 6. The Phase 3 migrations, on top of all of it ───────────────────────
  const phase3 = await withClient(target, (client) =>
    applyMigrations(client, (file) => file.slice(0, 4) > LAST_PHASE_2_5 && file.slice(0, 4) <= LAST_PHASE_3),
  );
  console.log('applied ' + phase3.length + ' Phase 3 migrations: ' + phase3.join(', '));

  // ── 6b. The Phase 4 migrations, bounded the same way ──────────────────────
  // The Phase 3 step above used to apply everything after 0040, so the first
  // Phase 4 migration would have been absorbed into it and no boundary would
  // have been rehearsed. PROMPT-008 adds representative Phase 3 rows here.
  const phase4 = await withClient(target, (client) =>
    applyMigrations(client, (file) => file.slice(0, 4) > LAST_PHASE_3),
  );
  console.log('applied ' + phase4.length + ' Phase 4 migrations: ' + phase4.join(', '));

  // ── 7. Nothing the earlier generations wrote may have moved ──────────────
  await withClient(target, async (client) => {
    const chip = await client.query('select number, bound_via from microchip where animal_id = $1', [ids.animalId]);
    check(
      'a microchip keeps its number and how it was bound',
      chip.rows[0]?.number === '985112345678901' && chip.rows[0]?.bound_via === 'IMPLANT',
      'number=' + chip.rows[0]?.number,
    );

    const kennel = await client.query('select status from kennel where id = $1', [legacy.kennelId]);
    check('an approved kennel stays approved', kennel.rows[0]?.status === 'APPROVED', 'status=' + kennel.rows[0]?.status);

    const period = await client.query(
      'select status, amount_toman, tariff_setting_key from membership_period where id = $1',
      [legacy.periodId],
    );
    check(
      'a membership period keeps its status and the tariff it was priced from',
      period.rows[0]?.status === 'ACTIVE' && period.rows[0]?.tariff_setting_key === 'fee.membership_toman',
      'status=' + period.rows[0]?.status,
    );
    check(
      'and its amount to the toman',
      String(period.rows[0]?.amount_toman) === '150000',
      'amount=' + period.rows[0]?.amount_toman,
    );

    const membership = await client.query(
      'select lifetime, current_period_ends_at from membership where account_id = $1',
      [ids.accountId],
    );
    check(
      'the lifetime membership is still lifetime after a second upgrade',
      membership.rows[0]?.lifetime === true && membership.rows[0]?.current_period_ends_at === null,
      'lifetime=' + membership.rows[0]?.lifetime,
    );

    const clubMembership = await client.query('select status from club_membership where community_id = $1', [ids.clubId]);
    check('a club membership stays active', clubMembership.rows[0]?.status === 'ACTIVE', 'status=' + clubMembership.rows[0]?.status);

    const notification = await client.query('select kind, title_fa from notification where id = $1', [legacy.notificationId]);
    check(
      'a notification row keeps its kind and its Persian text',
      notification.rows[0]?.kind === 'CLUB_MEMBERSHIP_APPROVED' && notification.rows[0]?.title_fa === 'عضویت تأیید شد',
      'kind=' + notification.rows[0]?.kind,
    );

    const item = await client.query('select price_source, setting_key from payment_item where batch_id = $1', [ids.batchId]);
    check(
      'the older payment item still says its price came from a setting',
      item.rows[0]?.price_source === 'SETTING' && item.rows[0]?.setting_key === 'fee.membership_toman',
    );

    const animal = await client.query('select status, name from animal where id = $1', [ids.animalId]);
    check(
      'the animal is the same animal',
      animal.rows[0]?.status === 'REGISTERED' && animal.rows[0]?.name === 'سگ ارتقا',
      'status=' + animal.rows[0]?.status,
    );

    // The Phase 3 tables arrived, and arrived empty: an upgrade adds capacity,
    // never rows nobody created.
    for (const table of [
      'animal_listing',
      'listing_inquiry',
      'listing_offer',
      'deal_handover',
      'animal_ownership_transfer',
      'commerce_seller',
      'commerce_product',
      'commerce_order',
      'commerce_suborder',
      'seller_shipping_method',
      'order_return',
      'seller_ledger_entry',
      'settlement_batch',
      'review',
      'discount_rule',
      'loyalty_entry',
      'rate_limit_hit',
      // Phase 4: the upgrade publishes no plan, subscribes nobody and seeds no rule by migration.
      'finder_plan_version',
      'finder_subscription_period',
      'finder_breed_rule',
      // PROMPT-003: no animal is put on the finder, no fertility or life event is invented, and with
      // no confirmed date in this data set the derived last mating starts empty too.
      'mating_profile',
      'mating_profile_media',
      'animal_fertility_declaration',
      'animal_life_event',
      'animal_last_mating',
      // PROMPT-004: nobody is given a favourite, a saved search or a notice by an upgrade.
      'finder_favorite',
      'finder_saved_search',
      'finder_match_notice',
      // PROMPT-005: no request, conversation, contract, code or approval is created by an upgrade.
      'mating_request',
      'mating_request_event',
      'mating_coordination',
      'finder_conversation',
      'finder_message',
      'finder_contract_template',
      'finder_contract',
      'finder_contract_version',
      'finder_contract_otp',
      'finder_contract_approval',
    ]) {
      const counted = await client.query('select count(*)::int as value from ' + table);
      check(
        'the ' + (/^(finder_|mating_(profile|request|coordination)|animal_(fertility|life|last))/.test(table) ? 'Phase 4' : 'Phase 3') + ' table ' + table + ' exists and starts empty',
        counted.rows[0]?.value === 0,
        'rows=' + counted.rows[0]?.value,
      );
    }

    // Nobody was made a seller, and nobody's animal was put up for sale.
    const invented = await client.query(
      'select (select count(*) from animal_listing where seller_account_id = $1)::int as listings,' +
        ' (select count(*) from commerce_seller where owner_account_id = $1)::int as sellers',
      [ids.accountId],
    );
    check(
      'the upgrade listed no animal and made no seller',
      invented.rows[0]?.listings === 0 && invented.rows[0]?.sellers === 0,
      JSON.stringify(invented.rows[0]),
    );
  });

  // ── 8. What DEC-0179 actually promises: the previous release still runs ──
  //
  // Every migration in this phase is additive, which is only worth anything if
  // a deployment that has not restarted yet keeps working. So the inserts the
  // previous release makes are made again here, naming only the columns that
  // existed before 0041, against the schema that exists after 0052.
  await withClient(target, async (client) => {
    const previousRelease = async (title, sql, params) => {
      try {
        await client.query(sql, params);
        check(title, true);
      } catch (error) {
        check(title, false, error.message);
      }
    };

    const second = await client.query(
      `insert into animal (owner_account_id, status, species, name, sex)
       values ($1, 'REGISTERED', 'DOG', 'سگ نسل قبل', 'FEMALE') returning id`,
      [ids.accountId],
    );
    check('the previous release can still register an animal', second.rows.length === 1);
    await previousRelease(
      'the previous release can still write a notification',
      `insert into notification (recipient_account_id, kind, entity_type, entity_id, step, origin_route, title_fa, body_fa)
       values ($1, 'MEMBERSHIP_ACTIVATED', 'ACCOUNT', $2, 'MEMBERSHIP', '/membership', 'عنوان', 'متن')`,
      [ids.accountId, ids.accountId],
    );
    await previousRelease(
      'the previous release can still open a payment batch',
      `insert into payment_batch (account_id, service, status, resume_context)
       values ($1, 'MEMBERSHIP', 'AWAITING_PAYMENT', '{"entity":{"type":"ACCOUNT","id":"x"},"step":"MEMBERSHIP_PAYMENT","originRoute":"/membership"}'::jsonb)`,
      [ids.accountId],
    );
    await previousRelease(
      'the previous release can still bind a microchip',
      `insert into microchip (animal_id, number, bound_via, read_method, bound_by_account_id)
       values ($1, '985119999999999', 'EXISTING_UNREGISTERED', 'MANUAL', $2)`,
      [second.rows[0].id, ids.accountId],
    );
    await previousRelease(
      'the previous release can still record a membership period',
      `insert into membership_period (account_id, kind, status, tariff_setting_key, tariff_setting_version, amount_toman, period_days)
       values ($1, 'RENEWAL', 'PENDING_PAYMENT', 'fee.membership_toman', 1, '150000', 365)`,
      [ids.accountId],
    );

    // Every file on disk was recorded exactly once, so the upgrade is complete
    // and nothing was applied twice on the way through three generations.
    const files = (await fs.readdir(MIGRATIONS)).filter((file) => file.endsWith('.sql'));
    const recorded = await client.query('select count(*)::int as value from drizzle.__drizzle_migrations');
    check(
      'every migration on disk was applied exactly once',
      recorded.rows[0]?.value === files.length,
      'recorded=' + recorded.rows[0]?.value + ' files=' + files.length,
    );
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
