/**
 * Veterinary directory rules without a database — Phase 2 PROMPT-006.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeness,
  isVetPublicStatus,
  publicPhone,
  vetPublishBlockers,
  type CompletenessInput,
} from '../../src/vets/directory-model.ts';

const empty: CompletenessInput = {
  headlineFa: null,
  bioFa: null,
  experienceFa: null,
  specialtyCount: 0,
  speciesCount: 0,
  publicLocationsWithCity: 0,
  contactShown: false,
};

const full: CompletenessInput = {
  headlineFa: 'دامپزشک حیوانات کوچک',
  bioFa: 'معرفی',
  experienceFa: 'سوابق',
  specialtyCount: 2,
  speciesCount: 1,
  publicLocationsWithCity: 1,
  contactShown: true,
};

test('completeness counts what the profile says and names what is missing', () => {
  const none = completeness(empty);
  assert.equal(none.done, 0);
  assert.equal(none.total, 7);
  assert.equal(none.complete, false);
  assert.equal(none.missing.length, 7);

  assert.deepEqual(completeness(full), { done: 7, total: 7, missing: [], complete: true });

  // Whitespace is not content.
  const blank = completeness({ ...full, bioFa: '   ' });
  assert.equal(blank.done, 6);
  assert.deepEqual(blank.missing, ['معرفی']);
});

test('publishing needs a bio and a public location with a city, and nothing else', () => {
  assert.equal(vetPublishBlockers(empty).length, 2);
  assert.deepEqual(vetPublishBlockers({ ...empty, bioFa: 'معرفی', publicLocationsWithCity: 1 }), []);
  assert.equal(vetPublishBlockers({ ...full, publicLocationsWithCity: 0 }).length, 1);
  // Completeness is its own axis: an incomplete profile with the two essentials may be published.
  assert.equal(completeness({ ...empty, bioFa: 'معرفی', publicLocationsWithCity: 1 }).complete, false);
});

test('a phone is public only with consent and only when there is one', () => {
  assert.equal(publicPhone(false, '02100000000'), null);
  assert.equal(publicPhone(true, null), null);
  assert.equal(publicPhone(true, '  '), null);
  assert.equal(publicPhone(true, ' 02100000000 '), '02100000000');
});

test('public status values are a closed list', () => {
  for (const value of ['DRAFT', 'PUBLISHED', 'HIDDEN']) assert.ok(isVetPublicStatus(value));
  for (const value of ['ARCHIVED', 'published', '', null, 3]) assert.ok(!isVetPublicStatus(value));
});
