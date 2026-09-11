/**
 * Association and club rules without a database — Phase 2 PROMPT-010.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUNITY_KINDS,
  COMMUNITY_SCOPES,
  communityCompleteness,
  communityPublishBlockers,
  eventDateProblem,
  isCommunityKind,
  isCommunityScope,
  isUpcoming,
  postingProblem,
  publicRegistration,
  scopeProblem,
  type CommunityCompletenessInput,
} from '../../src/communities/model.ts';

const empty: CommunityCompletenessInput = {
  aboutFa: null,
  contact: null,
  membershipInfoFa: null,
  speciesCount: 0,
  breedCount: 0,
  acceptedManagers: 0,
  publishedEvents: 0,
  scopePlaceSet: false,
};

const full: CommunityCompletenessInput = {
  aboutFa: 'معرفی',
  contact: '02100000000',
  membershipInfoFa: 'شرایط عضویت',
  speciesCount: 1,
  breedCount: 0,
  acceptedManagers: 1,
  publishedEvents: 1,
  scopePlaceSet: true,
};

test('a scope that names a place or a breed must actually name one', () => {
  const base = { provinceCode: null, cityId: null, breedCount: 0 } as const;
  assert.equal(scopeProblem({ scope: 'NATIONAL', ...base }), null);
  assert.match(scopeProblem({ scope: 'PROVINCIAL', ...base }) ?? '', /استان/);
  assert.equal(scopeProblem({ scope: 'PROVINCIAL', ...base, provinceCode: 'tehran' }), null);
  assert.match(scopeProblem({ scope: 'CITY', ...base }) ?? '', /شهر/);
  assert.equal(scopeProblem({ scope: 'CITY', ...base, cityId: 'c1' }), null);
  assert.match(scopeProblem({ scope: 'BREED', ...base }) ?? '', /نژاد/);
  assert.equal(scopeProblem({ scope: 'BREED', ...base, breedCount: 1 }), null);
  assert.deepEqual([...COMMUNITY_KINDS], ['ASSOCIATION', 'CLUB']);
  assert.ok(isCommunityKind('CLUB') && !isCommunityKind('GUILD'));
  assert.ok(COMMUNITY_SCOPES.every((scope) => isCommunityScope(scope)));
});

test('only a club with the granted permission publishes its own posts', () => {
  assert.equal(postingProblem({ kind: 'CLUB', canPublishPosts: true }), null);
  assert.match(postingProblem({ kind: 'CLUB', canPublishPosts: false }) ?? '', /مجوز/);
  assert.match(postingProblem({ kind: 'ASSOCIATION', canPublishPosts: true }) ?? '', /فقط کلاب/);
});

test('an event keeps the dates it was given, and its last day decides whether it is upcoming', () => {
  assert.equal(eventDateProblem('2026-03-21', null), null);
  assert.equal(eventDateProblem('2026-03-21', '2026-03-23'), null);
  assert.match(eventDateProblem(null, null) ?? '', /تاریخ شروع/);
  assert.match(eventDateProblem('1405-01-01', null) ?? '', /معتبر نیست/);
  assert.match(eventDateProblem('21-03-2026', null) ?? '', /تاریخ شروع/);
  assert.match(eventDateProblem('2026-03-21', '2026-03-20') ?? '', /پیش از تاریخ شروع/);
  assert.ok(isUpcoming({ startsOn: '2026-03-21', endsOn: null }, '2026-03-21'));
  assert.ok(isUpcoming({ startsOn: '2026-03-21', endsOn: '2026-03-23' }, '2026-03-22'));
  assert.ok(!isUpcoming({ startsOn: '2026-03-21', endsOn: null }, '2026-03-22'));
});

test('completeness counts what the profile says; publishing needs an introduction and a contact', () => {
  const none = communityCompleteness(empty);
  assert.equal(none.total, 7);
  assert.equal(none.done, 0);
  assert.deepEqual(communityCompleteness(full), { done: 7, total: 7, missing: [], complete: true });
  assert.deepEqual(communityCompleteness({ ...full, acceptedManagers: 0 }).missing, ['دست‌کم یک مدیر تأییدشده']);

  assert.equal(communityPublishBlockers(empty).length, 2);
  assert.deepEqual(communityPublishBlockers({ ...empty, aboutFa: 'معرفی', contact: 'info@example.org' }), []);
  // Completeness stays its own axis: a publishable community can still be incomplete.
  assert.equal(communityCompleteness({ ...empty, aboutFa: 'معرفی', contact: '021' }).complete, false);
});

test('a registration is shown only as it was recorded', () => {
  assert.equal(publicRegistration('NONE', null), null);
  assert.deepEqual(publicRegistration('VALID', ' 12-34 '), { statusFa: 'معتبر', number: '12-34' });
  assert.deepEqual(publicRegistration('EXPIRED', null), { statusFa: 'منقضی', number: null });
  assert.deepEqual(publicRegistration('NONE', 'A-1'), { statusFa: 'ثبت‌نشده', number: 'A-1' });
});
