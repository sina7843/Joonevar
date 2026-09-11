import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  countryNameFa,
  isHttpUrl,
  isReviewDate,
  isValidSlug,
  matchesBreedSearch,
  normalizeForSearch,
  parseAltNames,
  publishBlockers,
  slugify,
} from '../../src/breeds/model.ts';

const cp = (...codes: number[]) => String.fromCharCode(...codes);

test('slugs are stable latin addresses', () => {
  assert.equal(slugify('German Shepherd'), 'german-shepherd');
  assert.equal(slugify('  Shih Tzu!! '), 'shih-tzu');
  assert.equal(slugify('Dogue de Bordeaux (French Mastiff)'), 'dogue-de-bordeaux-french-mastiff');
  assert.equal(slugify('L' + cp(0x00f6) + 'wchen'), 'lowchen');
  assert.equal(slugify('سگ سرابی'), '');

  assert.ok(isValidSlug('german-shepherd'));
  for (const bad of ['German', 'a--b', '-a', 'a-', 'ژرمن', 'a b', 'a'.repeat(81)]) {
    assert.ok(!isValidSlug(bad), bad);
  }
});

test('search ignores Arabic letter variants, joiners, short vowels, digits, case and spacing', () => {
  const persianYeh = cp(0x06cc);
  const arabicYeh = cp(0x064a);
  const keheh = cp(0x06a9);
  const arabicKaf = cp(0x0643);
  const zwnj = cp(0x200c);
  const fatha = cp(0x064e);

  assert.equal(normalizeForSearch('سرابی'.slice(0, 4) + arabicYeh), normalizeForSearch('سرابی'.slice(0, 4) + persianYeh));
  assert.equal(normalizeForSearch(arabicKaf + 'وچک'), normalizeForSearch(keheh + 'وچک'));
  assert.equal(normalizeForSearch('ژرمن' + zwnj + 'شپرد'), normalizeForSearch('ژرمن شپرد'));
  assert.equal(normalizeForSearch('س' + fatha + 'گ'), normalizeForSearch('سگ'));
  assert.equal(normalizeForSearch(cp(0x06f1, 0x06f2) + cp(0x0663)), '123');
  assert.equal(normalizeForSearch('German-Shepherd'), normalizeForSearch('german shepherd'));
});

test('a breed matches by either name, its address or an alternative name', () => {
  const breed = { nameFa: 'ژرمن شپرد', nameEn: 'German Shepherd', slug: 'german-shepherd', altNames: ['Alsatian'] };
  for (const term of ['شپرد', 'SHEPHERD', 'german-shep', 'alsat', '', '  ']) {
    assert.ok(matchesBreedSearch(breed, term), term);
  }
  assert.ok(!matchesBreedSearch(breed, 'retriever'));
});

test('alternative names are split, trimmed and de-duplicated', () => {
  assert.deepEqual(parseAltNames('Alsatian\n alsatian \n\nDeutscher Schäferhund، GSD'), [
    'Alsatian',
    'Deutscher Schäferhund',
    'GSD',
  ]);
  assert.deepEqual(parseAltNames(''), []);
});

test('the origin country is an ISO code the platform can name in Persian', () => {
  assert.equal(countryNameFa('IR'), 'ایران');
  assert.ok(countryNameFa('DE'));
  for (const bad of ['ir', 'IRN', '', 'QQ', '1R']) assert.equal(countryNameFa(bad), null, bad);
});

test('links and review dates are validated', () => {
  assert.ok(isHttpUrl('https://www.fci.be/en/nomenclature/'));
  assert.ok(isHttpUrl('http://example.org/standard.pdf'));
  for (const bad of ['javascript:alert(1)', 'ftp://example.org/x', 'not a url', '']) assert.ok(!isHttpUrl(bad), bad);

  const today = new Date('2026-09-11T12:00:00Z');
  assert.ok(isReviewDate('2026-01-31', today));
  assert.ok(isReviewDate('2026-09-11', new Date('2026-09-11T00:00:00Z')));
  for (const bad of ['2026-02-30', '2026-12-01', '31/01/2026', '2026-1-5']) assert.ok(!isReviewDate(bad, today), bad);
});

test('a breed page follows its transitions and is published only with written content', () => {
  assert.ok(canTransition('DRAFT', 'PUBLISHED'));
  assert.ok(canTransition('PUBLISHED', 'ARCHIVED'));
  assert.ok(canTransition('PUBLISHED', 'DRAFT'));
  assert.ok(canTransition('ARCHIVED', 'PUBLISHED'));
  assert.ok(!canTransition('DRAFT', 'ARCHIVED'));
  assert.ok(!canTransition('ARCHIVED', 'DRAFT'));
  assert.ok(!canTransition('DRAFT', 'DRAFT'));

  assert.equal(publishBlockers({ historyFa: '  ', standardFa: null }).length, 1);
  assert.deepEqual(publishBlockers({ historyFa: null, standardFa: 'خلاصه استاندارد' }), []);
});
