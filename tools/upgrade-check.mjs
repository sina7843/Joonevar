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
 * Phase 4 (PROMPT-008) adds the breeding generation before its own
 * migrations: owners with KYC, a pedigreed and chipped pair with a puppy's
 * lineage, a kennel, an issued permit whose dates are confirmed, conflicted and
 * pending, a pregnancy and a litter, a one-sided personal declaration, an animal
 * listing and a shop order. After the upgrade it checks that no animal was put
 * on the finder, nobody was subscribed, and the derived last mating is exactly
 * the newest mutually confirmed date — never a pending, conflicted or
 * one-sided one.
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

/** Rows step 6a writes into Phase 3 tables on purpose; every other table checked must stay empty. */
const WRITTEN_BEFORE_PHASE_4 = { animal_listing: 1, commerce_seller: 1, commerce_order: 1, commerce_suborder: 1 };
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

  // ── 6a. What a Phase 3 database holds about breeding (PHASE-4 PROMPT-008) ──
  //
  // Two KYC-approved owners, a pedigreed pair of dogs with official chips and a
  // puppy whose lineage names them, a kennel, an issued permit whose dates are
  // every state a date can be in — two confirmed (the older one confirmed last),
  // a conflicted pair and one still pending — a pregnancy, a litter with two
  // puppies, a one-sided personal declaration whose note names a later date,
  // an animal listing and a shop order. The pedigree rows are written with
  // foreign-key triggers suspended for that one statement: the chain that issues
  // a real pedigree (visit, sample, parentage result, payment) has its own
  // suites, and what this rehearsal needs is only that the row exists.
  const breeding = await withClient(target, async (client) => {
    const one = async (text, values = []) => (await client.query(text, values)).rows[0];
    const ownerA = ids.accountId;
    const ownerB = (await one("insert into account (mobile, status) values ('09990990002', 'ACTIVE') returning id")).id;
    await client.query(
      `insert into profile (account_id, first_name, last_name, national_id, birth_date) values ($1, 'نمونه', 'مالک دوم', '0084575948', '1988-02-02')`,
      [ownerB],
    );
    for (const owner of [ownerA, ownerB]) await client.query("insert into kyc_case (account_id, status) values ($1, 'APPROVED')", [owner]);
    const breed = (await one("select id from reference_breed where species_code = 'DOG' order by sort_order limit 1"))?.id ?? null;
    const animal = async (owner, name, sex, sire = null, dam = null) =>
      (await one(
        `insert into animal (owner_account_id, status, species, name, sex, breed_id, birth_date, sire_animal_id, dam_animal_id)
         values ($1, 'REGISTERED', 'DOG', $2, $3, $4, '2022-01-01', $5, $6) returning id`,
        [owner, name, sex, breed, sire, dam],
      )).id;
    const sire = await animal(ownerA, 'پدر ارتقا', 'MALE');
    const dam = await animal(ownerB, 'مادر ارتقا', 'FEMALE');
    const pup = await animal(ownerA, 'توله ارتقا', 'MALE', sire, dam);
    for (const [id, owner, number] of [[sire, ownerA, '985112345678911'], [dam, ownerB, '985112345678912']]) {
      await client.query(
        "insert into microchip (animal_id, number, bound_via, read_method, bound_by_account_id) values ($1, $2, 'IMPLANT', 'BLUETOOTH_READER', $3)",
        [id, number, owner],
      );
    }
    await client.query("set session_replication_role = replica");
    for (const [id, owner, code] of [[sire, ownerA, 'HZ-UPG-0001'], [dam, ownerB, 'HZ-UPG-0002']]) {
      await client.query(
        `insert into pedigree (animal_id, owner_account_id, item_id, batch_id, pedigree_code, issued_from_result_id, issued_from_result_version, generation_at_issue)
         values ($1, $2, gen_random_uuid(), gen_random_uuid(), $3, gen_random_uuid(), 1, 1)`,
        [id, owner, code],
      );
    }
    await client.query("set session_replication_role = origin");
    await client.query("insert into kennel (owner_account_id, status) values ($1, 'APPROVED')", [ownerB]);
    const permit = (await one(
      `insert into mating_permit (initiator_account_id, counterparty_account_id, sire_animal_id, dam_animal_id, status, permit_no, issued_at, counterparty_confirmed_at)
       values ($1, $2, $3, $4, 'ISSUED', 'MP-UPGRADE1', now(), now()) returning id`,
      [ownerA, ownerB, sire, dam],
    )).id;
    const date = async (version, matedOn, status, declaredBy, confirmedBy, extra = {}) =>
      (await one(
        `insert into mating_date_declaration (permit_id, version, mated_on, status, declared_by_account_id, confirmed_by_account_id, confirmed_at, conflicts_with_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [permit, version, matedOn, status, declaredBy, confirmedBy, confirmedBy ? new Date(Date.UTC(2025, 5, version)) : null, extra.conflictsWith ?? null],
      )).id;
    await date(1, '2025-03-10', 'CONFIRMED', ownerA, ownerB);
    const conflicted = await date(2, '2025-04-01', 'CONFLICTED', ownerA, null);
    await date(3, '2025-04-02', 'PROPOSED', ownerB, null, { conflictsWith: conflicted });
    // An older date confirmed after the newer one: the newest mating still wins.
    await date(4, '2025-02-01', 'CONFIRMED', ownerB, ownerA);
    await client.query("insert into pregnancy_declaration (permit_id, version, pregnant, expected_count, declared_by_account_id) values ($1, 1, true, 2, $2)", [permit, ownerB]);
    const litter = (await one("insert into litter (permit_id, born_on) values ($1, '2025-05-10') returning id", [permit])).id;
    await client.query("insert into birth_event (permit_id, version, born_on, live_count, dead_count, declared_by_account_id) values ($1, 1, '2025-05-10', 2, 0, $2)", [permit, ownerB]);
    for (const code of ['PUP-UPG00001', 'PUP-UPG00002']) {
      await client.query('insert into puppy (litter_id, permit_id, temp_code, created_by_version) values ($1, $2, $3, 1)', [litter, permit, code]);
    }
    // A one-sided personal declaration: its note names a date after every official one.
    const declaration = (await one(
      `insert into personal_declaration (initiator_account_id, initiator_animal_id, counterparty_animal_id, counterparty_account_id, invited_mobile)
       values ($1, $2, $3, $4, '09990990002') returning id`,
      [ownerA, sire, dam, ownerB],
    )).id;
    await client.query("insert into personal_note (declaration_id, kind, note_date, recorded_by_account_id) values ($1, 'MATING_DATE', '2025-06-01', $2)", [declaration, ownerA]);
    // The marketplace and the shop, as the second owner.
    const listing = (await one("insert into animal_listing (animal_id, seller_account_id, seller_kind, status) values ($1, $2, 'OWNER', 'PUBLISHED') returning id", [dam, ownerB])).id;
    const seller = (await one("insert into commerce_seller (owner_account_id, kind) values ($1, 'PET_SHOP') returning id", [ownerB])).id;
    const order = (await one(
      `insert into commerce_order (buyer_account_id, reference, items_total_toman, discount_total_toman, shipping_total_toman, grand_total_toman, recipient_name_fa, recipient_phone, address_fa, holds_expire_at, status)
       values ($1, 'ORD-UPGRADE1', 100000, 0, 20000, 120000, 'نمونه', '09990990001', 'نشانی نمونه', now() + interval '1 hour', 'PAID') returning id`,
      [ownerA],
    )).id;
    await client.query(
      `insert into commerce_suborder (order_id, seller_id, reference, items_total_toman, discount_toman, shipping_toman, buyer_total_toman, commission_percent_bp, commission_toman, payout_toman)
       values ($1, $2, 'SUB-UPGRADE1', 100000, 0, 20000, 120000, 1000, 10000, 110000)`,
      [order, seller],
    );
    const before = (await client.query('select id, version, mated_on, status from mating_date_declaration where permit_id = $1 order by version', [permit])).rows;
    return { ownerA, ownerB, sire, dam, pup, permit, litter, declaration, listing, seller, order, dates: before };
  });
  console.log('Phase 3 breeding, marketplace and shop rows written');

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
      'finder_personal_mating',
      'finder_downstream_link',
      'finder_user_block',
      'finder_feedback',
      'finder_reminder',
      'account_sanction',
      'moderation_report_evidence',
    ]) {
      const counted = await client.query('select count(*)::int as value from ' + table);
      // PROMPT-008 wrote one row into each of these before the Phase 4 upgrade; they must hold exactly that.
      const written = WRITTEN_BEFORE_PHASE_4[table] ?? 0;
      check(
        'the ' + (/^(finder_|mating_(profile|request|coordination)|animal_(fertility|life|last)|account_sanction|moderation_report_evidence)/.test(table) ? 'Phase 4' : 'Phase 3') +
          ' table ' + table + (written === 0 ? ' exists and starts empty' : ' holds exactly the ' + written + ' row written, none invented'),
        counted.rows[0]?.value === written,
        'rows=' + counted.rows[0]?.value,
      );
    }

    // PROMPT-008: the breeding records of a Phase 3 database, after the Phase 4 upgrade.
    const dates = (await client.query('select id, version, mated_on, status, permit_id, personal_mating_id from mating_date_declaration where permit_id = $1 order by version', [breeding.permit])).rows;
    check(
      'every official date keeps its version, day and state — nothing pending or conflicted was confirmed',
      JSON.stringify(dates.map((d) => [d.id, d.version, d.mated_on, d.status])) === JSON.stringify(breeding.dates.map((d) => [d.id, d.version, d.mated_on, d.status])),
      JSON.stringify(dates.map((d) => d.status)),
    );
    check('every existing date still belongs to its permit and to no personal record', dates.every((d) => d.permit_id === breeding.permit && d.personal_mating_id === null));
    const last = (await client.query('select animal_id, last_mated_on::text as on, source, confirmed_count from animal_last_mating order by animal_id')).rows;
    const expected = [breeding.sire, breeding.dam].sort();
    check(
      'the derived last mating exists for exactly the two animals of confirmed dates',
      JSON.stringify(last.map((r) => r.animal_id)) === JSON.stringify(expected),
      'animals=' + last.length,
    );
    check(
      'it is the newest confirmed date, from the official source, counting both confirmations',
      last.every((r) => r.on === '2025-03-10' && r.source === 'OFFICIAL' && Number(r.confirmed_count) === 2),
      JSON.stringify(last.map((r) => [r.on, r.source, r.confirmed_count])),
    );
    check('neither the pending, the conflicted nor the one-sided later date became a last mating', !last.some((r) => ['2025-04-01', '2025-04-02', '2025-06-01'].includes(r.on)));
    const note = await client.query('select note_date from personal_note where declaration_id = $1', [breeding.declaration]);
    check('the one-sided personal declaration and its note are untouched', String(note.rows[0]?.note_date) === '2025-06-01');
    const permitRow = await client.query('select status, permit_no from mating_permit where id = $1', [breeding.permit]);
    check('the issued permit keeps its state and number', permitRow.rows[0]?.status === 'ISSUED' && permitRow.rows[0]?.permit_no === 'MP-UPGRADE1');
    const kept = await client.query(
      `select (select count(*) from pregnancy_declaration where permit_id = $1)::int as pregnancy,
              (select count(*) from puppy where litter_id = $2)::int as puppies,
              (select count(*) from pedigree where animal_id in ($3, $4))::int as pedigrees,
              (select count(*) from microchip where animal_id in ($3, $4))::int as chips,
              (select count(*) from animal where id = $5 and sire_animal_id = $3 and dam_animal_id = $4)::int as lineage,
              (select count(*) from kyc_case where account_id in ($6, $7) and status = 'APPROVED')::int as kyc,
              (select count(*) from animal_listing where id = $8 and status = 'PUBLISHED')::int as listing,
              (select count(*) from commerce_order where id = $9 and status = 'PAID')::int as orders`,
      [breeding.permit, breeding.litter, breeding.sire, breeding.dam, breeding.pup, breeding.ownerA, breeding.ownerB, breeding.listing, breeding.order],
    );
    const k = kept.rows[0];
    check(
      'pregnancy, litter, pedigrees, chips, lineage, KYC, the listing and the paid order all came through',
      k.pregnancy === 1 && k.puppies === 2 && k.pedigrees === 2 && k.chips === 2 && k.lineage === 1 && k.kyc === 2 && k.listing === 1 && k.orders === 1,
      JSON.stringify(k),
    );
    check(
      'no animal was put on the finder and no account was subscribed, not even the pedigreed, chipped, KYC-approved ones',
      (await client.query('select (select count(*) from mating_profile)::int + (select count(*) from finder_subscription_period)::int as n')).rows[0].n === 0,
    );

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
