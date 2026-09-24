/**
 * Phase 3 foundations against a real database — PROMPT-002.
 *
 * The risks worth a database for: that a stale panel cannot overwrite a newer
 * decision, that a snapshot taken before a change still reads the old value
 * afterwards, that every change leaves an audit row, and that a role which may
 * open the shell still cannot do the work it was not given.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { createTestAccount, createTestDb, type TestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import { auditEvents, productSettings, species } from '../../src/db/schema/core.ts';
import { marketplaceSpecies } from '../../src/db/schema/marketplace.ts';
import { readMoney, readSetting, snapshotSetting } from '../../src/settings/service.ts';
import {
  marketSettingGroups,
  settingHistory,
  updateMarketSetting,
} from '../../src/marketplace/operations.ts';
import {
  ensureMarketSpecies,
  marketSpecies,
  setSpeciesEnabled,
  speciesEnabled,
  assertSpeciesEnabled,
} from '../../src/marketplace/species.ts';
import { assertFlagEnabled, flagEnabled, flagStates } from '../../src/marketplace/flags.ts';
import { marketplaceRoleHolders, setMarketplaceRole } from '../../src/marketplace/roles.ts';
import type { Actor, ActorContextName } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

let testDb: TestDb;
let accountId: string;
let holderMobile: string;

const actorFor = (context: ActorContextName): Actor => ({
  accountId: accountId as AccountId,
  context,
  activeRoles: [],
});

const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

before(async () => {
  testDb = await createTestDb();
  await seedBaseline(testDb.db);
  accountId = await createTestAccount(testDb.db, '09990500001');
  holderMobile = '09990500002';
  await createTestAccount(testDb.db, holderMobile);
});

after(async () => {
  await testDb?.drop();
});

// ── species enablement ─────────────────────────────────────────────────────

test('the launch opens the dog for animal sale and every species for the shop', async () => {
  const rows = await marketSpecies(testDb.db);
  const animal = rows.filter((row) => row.market === 'ANIMAL_SALE');
  const shop = rows.filter((row) => row.market === 'MERCHANDISE');

  assert.ok(animal.length >= 2, 'the architecture carries every species');
  assert.deepEqual(
    animal.filter((row) => row.enabled).map((row) => row.speciesCode),
    ['DOG'],
    'only the dog is open for animal sale at launch',
  );
  assert.ok(shop.every((row) => row.enabled), 'the shop is open for every species from the start');

  assert.equal(await speciesEnabled(testDb.db, 'ANIMAL_SALE', 'DOG'), true);
  assert.equal(await speciesEnabled(testDb.db, 'ANIMAL_SALE', 'CAT'), false);
  await assert.rejects(assertSpeciesEnabled(testDb.db, 'ANIMAL_SALE', 'CAT'), code('CONFLICT'));
  // A pair nobody recorded is closed, not open by omission.
  assert.equal(await speciesEnabled(testDb.db, 'ANIMAL_SALE', 'NOT_A_SPECIES'), false);
});

test('a species the taxonomy gains later arrives closed for animal sale', async () => {
  await testDb.db.insert(species).values({ code: 'FERRET', nameFa: 'راسو', nameEn: 'Ferret', sortOrder: 9 });
  const inserted = await ensureMarketSpecies(testDb.db);
  assert.equal(inserted, 2, 'one row per market for the new species');
  assert.equal(await speciesEnabled(testDb.db, 'ANIMAL_SALE', 'FERRET'), false);
  assert.equal(await speciesEnabled(testDb.db, 'MERCHANDISE', 'FERRET'), true);

  // Running it again adds nothing: the seed is additive, not a reset.
  assert.equal(await ensureMarketSpecies(testDb.db), 0);
});

test('only a role that holds the capability may open or close a species', async () => {
  const [row] = await testDb.db
    .select()
    .from(marketplaceSpecies)
    .where(and(eq(marketplaceSpecies.market, 'ANIMAL_SALE'), eq(marketplaceSpecies.speciesCode, 'CAT')))
    .limit(1);

  for (const context of ['LISTING_MODERATOR', 'FINANCE_OPERATOR', 'SUPPORT_AGENT', 'USER'] as const) {
    await assert.rejects(
      setSpeciesEnabled(testDb.db, actorFor(context), {
        market: 'ANIMAL_SALE',
        speciesCode: 'CAT',
        enabled: true,
        reasonFa: 'SYNTHETIC',
        expectedVersion: row!.version,
      }),
      code('FORBIDDEN'),
      context,
    );
  }

  await assert.rejects(
    setSpeciesEnabled(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
      market: 'ANIMAL_SALE',
      speciesCode: 'CAT',
      enabled: true,
      reasonFa: '   ',
      expectedVersion: row!.version,
    }),
    code('VALIDATION'),
    'a decision always carries a reason',
  );
});

test('opening a species bumps its version, keeps the reason and is audited', async () => {
  const before = (await marketSpecies(testDb.db, 'ANIMAL_SALE')).find((r) => r.speciesCode === 'CAT')!;
  const opened = await setSpeciesEnabled(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
    market: 'ANIMAL_SALE',
    speciesCode: 'CAT',
    enabled: true,
    reasonFa: 'SYNTHETIC مصوبه حقوقی آزمایشی',
    expectedVersion: before.version,
  });

  assert.equal(opened.enabled, true);
  assert.equal(opened.version, before.version + 1);
  assert.equal(opened.reasonFa, 'SYNTHETIC مصوبه حقوقی آزمایشی');
  assert.equal(await speciesEnabled(testDb.db, 'ANIMAL_SALE', 'CAT'), true);

  const events = await testDb.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, 'ANIMAL_SALE:CAT'));
  assert.equal(events.length, 1);
  assert.equal(events[0]!.action, 'MARKET_SPECIES_ENABLED');
  assert.equal(events[0]!.actorAccountId, accountId);
  assert.equal(events[0]!.reason, 'SYNTHETIC مصوبه حقوقی آزمایشی');
  assert.deepEqual(events[0]!.before, { enabled: false, version: before.version });

  // A second decision taken from the page that was open before this one is
  // refused rather than silently reversing what just happened.
  await assert.rejects(
    setSpeciesEnabled(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
      market: 'ANIMAL_SALE',
      speciesCode: 'CAT',
      enabled: false,
      reasonFa: 'SYNTHETIC از صفحه کهنه',
      expectedVersion: before.version,
    }),
    code('CONFLICT'),
  );

  // And setting it to what it already is is a mistake worth saying out loud.
  await assert.rejects(
    setSpeciesEnabled(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
      market: 'ANIMAL_SALE',
      speciesCode: 'CAT',
      enabled: true,
      reasonFa: 'SYNTHETIC دوباره',
      expectedVersion: opened.version,
    }),
    code('VALIDATION'),
  );

  // Put it back so the rest of the suite sees the launch state.
  await setSpeciesEnabled(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
    market: 'ANIMAL_SALE',
    speciesCode: 'CAT',
    enabled: false,
    reasonFa: 'SYNTHETIC بازگشت به وضعیت عرضه',
    expectedVersion: opened.version,
  });
  assert.equal(await speciesEnabled(testDb.db, 'ANIMAL_SALE', 'CAT'), false);
});

// ── kill switches ──────────────────────────────────────────────────────────

test('every kill switch starts closed and an unset one reads as closed too', async () => {
  const states = await flagStates(testDb.db);
  assert.equal(states.length, 6);
  assert.ok(states.every((flag) => flag.enabled === false), 'nothing is open before it is built');
  assert.ok(states.every((flag) => flag.configured), 'the seed wrote an explicit false');

  await assert.rejects(assertFlagEnabled(testDb.db, 'market.flag.commerce_checkout_enabled'), code('CONFLICT'));

  // Clearing a switch is not the same as opening it.
  await testDb.db
    .update(productSettings)
    .set({ value: null })
    .where(eq(productSettings.key, 'market.flag.promotion_enabled'));
  assert.equal(await flagEnabled(testDb.db, 'market.flag.promotion_enabled'), false);
  const cleared = (await flagStates(testDb.db)).find((f) => f.key === 'market.flag.promotion_enabled')!;
  assert.equal(cleared.enabled, false);
  assert.equal(cleared.configured, false);
});

test('opening a flow is a versioned, audited settings change that only the admins may make', async () => {
  const key = 'market.flag.animal_market_enabled';
  const before = await readSetting(testDb.db, key);

  for (const context of ['LISTING_MODERATOR', 'FINANCE_OPERATOR', 'SUPPORT_AGENT', 'DISPUTE_REVIEWER'] as const) {
    await assert.rejects(
      updateMarketSetting(testDb.db, actorFor(context), {
        key,
        value: true,
        reason: 'SYNTHETIC',
        expectedVersion: before.version,
      }),
      code('FORBIDDEN'),
      context,
    );
  }

  const opened = await updateMarketSetting(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
    key,
    value: true,
    reason: 'SYNTHETIC باز کردن آزمایشی',
    expectedVersion: before.version,
  });
  assert.equal(opened.value, true);
  assert.equal(opened.version, before.version + 1);
  assert.equal(await flagEnabled(testDb.db, key), true);
  await assertFlagEnabled(testDb.db, key);

  const history = await settingHistory(testDb.db, actorFor('MARKETPLACE_ADMIN'), key, { page: 1, pageSize: 10 });
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0]!.beforeValue, 'false');
  assert.equal(history.items[0]!.afterValue, 'true');
  assert.equal(history.items[0]!.reason, 'SYNTHETIC باز کردن آزمایشی');

  await updateMarketSetting(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
    key,
    value: false,
    reason: 'SYNTHETIC بستن دوباره',
    expectedVersion: opened.version,
  });
  assert.equal(await flagEnabled(testDb.db, key), false);
});

// ── managed values ─────────────────────────────────────────────────────────

test('a stale settings change never rewrites a newer one', async () => {
  const key = 'market.animal.request_payment_window_hours';
  const start = await readSetting(testDb.db, key);

  const first = await updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
    key,
    value: 48,
    reason: 'SYNTHETIC مهلت اول',
    expectedVersion: start.version,
  });

  await assert.rejects(
    updateMarketSetting(testDb.db, actorFor('MARKETPLACE_ADMIN'), {
      key,
      value: 12,
      reason: 'SYNTHETIC از صفحه کهنه',
      expectedVersion: start.version,
    }),
    code('CONFLICT'),
  );

  const current = await readSetting(testDb.db, key);
  assert.equal(current.value, 48, 'the newer decision survived');
  assert.equal(current.version, first.version);
});

test('a snapshot keeps the value it was taken with after the setting moves on', async () => {
  // This is the property every Phase 3 money path depends on: the deposit, the
  // commission and the order total are frozen at the moment they are charged,
  // and a later tariff edit must not rewrite what somebody already agreed to.
  const key = 'market.animal.commission_fixed_toman';
  const set = await updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
    key,
    value: '150000',
    reason: 'SYNTHETIC کارمزد اول',
    expectedVersion: (await readSetting(testDb.db, key)).version,
  });

  const frozen = await snapshotSetting(testDb.db, key);
  // Compared through String(): a seeded money value is stored as a JSON string
  // and an operator-written one as a JSON number, and `readMoney` normalises
  // both. The property under test is that the snapshot does not move.
  assert.equal(String(frozen.value), '150000');
  assert.equal(frozen.version, set.version);

  await updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
    key,
    value: '900000',
    reason: 'SYNTHETIC کارمزد دوم',
    expectedVersion: set.version,
  });

  // The record taken earlier still says what it said; only a new snapshot sees
  // the new figure, and the two versions differ so the difference is provable.
  assert.equal(String(frozen.value), '150000');
  assert.equal(frozen.version, set.version);
  const later = await snapshotSetting(testDb.db, key);
  assert.equal(String(later.value), '900000');
  assert.equal(later.version, set.version + 1);
  const money = await readMoney(testDb.db, key);
  assert.equal(money.configured && money.toman, 900000n);
});

test('a value is validated before it is stored, and only a marketplace value goes through this path', async () => {
  const key = 'market.animal.commission_percent_bp';
  const version = (await readSetting(testDb.db, key)).version;

  await assert.rejects(
    updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
      key,
      value: 20000,
      reason: 'SYNTHETIC خارج از بازه',
      expectedVersion: version,
    }),
    code('VALIDATION'),
    '200% is not a commission',
  );
  await assert.rejects(
    updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
      key,
      value: 250,
      reason: '   ',
      expectedVersion: version,
    }),
    code('VALIDATION'),
    'a change always carries a reason',
  );
  // A Phase 1 tariff is not reachable from the marketplace surface, even for
  // the superadmin: it belongs to the product settings panel and its own group.
  await assert.rejects(
    updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
      key: 'fee.membership_toman',
      value: '1',
      reason: 'SYNTHETIC',
      expectedVersion: 1,
    }),
    code('VALIDATION'),
  );
  await assert.rejects(
    updateMarketSetting(testDb.db, actorFor('SUPERADMIN'), {
      key: 'market.animal.nope',
      value: 1,
      reason: 'SYNTHETIC',
      expectedVersion: 1,
    }),
    code('NOT_FOUND'),
  );
});

test('each role sees the groups it may read and nothing else', async () => {
  const admin = await marketSettingGroups(testDb.db, actorFor('MARKETPLACE_ADMIN'));
  assert.deepEqual(
    admin.map((g) => g.group),
    ['MARKETPLACE_OPERATIONS', 'ANIMAL_MARKET', 'COMMERCE', 'SETTLEMENT'],
  );
  assert.deepEqual(
    admin.map((g) => g.writable),
    [true, true, true, false],
    'settlement is readable by the marketplace admin and written by the superadmin',
  );

  const finance = await marketSettingGroups(testDb.db, actorFor('FINANCE_OPERATOR'));
  assert.deepEqual(
    finance.map((g) => g.group),
    ['MARKETPLACE_OPERATIONS', 'SETTLEMENT'],
  );
  assert.ok(finance.every((g) => g.writable === false));

  const moderator = await marketSettingGroups(testDb.db, actorFor('LISTING_MODERATOR'));
  assert.deepEqual(
    moderator.map((g) => g.group),
    ['MARKETPLACE_OPERATIONS', 'ANIMAL_MARKET'],
  );

  // Asking for a group by name that this role may not read is refused, rather
  // than answered with an empty list that looks like "there is nothing there".
  await assert.rejects(
    marketSettingGroups(testDb.db, actorFor('LISTING_MODERATOR'), 'SETTLEMENT'),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    settingHistory(testDb.db, actorFor('LISTING_MODERATOR'), 'market.settlement.minimum_payout_toman', {
      page: 1,
      pageSize: 10,
    }),
    code('FORBIDDEN'),
  );
});

test('the animal market starts with every figure unset, so no flow can open on a guess', async () => {
  const [animal] = await marketSettingGroups(testDb.db, actorFor('MARKETPLACE_ADMIN'), 'ANIMAL_MARKET');
  const unsetKeys = animal!.settings.filter((s) => !s.configured).map((s) => s.key);
  // The two product decisions are set; everything about money and time is not,
  // except what this suite set itself above.
  assert.ok(unsetKeys.includes('market.animal.listing_publication_fee_toman'));
  assert.ok(unsetKeys.includes('market.animal.cancellation_policy_version'));
  assert.ok(!unsetKeys.includes('market.animal.min_handover_age_days'));
  assert.equal(animal!.settings.find((s) => s.key === 'market.animal.min_handover_age_days')!.value, 56);
  assert.equal(animal!.settings.find((s) => s.key === 'market.animal.min_listing_photos')!.value, 3);
});

// ── granting the roles ─────────────────────────────────────────────────────

test('marketplace roles are granted only in the superadmin shell, with a reason, and suspending keeps the row', async () => {
  for (const context of ['MARKETPLACE_ADMIN', 'ASSOCIATION_OPERATOR', 'USER'] as const) {
    await assert.rejects(
      setMarketplaceRole(testDb.db, actorFor(context), {
        mobile: holderMobile,
        role: 'LISTING_MODERATOR',
        active: true,
        reason: 'SYNTHETIC',
      }),
      code('FORBIDDEN'),
      context,
    );
  }

  const superadmin = actorFor('SUPERADMIN');
  await assert.rejects(
    setMarketplaceRole(testDb.db, superadmin, {
      mobile: holderMobile,
      role: 'AUTHOR',
      active: true,
      reason: 'SYNTHETIC',
    }),
    code('VALIDATION'),
    'a content role is not granted from the marketplace family',
  );
  await assert.rejects(
    setMarketplaceRole(testDb.db, superadmin, {
      mobile: holderMobile,
      role: 'LISTING_MODERATOR',
      active: true,
      reason: '  ',
    }),
    code('VALIDATION'),
  );
  await assert.rejects(
    setMarketplaceRole(testDb.db, superadmin, {
      mobile: '09999999999',
      role: 'LISTING_MODERATOR',
      active: true,
      reason: 'SYNTHETIC',
    }),
    code('NOT_FOUND'),
  );

  await setMarketplaceRole(testDb.db, superadmin, {
    mobile: holderMobile,
    role: 'LISTING_MODERATOR',
    active: true,
    reason: 'SYNTHETIC شروع همکاری',
  });
  let holders = await marketplaceRoleHolders(testDb.db, superadmin);
  assert.equal(holders.length, 1);
  assert.equal(holders[0]!.role, 'LISTING_MODERATOR');
  assert.equal(holders[0]!.status, 'ACTIVE');

  await setMarketplaceRole(testDb.db, superadmin, {
    mobile: holderMobile,
    role: 'LISTING_MODERATOR',
    active: false,
    reason: 'SYNTHETIC پایان همکاری',
  });
  holders = await marketplaceRoleHolders(testDb.db, superadmin);
  assert.equal(holders.length, 1, 'the row stays; the environment simply stops opening');
  assert.equal(holders[0]!.status, 'SUSPENDED');

  const granted = await testDb.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.action, 'MARKETPLACE_ROLE_GRANTED'));
  assert.equal(granted.length, 1);
  assert.equal(granted[0]!.reason, 'SYNTHETIC شروع همکاری');
});
