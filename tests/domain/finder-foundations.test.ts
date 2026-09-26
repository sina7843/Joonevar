/**
 * Phase 4 finder foundations, pure rules — PROMPT-002.
 *
 * The access matrix, capacity, standing and plan-sale rules decide who sees
 * whom and who pays for what, so each branch is pinned here without a database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  BASELINE_RULES,
  capacityOf,
  capacityProblem,
  FINDER_CAPABILITIES,
  FINDER_FLAGS,
  finderCapabilitiesOf,
  pairProblem,
  planPurchaseProblem,
  profileVisible,
  ruleProblem,
  standingAt,
  type PaidPeriod,
} from '../../src/finder/model.ts';
import { ACTOR_CONTEXTS } from '../../src/authz/actor.ts';
import { canReadSettingGroup, canWriteSettingGroup } from '../../src/authz/policy.ts';
import { SETTING_BY_KEY, SETTING_DEFINITIONS } from '../../src/settings/keys.ts';

const at = (iso: string) => new Date(iso);
const actor = (context: (typeof ACTOR_CONTEXTS)[number]) => ({ accountId: 'a' as never, context, activeRoles: [] });

test('months are added on the calendar and clamp to the end of a short month', () => {
  assert.equal(addMonths(at('2027-01-31T10:00:00Z'), 1).toISOString(), '2027-02-28T10:00:00.000Z');
  assert.equal(addMonths(at('2028-01-31T10:00:00Z'), 1).toISOString(), '2028-02-29T10:00:00.000Z');
  assert.equal(addMonths(at('2027-11-15T00:00:00Z'), 3).toISOString(), '2028-02-15T00:00:00.000Z');
  assert.equal(addMonths(at('2027-03-31T00:00:00Z'), 12).toISOString(), '2028-03-31T00:00:00.000Z');
  assert.throws(() => addMonths(at('2027-01-01T00:00:00Z'), 0));
});

test('a plan is sold only while published, priced and inside its window', () => {
  const now = at('2027-06-01T00:00:00Z');
  const base = { status: 'PUBLISHED' as const, priceToman: 100_000n, purchasableFrom: null, purchasableUntil: null };
  assert.equal(planPurchaseProblem(base, now), null);
  assert.match(planPurchaseProblem({ ...base, priceToman: null }, now)!, /قیمت/);
  assert.match(planPurchaseProblem({ ...base, status: 'ARCHIVED' }, now)!, /دیگر فروخته نمی‌شود/);
  assert.match(planPurchaseProblem({ ...base, purchasableFrom: at('2027-07-01T00:00:00Z') }, now)!, /شروع نشده/);
  assert.match(planPurchaseProblem({ ...base, purchasableUntil: now }, now)!, /تمام شده/);
});

const period = (startsAt: string, endsAt: string, capacity = 3): PaidPeriod => ({
  audience: 'OWNER',
  activeAnimalCapacity: capacity,
  startsAt: at(startsAt),
  endsAt: at(endsAt),
});

test('standing is read from the periods: none, active, expired, with an exclusive end', () => {
  assert.equal(standingAt([], at('2027-01-01T00:00:00Z')).state, 'NONE');
  const periods = [period('2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z'), period('2027-02-01T00:00:00Z', '2027-05-01T00:00:00Z', 5)];
  const inFirst = standingAt(periods, at('2027-01-15T00:00:00Z'));
  assert.equal(inFirst.state, 'ACTIVE');
  assert.equal(inFirst.current?.activeAnimalCapacity, 3);
  assert.equal(inFirst.chainEndsAt?.toISOString(), '2027-05-01T00:00:00.000Z');
  // At exactly the join the renewal is the one in force.
  assert.equal(standingAt(periods, at('2027-02-01T00:00:00Z')).current?.activeAnimalCapacity, 5);
  assert.equal(standingAt(periods, at('2027-05-01T00:00:00Z')).state, 'EXPIRED');
});

test('capacity comes from the live plan, and an expired plan falls back to the free figure, never to no limit', () => {
  const live = standingAt([period('2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z', 3)], at('2027-01-10T00:00:00Z'));
  assert.deepEqual(capacityOf(live, 1), { limit: 3, source: 'PLAN', audience: 'OWNER' });
  const expired = standingAt([period('2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z', 3)], at('2027-03-01T00:00:00Z'));
  assert.deepEqual(capacityOf(expired, 1), { limit: 1, source: 'FREE', audience: null });
  const unset = capacityOf(expired, null);
  assert.equal(unset.limit, null);
  assert.match(capacityProblem(unset, 0)!, /تعیین نشده/);
  assert.equal(capacityProblem({ limit: 3, source: 'PLAN', audience: 'OWNER' }, 2), null);
  assert.match(capacityProblem({ limit: 3, source: 'PLAN', audience: 'OWNER' }, 3)!, /پر است/);
  assert.match(capacityProblem({ limit: 1, source: 'FREE', audience: null }, 1)!, /اشتراک/);
});

test('the visibility matrix: subscribed owners are public, free owners only to subscribers while the pool is open', () => {
  const cases: Array<[Parameters<typeof profileVisible>[0], boolean]> = [
    [{ viewerIsOwner: false, ownerSubscribed: true, viewerSubscribed: false, freePoolOpen: false }, true],
    [{ viewerIsOwner: false, ownerSubscribed: false, viewerSubscribed: false, freePoolOpen: true }, false],
    [{ viewerIsOwner: false, ownerSubscribed: false, viewerSubscribed: true, freePoolOpen: true }, true],
    [{ viewerIsOwner: false, ownerSubscribed: false, viewerSubscribed: true, freePoolOpen: false }, false],
    [{ viewerIsOwner: true, ownerSubscribed: false, viewerSubscribed: false, freePoolOpen: false }, true],
  ];
  for (const [facts, expected] of cases) assert.equal(profileVisible(facts), expected, JSON.stringify(facts));
});

test('a pair needs both identities approved and at least one subscription', () => {
  const ok = { senderKycApproved: true, receiverKycApproved: true, senderSubscribed: false, receiverSubscribed: true };
  assert.equal(pairProblem(ok), null, 'a free user may request a subscriber');
  assert.equal(pairProblem({ ...ok, senderSubscribed: true, receiverSubscribed: false }), null);
  assert.match(pairProblem({ ...ok, receiverSubscribed: false })!, /دست‌کم یکی/, 'free to free is refused');
  assert.match(pairProblem({ ...ok, senderKycApproved: false })!, /احراز هویت شما/);
  assert.match(pairProblem({ ...ok, receiverKycApproved: false })!, /مالک حیوان مقابل/);
});

test('a breed rule states its cooldown in days or months, and its ages in order', () => {
  const rule = { minAgeMonths: 12, maxAgeMonths: 96, cooldownDays: 14, cooldownMonths: null, kinshipMaxDegree: 2 };
  assert.equal(ruleProblem(rule), null);
  assert.ok(ruleProblem({ ...rule, cooldownMonths: 6 }), 'both units at once');
  assert.ok(ruleProblem({ ...rule, cooldownDays: null }), 'neither unit');
  assert.ok(ruleProblem({ ...rule, minAgeMonths: 100 }), 'min above max');
  assert.ok(ruleProblem({ ...rule, kinshipMaxDegree: 7 }), 'kinship degree out of range');
  assert.ok(ruleProblem({ ...rule, cooldownDays: -1 }));
  assert.deepEqual(
    BASELINE_RULES.map((r) => [r.sex, r.cooldownDays, r.cooldownMonths]),
    [
      ['MALE', 14, null],
      ['FEMALE', null, 6],
    ],
    'the confirmed baseline is male 14 days, female 6 months',
  );
});

test('configuration is the superadmin’s alone, and no capability reads a chat or a contract body', () => {
  const writers = ACTOR_CONTEXTS.filter((c) => finderCapabilitiesOf(c).includes('FINDER_CONFIG_WRITE'));
  assert.deepEqual(writers, ['SUPERADMIN']);
  for (const context of ACTOR_CONTEXTS) {
    if (context === 'SUPERADMIN') continue;
    assert.ok(finderCapabilitiesOf(context).length <= 3, context + ' holds too much');
  }
  assert.ok(FINDER_CAPABILITIES.every((c) => !/CHAT|MESSAGE|BODY|CONTRACT_READ/.test(c)));
  assert.deepEqual(finderCapabilitiesOf('USER'), []);
  assert.ok(!finderCapabilitiesOf('MARKETPLACE_ADMIN').includes('FINDER_ACCESS_SUSPEND'));
  assert.ok(canWriteSettingGroup(actor('SUPERADMIN'), 'MATING_FINDER'));
  assert.ok(!canWriteSettingGroup(actor('MARKETPLACE_ADMIN'), 'MATING_FINDER'));
  assert.ok(canReadSettingGroup(actor('SUPPORT_AGENT'), 'MATING_FINDER'));
  assert.ok(!canReadSettingGroup(actor('USER'), 'MATING_FINDER'));
});

test('every kill switch is a managed BOOL that starts closed, and no price or capacity is seeded', () => {
  assert.equal(FINDER_FLAGS.length, 9);
  for (const flag of FINDER_FLAGS) {
    const definition = SETTING_BY_KEY.get(flag.key);
    assert.equal(definition?.kind, 'BOOL', flag.key);
    assert.equal(definition?.group, 'MATING_FINDER');
    assert.equal(definition?.seedValue, false, flag.key + ' must start closed');
  }
  const finder = SETTING_DEFINITIONS.filter((d) => d.group === 'MATING_FINDER');
  assert.ok(finder.every((d) => d.kind !== 'MONEY_TOMAN'), 'plan prices live on plan versions, never as a seeded setting');
  assert.equal(SETTING_BY_KEY.get('finder.capacity.free_owner')?.seedValue, null);
  assert.equal(SETTING_BY_KEY.get('finder.request.expiry_days')?.seedValue, 7);
});
