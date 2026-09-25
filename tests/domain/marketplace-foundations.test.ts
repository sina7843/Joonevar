/**
 * Phase 3 foundations — the rules that hold without a database (PROMPT-002).
 *
 * What is worth pinning here is not that the lists exist but that they agree
 * with each other: a capability granted in one place and denied in another is
 * the failure mode that turns least privilege into a comment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMarketplaceCapability,
  capabilitiesOf,
  hasMarketplaceCapability,
  MARKETPLACE_CAPABILITIES,
  MARKETPLACE_CONTEXTS,
  MARKET_FLAGS,
  MARKET_FLAG_KEYS,
  marketFlag,
  SELLER_KINDS,
  sellerKindsOf,
} from '../../src/marketplace/model.ts';
import { MARKET_SETTING_GROUPS } from '../../src/marketplace/operations.ts';
import { MARKETPLACE_ROLES } from '../../src/marketplace/roles.ts';
import { ACCOUNT_ROLES, ACTOR_CONTEXTS, OPERATIONAL_CONTEXTS, switchableContexts } from '../../src/authz/actor.ts';
import { canReadSettingGroup, canWriteSettingGroup, SETTING_GROUPS } from '../../src/authz/policy.ts';
import { SETTING_BY_KEY, SETTING_DEFINITIONS } from '../../src/settings/keys.ts';
import { accessForRoute } from '../../src/authz/routes.ts';
import type { Actor, ActorContextName } from '../../src/authz/actor.ts';
import type { AccountId } from '../../src/domain/ids.ts';

const actorIn = (context: ActorContextName): Actor => ({
  accountId: '00000000-0000-4000-8000-000000000001' as AccountId,
  context,
  activeRoles: [],
});

test('the six marketplace roles exist as roles, as contexts and as operational shells', () => {
  for (const role of MARKETPLACE_ROLES) {
    assert.ok(ACCOUNT_ROLES.includes(role), role + ' must be grantable');
    assert.ok((ACTOR_CONTEXTS as readonly string[]).includes(role), role + ' must be an actor context');
    assert.ok(OPERATIONAL_CONTEXTS.includes(role), role + ' must be an operational shell');
  }
  // D11: an operational shell is reached by its own address and never offered
  // as a chip in the public role switcher, however many roles the account has.
  assert.deepEqual(switchableContexts([...MARKETPLACE_ROLES]), ['USER']);
});

test('the marketplace shell opens for the six roles and the superadmin, and for nobody else', () => {
  const access = accessForRoute('/market/settings');
  assert.notEqual(access, 'PUBLIC');
  const allowed = access as readonly ActorContextName[];
  assert.deepEqual([...allowed].sort(), ['SUPERADMIN', ...MARKETPLACE_ROLES].sort());
  for (const context of ['USER', 'BREEDER', 'TRUSTED_VET', 'AUTHOR', 'CONTENT_ADMIN'] as const) {
    assert.ok(!allowed.includes(context), context + ' must not reach the marketplace shell');
  }
});

test('holding the shell is not holding the capability', () => {
  // The whole point of the arrangement: every one of the six opens /market, and
  // what they may do once inside is completely different.
  for (const context of MARKETPLACE_CONTEXTS) {
    assert.ok(hasMarketplaceCapability(actorIn(context), 'MARKET_OVERVIEW_VIEW'));
  }
  assert.ok(!hasMarketplaceCapability(actorIn('LISTING_MODERATOR'), 'MARKET_SETTINGS_WRITE'));
  assert.ok(!hasMarketplaceCapability(actorIn('SELLER_REVIEWER'), 'ANIMAL_LISTING_MODERATE'));
  assert.ok(!hasMarketplaceCapability(actorIn('DISPUTE_REVIEWER'), 'REFUND_ISSUE'));
  assert.throws(() => assertMarketplaceCapability(actorIn('SUPPORT_AGENT'), 'REFUND_ISSUE'), /مجاز نیست/);
});

test('money stays with finance, and support can only read', () => {
  const money = ['REFUND_ISSUE', 'SETTLEMENT_RUN', 'LEDGER_VIEW'] as const;
  for (const capability of money) {
    const holders = MARKETPLACE_CONTEXTS.filter((c) => capabilitiesOf(c).includes(capability));
    assert.deepEqual(holders, ['FINANCE_OPERATOR'], capability + ' must belong to finance alone');
  }
  // Being the marketplace admin does not quietly include moving money.
  for (const capability of money) {
    assert.ok(!capabilitiesOf('MARKETPLACE_ADMIN').includes(capability));
  }
  assert.deepEqual(capabilitiesOf('SUPPORT_AGENT'), ['MARKET_OVERVIEW_VIEW', 'ORDER_VIEW']);
});

test('only the superadmin holds every capability', () => {
  assert.deepEqual([...capabilitiesOf('SUPERADMIN')], [...MARKETPLACE_CAPABILITIES]);
  for (const context of MARKETPLACE_CONTEXTS) {
    assert.ok(
      capabilitiesOf(context).length < MARKETPLACE_CAPABILITIES.length,
      context + ' must not hold every capability',
    );
  }
  // A context outside the marketplace holds none of them at all.
  for (const context of ['USER', 'ASSOCIATION_OPERATOR', 'CONTENT_ADMIN'] as const) {
    assert.deepEqual(capabilitiesOf(context), []);
  }
});

test('the settings-write capability and the group permission agree', () => {
  // Two gates guard a marketplace value: the capability and the group. They are
  // kept in step by this test rather than by one calling the other, so a role
  // added to only one of them fails here instead of in production.
  for (const context of ACTOR_CONTEXTS) {
    const byCapability = capabilitiesOf(context).includes('MARKET_SETTINGS_WRITE');
    const byGroup = MARKET_SETTING_GROUPS.some((group) => canWriteSettingGroup(actorIn(context), group));
    assert.equal(byCapability, byGroup, context + ' must agree between capability and settings group');
  }
});

test('every marketplace group can be read by somebody who cannot write it', () => {
  for (const group of MARKET_SETTING_GROUPS) {
    const readers = ACTOR_CONTEXTS.filter((c) => canReadSettingGroup(actorIn(c), group));
    const writers = ACTOR_CONTEXTS.filter((c) => canWriteSettingGroup(actorIn(c), group));
    assert.ok(readers.length > writers.length, group + ' should be readable more widely than it is writable');
    for (const writer of writers) assert.ok(readers.includes(writer), writer + ' must read what it writes');
  }
  // Settlement figures decide when somebody else's money moves: the operator
  // who runs settlement reads them and does not set them.
  assert.ok(canReadSettingGroup(actorIn('FINANCE_OPERATOR'), 'SETTLEMENT'));
  assert.ok(!canWriteSettingGroup(actorIn('FINANCE_OPERATOR'), 'SETTLEMENT'));
});

test('every kill switch is a real BOOL setting that starts closed', () => {
  assert.equal(MARKET_FLAGS.length, 6);
  for (const flag of MARKET_FLAGS) {
    const definition = SETTING_BY_KEY.get(flag.key);
    assert.ok(definition, flag.key + ' must exist in the settings catalogue');
    assert.equal(definition!.kind, 'BOOL');
    assert.equal(definition!.group, 'MARKETPLACE_OPERATIONS');
    assert.equal(definition!.seedValue, false, flag.key + ' must start closed');
    assert.ok(flag.closedFa.length > 0, flag.key + ' must say why it is closed');
  }
  assert.equal(new Set(MARKET_FLAG_KEYS).size, MARKET_FLAG_KEYS.length);
  assert.equal(marketFlag('market.flag.nope'), null);
});

test('no Phase 3 tariff, deadline or policy is invented', () => {
  const phase3 = SETTING_DEFINITIONS.filter((d) =>
    (['ANIMAL_MARKET', 'COMMERCE', 'SETTLEMENT'] as readonly string[]).includes(d.group),
  );
  assert.ok(phase3.length >= 30, 'the foundations should cover the values the phase needs');

  /*
   * Exactly two product figures carry a number, and both are written down in
   * PRODUCT_DECISIONS: the eight-week handover age and the three mandatory
   * photos. No tariff, deadline or policy of the phase is among them.
   */
  const productSeeded = phase3
    .filter((d) => d.seedValue !== null && d.source === 'PRODUCT_DECISION')
    .map((d) => d.key)
    .sort();
  assert.deepEqual(productSeeded, ['market.animal.min_handover_age_days', 'market.animal.min_listing_photos']);
  assert.equal(SETTING_BY_KEY.get('market.animal.min_handover_age_days')!.seedValue, 56);
  assert.equal(SETTING_BY_KEY.get('market.animal.min_listing_photos')!.seedValue, 3);

  /*
   * The only other seeded values are the handover code's safety limits and the
   * version of the statement text that ships in the code (PROMPT-007). They are
   * technical defaults of the same kind the one-time login code has (DEC-0006):
   * none of them is money, a deadline somebody owes, or a policy document.
   */
  const technicalSeeded = phase3
    .filter((d) => d.seedValue !== null && d.source === 'TECHNICAL_DEFAULT')
    .map((d) => d.key)
    .sort();
  assert.deepEqual(technicalSeeded, [
    'market.animal.handover_code_lock_minutes',
    'market.animal.handover_code_max_attempts',
    'market.animal.handover_code_max_issues',
    'market.animal.handover_code_minutes',
    'market.animal.handover_statement_version',
  ]);
  for (const key of technicalSeeded) {
    assert.ok(!key.includes('_toman'), key + ' must not be money');
    assert.ok(!key.includes('_bp'), key + ' must not be a rate');
  }
  // The policy version a deal is bound to is still unset: that one names an
  // external document nobody has supplied.
  assert.equal(SETTING_BY_KEY.get('market.animal.cancellation_policy_version')!.seedValue, null);

  // Everything else is operational data with no value, so the flow that needs
  // it stays closed instead of running on a guess.
  for (const definition of phase3.filter((d) => d.seedValue === null)) {
    assert.equal(definition.source, 'OPERATIONAL_DATA', definition.key + ' must be operational data');
  }
});

