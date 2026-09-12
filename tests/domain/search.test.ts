/**
 * Search and ranking rules — Phase 2 PROMPT-012.
 *
 * The pure half of §15 and §16: which records a typed term finds, and in what
 * order matching records are shown. Both are decided without a database, so the
 * order a visitor saw can be reproduced from the rule alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANKING_VERSION,
  RANK_TIERS,
  SEARCH_KINDS,
  SEARCH_KIND_PATH,
  compareRanked,
  matchesTerm,
  promotedWhenRelevant,
  rankOrder,
  rankTier,
  withinOneEdit,
} from '../../src/search/model.ts';

const base = { promoted: false, trusted: false, verified: false, complete: false };

test('the ranking rule is named, so an order can be traced to the rule that produced it', () => {
  assert.match(RANKING_VERSION, /^rank-\d{4}-\d{2}-[a-z]$/);
  assert.deepEqual([...RANK_TIERS], ['PROMOTED', 'TRUSTED', 'VERIFIED', 'COMPLETE', 'BASE']);
  // Every kind a result can have knows the section it lives in.
  for (const kind of SEARCH_KINDS) {
    assert.match(SEARCH_KIND_PATH[kind], /^\/[a-z]+\/$/);
  }
});

test('the five bands of §15 are bands, not a score', () => {
  assert.equal(rankTier({ ...base, promoted: true, trusted: true }), 'PROMOTED');
  assert.equal(rankTier({ ...base, trusted: true, verified: true }), 'TRUSTED');
  assert.equal(rankTier({ ...base, verified: true, complete: true }), 'VERIFIED');
  assert.equal(rankTier({ ...base, complete: true }), 'COMPLETE');
  assert.equal(rankTier(base), 'BASE');
  // Nothing adds up: two lower axes never overtake one higher band.
  assert.ok(rankOrder('PROMOTED') < rankOrder('TRUSTED'));
  assert.ok(rankOrder('VERIFIED') < rankOrder('COMPLETE'));
  assert.ok(rankOrder('COMPLETE') < rankOrder('BASE'));
});

test('an advertisement that does not match the search keeps no higher place', () => {
  assert.equal(promotedWhenRelevant(true, true), true);
  // Paid, but not what was searched for: it is not promoted at all.
  assert.equal(promotedWhenRelevant(true, false), false);
  assert.equal(promotedWhenRelevant(false, true), false);
  assert.equal(rankTier({ ...base, promoted: promotedWhenRelevant(true, false), verified: true }), 'VERIFIED');
});

test('results are ordered by band first and alphabetically inside a band', () => {
  const rows = [
    { tier: 'BASE' as const, nameFa: 'الف' },
    { tier: 'PROMOTED' as const, nameFa: 'ی' },
    { tier: 'VERIFIED' as const, nameFa: 'ب' },
    { tier: 'TRUSTED' as const, nameFa: 'پ' },
    { tier: 'VERIFIED' as const, nameFa: 'الف' },
  ];
  assert.deepEqual(
    [...rows].sort(compareRanked).map((row) => row.tier + ':' + row.nameFa),
    ['PROMOTED:ی', 'TRUSTED:پ', 'VERIFIED:الف', 'VERIFIED:ب', 'BASE:الف'],
  );
});

test('one edit is forgiven on a long term, and nothing on a short one', () => {
  assert.equal(withinOneEdit('کلینیک', 'کلینیک'), true);
  assert.equal(withinOneEdit('کلینیک', 'کلنیک'), true, 'a missing letter');
  assert.equal(withinOneEdit('کلینیک', 'کلیینیک'), true, 'an extra letter');
  assert.equal(withinOneEdit('کلینیک', 'کلینک'), true, 'a wrong letter');
  assert.equal(withinOneEdit('کلینیک', 'کنیک'), false, 'two edits is a different word');

  // A common misspelling still finds the record.
  assert.equal(matchesTerm(['بیمارستان دامپزشکی تهران'], 'بیمارستن'), true);
  assert.equal(matchesTerm(['ژرمن شپرد', 'German Shepherd'], 'جرمن'), true);
  assert.equal(matchesTerm(['ژرمن شپرد'], 'هاسکی'), false);

  // A short term stays exact, so it does not match every near word.
  assert.equal(matchesTerm(['سگ نگهبان'], 'سگ'), true);
  assert.equal(matchesTerm(['سگ نگهبان'], 'سک'), false);

  // An empty term is not a filter at all.
  assert.equal(matchesTerm(['هر چیزی'], ''), true);
  assert.equal(matchesTerm([null, undefined, ''], 'چیزی'), false);
});
