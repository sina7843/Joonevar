/**
 * Centre rules without a database — Phase 2 PROMPT-008.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  centreCompleteness,
  centrePublishBlockers,
  hoursProblem,
  isCentreStatus,
  isLicenceStatus,
  parseClock,
  publicLicence,
  type CentreCompletenessInput,
} from '../../src/centres/model.ts';

const empty: CentreCompletenessInput = {
  aboutFa: null,
  phone: null,
  serviceCount: 0,
  speciesCount: 0,
  facilityCount: 0,
  publicBranchesWithCity: 0,
  branchesWithHours: 0,
  acceptedMembers: 0,
  licenceRecorded: false,
};

const full: CentreCompletenessInput = {
  aboutFa: 'معرفی',
  phone: '02100000000',
  serviceCount: 2,
  speciesCount: 1,
  facilityCount: 1,
  publicBranchesWithCity: 1,
  branchesWithHours: 1,
  acceptedMembers: 1,
  licenceRecorded: true,
};

test('an announced time is read whatever digits it is typed with, and a broken one is refused', () => {
  assert.equal(parseClock('۰۹:۳۰'), '09:30');
  assert.equal(parseClock('9:5'), '09:05');
  assert.equal(parseClock('21.00'), '21:00');
  assert.equal(parseClock('  '), null);
  assert.equal(parseClock(null), null);
  for (const bad of ['24:00', '09:60', 'صبح', '0930']) assert.throws(() => parseClock(bad), /BAD_CLOCK/, bad);
});

test('a weekday is either fully announced or not announced at all', () => {
  assert.equal(hoursProblem({ weekday: 0, opensAt: null, closesAt: null }), null);
  assert.equal(hoursProblem({ weekday: 0, opensAt: '09:00', closesAt: '17:00' }), null);
  assert.match(hoursProblem({ weekday: 1, opensAt: '09:00', closesAt: null }) ?? '', /با هم/);
  assert.match(hoursProblem({ weekday: 2, opensAt: '18:00', closesAt: '09:00' }) ?? '', /بعد از/);
  assert.match(hoursProblem({ weekday: 9, opensAt: null, closesAt: null }) ?? '', /روز هفته/);
});

test('completeness counts what the centre says and names what is missing', () => {
  const none = centreCompleteness(empty);
  assert.equal(none.done, 0);
  assert.equal(none.total, 9);
  assert.equal(none.complete, false);
  assert.deepEqual(centreCompleteness(full), { done: 9, total: 9, missing: [], complete: true });
  assert.deepEqual(centreCompleteness({ ...full, acceptedMembers: 0 }).missing, ['دست‌کم یک عضو حرفه‌ای تأییدشده']);
  // A 24-hour branch announces its hours by being open around the clock.
  assert.equal(centreCompleteness({ ...full, branchesWithHours: 0 }).complete, false);
});

test('publishing needs a description and a public branch, or a city for an unowned suggestion', () => {
  assert.equal(centrePublishBlockers(empty).length, 2);
  assert.deepEqual(centrePublishBlockers({ ...empty, aboutFa: 'معرفی', publicBranchesWithCity: 1 }), []);
  assert.deepEqual(centrePublishBlockers(empty, { owned: false, hasListedCity: true }), []);
  assert.equal(centrePublishBlockers(empty, { owned: false, hasListedCity: false }).length, 1);
  // A branch with a city says where it is just as well as a recorded city.
  assert.deepEqual(centrePublishBlockers({ ...empty, publicBranchesWithCity: 1 }, { owned: false, hasListedCity: false }), []);
  // Completeness is a separate axis: an incomplete centre with the essentials may be published.
  assert.equal(centreCompleteness({ ...empty, aboutFa: 'معرفی', publicBranchesWithCity: 1 }).complete, false);
});

test('a licence is shown only as it was recorded', () => {
  assert.equal(publicLicence('NONE', null), null);
  assert.deepEqual(publicLicence('NONE', ' 12-34 '), { statusFa: 'ثبت‌نشده', number: '12-34' });
  assert.deepEqual(publicLicence('VALID', 'SYN-1'), { statusFa: 'معتبر', number: 'SYN-1' });
  assert.deepEqual(publicLicence('REVOKED', null), { statusFa: 'باطل‌شده', number: null });
  for (const value of ['DRAFT', 'PUBLISHED', 'HIDDEN']) assert.ok(isCentreStatus(value));
  for (const value of ['ARCHIVED', '', null]) assert.ok(!isCentreStatus(value));
  assert.ok(isLicenceStatus('EXPIRED') && !isLicenceStatus('MAYBE'));
});