test('the percentage inputs are whole basis points, so no money rule runs on a float', () => {
  for (const key of [
    'market.animal.commission_percent_bp',
    'market.animal.buyer_cancellation_penalty_bp',
    'market.shop.commission_percent_bp',
  ]) {
    const definition = SETTING_BY_KEY.get(key);
    assert.ok(definition, key + ' must exist');
    assert.equal(definition!.kind, 'INT');
    assert.equal(definition!.min, 0);
    assert.equal(definition!.max, 10000);
  }
});

test('the settings catalogue has no duplicate key and every group is a real group', () => {
  const keys = SETTING_DEFINITIONS.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const definition of SETTING_DEFINITIONS) {
    assert.ok((SETTING_GROUPS as readonly string[]).includes(definition.group), definition.key);
  }
});

test('seller kinds are a closed list with the conditions each one has to meet', () => {
  assert.deepEqual(
    sellerKindsOf('ANIMAL_SALE').map((k) => k.kind),
    ['OWNER', 'KENNEL'],
  );
  assert.deepEqual(
    sellerKindsOf('MERCHANDISE').map((k) => k.kind),
    ['PET_SHOP', 'BUSINESS'],
  );
  // Every seller of either market is a KYC'd account: that is the one condition
  // no kind escapes, and an animal owner additionally needs a live membership.
  for (const kind of SELLER_KINDS) {
    assert.ok((kind.requires as readonly string[]).includes('KYC_APPROVED'), kind.kind);
  }
  const owner = SELLER_KINDS.find((k) => k.kind === 'OWNER')!;
  assert.ok((owner.requires as readonly string[]).includes('VALID_ASSOCIATION_MEMBERSHIP'));
  const kennel = SELLER_KINDS.find((k) => k.kind === 'KENNEL')!;
  assert.ok((kennel.requires as readonly string[]).includes('KENNEL_APPROVED_AND_ACTIVE'));
});
