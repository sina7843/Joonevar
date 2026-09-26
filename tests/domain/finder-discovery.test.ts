/**
 * Kinship, compatibility and discovery ordering — PHASE-4 PROMPT-004, pure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { kinshipOf, type Parents } from '../../src/finder/kinship.ts';
import { evaluateCompatibility, roundedDistanceKm, SCORE_DISCLAIMER_FA, type SideFacts } from '../../src/finder/compatibility.ts';
import { decodeCursor, encodeCursor, filtersToQuery, pageAfter, parseFilters } from '../../src/finder/discovery-model.ts';

const P = (entries: Record<string, [string | null, string | null]>) =>
  new Map<string, Parents>(Object.entries(entries).map(([id, [sire, dam]]) => [id, { sire, dam }]));

// A small family:  gs × gd → s1 (sire), d1 (dam);  s1 × d1 → a, b (full sibs);  s1 × x → c (half sib of a);
// a × y → g (a's child);  c × z → h;  cousins: g and h share s1 at distance 2 each.
const family = P({
  s1: ['gs', 'gd'],
  a: ['s1', 'd1'],
  b: ['s1', 'd1'],
  c: ['s1', 'x'],
  g: ['a', 'y'],
  h: ['c', 'z'],
  lonely: [null, null],
  other: ['p', 'q'],
});

test('kinship: self, parent/child, full and half siblings, grandparent, cousins — each at its degree', () => {
  assert.equal(kinshipOf('a', 'a', family).status, 'SELF');
  assert.equal(kinshipOf('a', 'g', family).degree, 1, 'parent and child');
  assert.equal(kinshipOf('a', 'b', family).degree, 1, 'full siblings');
  assert.match(kinshipOf('a', 'b', family).relationFa!, /تنی/);
  assert.equal(kinshipOf('a', 'c', family).degree, 2, 'half siblings');
  assert.equal(kinshipOf('s1', 'g', family).degree, 2, 'grandparent');
  assert.equal(kinshipOf('g', 'h', family).degree, 3, 'half cousins through s1');
});

test('kinship: missing lineage is unknown, never safe; unrelated known lines say so with a caveat', () => {
  const unknown = kinshipOf('lonely', 'a', family);
  assert.equal(unknown.status, 'UNKNOWN');
  assert.match(unknown.explanationFa, /قابل تأیید نیست/);
  const none = kinshipOf('other', 'a', family);
  assert.equal(none.status, 'NONE_FOUND');
  assert.match(none.explanationFa, /نه تضمین/);
});

test('kinship: a corrupt cycle in the data cannot loop the walk', () => {
  const cyclic = P({ m: ['n', null], n: ['m', null], k: ['n', null] });
  const result = kinshipOf('m', 'k', cyclic);
  assert.equal(result.status, 'KNOWN_RELATED');
});

const side = (over: Partial<SideFacts> = {}): SideFacts => ({
  animalId: 'mine',
  species: 'DOG',
  breedId: 'breed-1',
  sex: 'MALE',
  ageMonths: 30,
  rule: { id: 'r1', version: 3, minAgeMonths: 12, maxAgeMonths: 96, cooldownDays: 14, cooldownMonths: null, cooldownMode: 'WARN', kinshipMaxDegree: 2, kinshipMode: 'WARN' },
  cooldown: { state: 'NO_HISTORY', endsOn: null, mode: null, fa: '' },
  confirmedMatings: 0,
  completeness: { score: 2, total: 5 },
  hasPedigree: true,
  ...over,
});
const other = (over: Partial<SideFacts> = {}) => side({ animalId: 'other', sex: 'FEMALE', ...over });
const none = { status: 'NONE_FOUND' as const, degree: null, relationFa: null, explanationFa: 'هیچ' };
const prefs = { maxDistanceKm: null, pedigreeRequired: false };

test('same breed, opposite sex, one species and two animals, or the score is 0 with the reason', () => {
  const base = evaluateCompatibility({ mine: side(), other: other(), kinship: none, distanceKm: 20, preferences: prefs });
  assert.equal(base.blockers.length, 0);
  assert.ok(base.score > 0);
  assert.equal(base.disclaimerFa, SCORE_DISCLAIMER_FA);
  assert.match(SCORE_DISCLAIMER_FA, /تضمین باروری، آبستنی، سلامت یا کیفیت توله نیست/);
  for (const bad of [other({ sex: 'MALE' }), other({ breedId: 'breed-2' }), other({ species: 'CAT' }), other({ animalId: 'mine' })]) {
    const e = evaluateCompatibility({ mine: side(), other: bad, kinship: none, distanceKm: 20, preferences: prefs });
    assert.equal(e.score, 0);
    assert.ok(e.blockers.length > 0);
  }
});

test('age outside the range, or a range nobody set, blocks; the rule versions used are returned', () => {
  const young = evaluateCompatibility({ mine: side(), other: other({ ageMonths: 6 }), kinship: none, distanceKm: 20, preferences: prefs });
  assert.ok(young.blockers.some((b) => /حداقل سن/.test(b)));
  const unset = evaluateCompatibility({
    mine: side(),
    other: other({ rule: { ...side().rule!, id: 'r2', minAgeMonths: null, maxAgeMonths: null } }),
    kinship: none,
    distanceKm: 20,
    preferences: prefs,
  });
  assert.ok(unset.blockers.some((b) => /تعیین نشده/.test(b)));
  assert.deepEqual(unset.ruleVersions.map((r) => r.id).sort(), ['r1', 'r2']);
});

test('kinship warns by default and blocks only under a BLOCK rule within its threshold; unknown lineage is listed as unknown', () => {
  const sibs = { status: 'KNOWN_RELATED' as const, degree: 1, relationFa: 'خواهر/برادر تنی', explanationFa: 'تنی' };
  const warn = evaluateCompatibility({ mine: side(), other: other(), kinship: sibs, distanceKm: 20, preferences: prefs });
  assert.equal(warn.blockers.length, 0);
  assert.ok(warn.warnings.some((w) => w.includes('خویشاوندی')));
  const block = evaluateCompatibility({ mine: side({ rule: { ...side().rule!, kinshipMode: 'BLOCK' } }), other: other(), kinship: sibs, distanceKm: 20, preferences: prefs });
  assert.equal(block.score, 0);
  const far = { ...sibs, degree: 4 };
  const beyond = evaluateCompatibility({ mine: side({ rule: { ...side().rule!, kinshipMode: 'BLOCK' } }), other: other(), kinship: far, distanceKm: 20, preferences: prefs });
  assert.equal(beyond.blockers.length, 0, 'degree 4 is beyond a threshold of 2');
  const unknown = evaluateCompatibility({ mine: side(), other: other(), kinship: { status: 'UNKNOWN', degree: null, relationFa: null, explanationFa: 'نامعلوم' }, distanceKm: 20, preferences: prefs });
  assert.ok(unknown.unknowns.includes('نامعلوم'));
  assert.ok(!unknown.positives.includes('نامعلوم'));
});

test('cooldown warns unless the rule blocks', () => {
  const cooling = { state: 'IN_COOLDOWN' as const, endsOn: '2026-10-01', mode: 'WARN' as const, fa: 'در فاصله' };
  const warn = evaluateCompatibility({ mine: side(), other: other({ cooldown: cooling }), kinship: none, distanceKm: 20, preferences: prefs });
  assert.equal(warn.blockers.length, 0);
  assert.ok(warn.warnings.length > 0);
  const block = evaluateCompatibility({ mine: side(), other: other({ cooldown: { ...cooling, mode: 'BLOCK' } }), kinship: none, distanceKm: 20, preferences: prefs });
  assert.equal(block.score, 0);
});

test('deterministic, and nothing about a subscription is an input', () => {
  const input = { mine: side(), other: other(), kinship: none, distanceKm: 120, preferences: prefs };
  assert.deepEqual(evaluateCompatibility(input), evaluateCompatibility(input));
  assert.equal(evaluateCompatibility.length, 1);
  assert.ok(!('subscribed' in input.other));
});

test('distance is rounded up to 5 km and never below 5', () => {
  assert.equal(roundedDistanceKm(0.3), 5);
  assert.equal(roundedDistanceKm(12.1), 15);
  assert.equal(roundedDistanceKm(15), 15);
});

test('filters parse against a closed vocabulary; hostile values are dropped, not passed on', () => {
  const f = parseFilters({ breed: "x' or 1=1", sex: 'BOTH', distance: '99999', minAge: '-3', pedigree: 'YES', availability: 'INACTIVE', completeness: '9', for: 'nope', city: '  تهران ' });
  assert.equal(f.breedId, null);
  assert.equal(f.sex, null);
  assert.equal(f.maxDistanceKm, null);
  assert.equal(f.minAgeMonths, null);
  assert.equal(f.pedigree, 'YES');
  assert.equal(f.availability, null, 'a hidden state cannot be asked for');
  assert.equal(f.minCompleteness, 0);
  assert.equal(f.forAnimalId, null);
  assert.equal(f.city, 'تهران');
  assert.deepEqual(parseFilters(filtersToQuery(f)), f, 'round trip');
});

test('keyset pages neither duplicate nor skip when a newer item arrives between pages', () => {
  const id = (n: number) => '00000000-0000-0000-0000-' + String(n).padStart(12, '0');
  const items = Array.from({ length: 10 }, (_, i) => ({ profileId: id(i + 1), sortKey: 100 - (i % 3) }));
  const first = pageAfter(items, null, 4);
  const withNew = [...items, { profileId: id(99), sortKey: 1000 }];
  const second = pageAfter(withNew, decodeCursor(first.next), 4);
  const third = pageAfter(withNew, decodeCursor(second.next), 4);
  const seen = [...first.page, ...second.page, ...third.page].map((i) => i.profileId);
  assert.equal(new Set(seen).size, seen.length, 'no duplicates');
  assert.deepEqual([...seen].sort(), items.map((i) => i.profileId).sort(), 'every original item exactly once');
  assert.equal(decodeCursor('garbage'), null);
  assert.equal(decodeCursor(encodeCursor({ profileId: id(1), sortKey: 5 }))?.k, 5);
});
