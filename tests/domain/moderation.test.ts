import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockedByRestriction,
  isRestrictionActive,
  reportInputProblems,
  reportStatusFor,
  restrictionEndProblem,
  REPORT_DETAILS_MAX,
} from '../../src/moderation/model.ts';

const NOW = new Date('2026-09-12T10:00:00Z');
const HOUR = 60 * 60 * 1000;

test('a report names a known reason, explains “other”, and stays within its length', () => {
  assert.deepEqual(reportInputProblems({ reason: 'SPAM', details: null }), []);
  assert.deepEqual(reportInputProblems({ reason: 'INCORRECT_INFO', details: '  ' }), []);
  assert.equal(reportInputProblems({ reason: 'MADE_UP', details: null }).length, 1);
  assert.equal(reportInputProblems({ reason: 'OTHER', details: ' ' }).length, 1);
  assert.deepEqual(reportInputProblems({ reason: 'OTHER', details: 'توضیح' }), []);
  assert.equal(reportInputProblems({ reason: 'SPAM', details: 'x'.repeat(REPORT_DETAILS_MAX + 1) }).length, 1);
});

test('dismissing closes reports as unfounded; every other decision as acted upon', () => {
  assert.equal(reportStatusFor('DISMISS'), 'DISMISSED');
  for (const decision of ['REQUEST_CORRECTION', 'HIDE', 'SOFT_DELETE', 'RESTRICT_PUBLISHER'] as const) {
    assert.equal(reportStatusFor(decision), 'ACTIONED', decision);
  }
});

test('a restriction is in force from its start until its end or until lifted, decided at read time', () => {
  const started = new Date(NOW.getTime() - HOUR);
  assert.ok(isRestrictionActive({ startsAt: started, endsAt: null, liftedAt: null }, NOW));
  assert.ok(isRestrictionActive({ startsAt: started, endsAt: new Date(NOW.getTime() + HOUR), liftedAt: null }, NOW));
  assert.ok(!isRestrictionActive({ startsAt: started, endsAt: NOW, liftedAt: null }, NOW), 'ends exactly now');
  assert.ok(!isRestrictionActive({ startsAt: started, endsAt: null, liftedAt: NOW }, NOW), 'lifted');
  assert.ok(!isRestrictionActive({ startsAt: new Date(NOW.getTime() + HOUR), endsAt: null, liftedAt: null }, NOW), 'not started');

  assert.equal(restrictionEndProblem(null, NOW), null);
  assert.equal(restrictionEndProblem(new Date(NOW.getTime() + HOUR), NOW), null);
  assert.ok(restrictionEndProblem(NOW, NOW));
  assert.ok(restrictionEndProblem(new Date('invalid'), NOW));
});

test('a restriction stops publishing and changes to public content, not work on drafts', () => {
  for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'HIDDEN'] as const) {
    assert.equal(blockedByRestriction('PUBLISH', status), true, status);
  }
  assert.equal(blockedByRestriction('EDIT', 'DRAFT'), false);
  assert.equal(blockedByRestriction('EDIT', 'PUBLISHED'), true);
  assert.equal(blockedByRestriction('EDIT', 'ARCHIVED'), true);
});
