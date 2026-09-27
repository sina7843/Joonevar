/**
 * Finder operations rules — PHASE-4 PROMPT-007, pure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTOR_CONTEXTS } from '../../src/authz/actor.ts';
import { finderCapabilitiesOf } from '../../src/finder/model.ts';
import { ACTIONS_FOR, appealProblem, CATEGORY_FA, decisionProblem, FINDER_REPORT_CATEGORIES, REASON_FOR } from '../../src/finder/reports-model.ts';
import { channelsFor, renderSms } from '../../src/notifications/templates.ts';

test('every category the spec names exists, has a label and a generic reason', () => {
  for (const c of ['FALSE_ANIMAL_DATA', 'INVALID_CHIP_CLAIM', 'HARASSMENT', 'CONTRACT_BREACH', 'UNAUTHORIZED_BROKERAGE', 'CROSS_BREED_REQUEST', 'ANIMAL_ABUSE', 'OTHER_POLICY']) {
    assert.ok((FINDER_REPORT_CATEGORIES as readonly string[]).includes(c), c);
  }
  for (const c of FINDER_REPORT_CATEGORIES) assert.ok(CATEGORY_FA[c] && REASON_FOR[c], c);
});

test('a decision needs the holder, an allowed action for the target, and a reason', () => {
  const ok = { targetKind: 'FINDER_MESSAGE', action: 'HIDE_MESSAGE', reasonFa: 'دلیل کافی است', status: 'OPEN', assignedTo: 'm1', actorId: 'm1' };
  assert.equal(decisionProblem(ok), null);
  assert.ok(decisionProblem({ ...ok, assignedTo: null }));
  assert.ok(decisionProblem({ ...ok, assignedTo: 'm2' }));
  assert.ok(decisionProblem({ ...ok, status: 'ACTIONED' }));
  assert.ok(decisionProblem({ ...ok, action: 'UNLIST_PROFILE' }), 'a message cannot unlist a profile');
  assert.ok(decisionProblem({ ...ok, reasonFa: 'کم' }));
  // No target offers a sanction: those are superadmin actions with their own screen.
  for (const actions of Object.values(ACTIONS_FOR)) assert.ok(!actions.some((a) => /SUSPEND|RESTRICT|REFUND/.test(a)));
});

test('an appeal is decided by someone other than the first decider', () => {
  assert.ok(appealProblem({ reportDecidedBy: 'm1', actorId: 'm1', status: 'OPEN', reasonFa: 'بررسی دوباره' }));
  assert.equal(appealProblem({ reportDecidedBy: 'm1', actorId: 'm2', status: 'OPEN', reasonFa: 'بررسی دوباره' }), null);
  assert.ok(appealProblem({ reportDecidedBy: 'm1', actorId: 'm2', status: 'UPHELD', reasonFa: 'بررسی دوباره' }));
});

test('least privilege: sanctions and account restriction are the superadmin\'s; feedback and the queue are different people', () => {
  for (const context of ACTOR_CONTEXTS) {
    const caps = finderCapabilitiesOf(context);
    if (context !== 'SUPERADMIN') {
      assert.ok(!caps.includes('FINDER_ACCESS_SUSPEND') && !caps.includes('FINDER_ACCOUNT_RESTRICT'), context);
      assert.ok(!(caps.includes('FINDER_REPORT_MODERATE') && caps.includes('FINDER_FEEDBACK_VIEW')), context + ' holds both');
    }
  }
  assert.ok(finderCapabilitiesOf('LISTING_MODERATOR').includes('FINDER_REPORT_MODERATE'));
  assert.ok(finderCapabilitiesOf('DISPUTE_REVIEWER').includes('FINDER_FEEDBACK_VIEW'));
});

test('the finder SMS catalogue covers the events the prompt names, with no record in any sentence', () => {
  for (const kind of [
    'FINDER_REQUEST_RECEIVED',
    'FINDER_REQUEST_ANSWERED',
    'FINDER_MESSAGE_POSTED',
    'FINDER_CONTRACT_READY',
    'FINDER_CONTRACT_CHANGED',
    'FINDER_CONTRACT_CONFIRMED',
    'FINDER_REQUEST_CANCELLED',
    'FINDER_CONTRACT_CANCELLED',
    'FINDER_REQUEST_EXPIRING',
    'FINDER_WINDOW_APPROACHING',
    'MATING_DATE_DECLARED',
    'MATING_DATE_CONFLICT',
    'FINDER_SAVED_SEARCH_MATCH',
  ]) {
    assert.deepEqual(channelsFor(kind, { smsEnabled: true }), ['IN_APP', 'SMS'], kind);
    assert.ok(!/[0-9۰-۹{}$]/.test(renderSms(kind) ?? 'x0'), kind);
  }
  assert.deepEqual(channelsFor('FINDER_MODERATION_DECISION', { smsEnabled: true }), ['IN_APP']);
});
