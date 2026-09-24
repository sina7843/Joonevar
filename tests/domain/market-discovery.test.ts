/**
 * Discovery rules without a database — PROMPT-004.
 *
 * Filter normalisation is the security boundary of the public marketplace: a
 * query string is the one input a stranger fully controls. What is pinned here
 * is that nothing unrecognised survives it, that two links meaning the same
 * search produce the same address, and that a promotion moves an advert without
 * adding one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAGE_SIZE,
  EMPTY_FILTER,
  isCanonicalListingIndex,
  LISTING_SORTS,
  LISTING_SORT_FA,
  listingPath,
  listingQueryString,
  MAX_AGE_MONTHS,
  MAX_PAGE,
  MAX_PAGE_SIZE,
  MAX_TERM_LENGTH,
  parseListingFilter,
  placePromoted,
  PROMOTED_LABEL_FA,
} from '../../src/marketplace/discovery-model.ts';
import { LISTING_DECISION_FA, MARKET_REPORT_TARGETS, MARKET_TARGET_FA, isMarketReportTarget } from '../../src/marketplace/moderation-model.ts';
import { MODERATION_DECISIONS } from '../../src/moderation/model.ts';
import { buildMetadata } from '../../src/seo/metadata.ts';

test('an empty query string is the plain index, and that is the one indexed view', () => {
  const filter = parseListingFilter({});
  assert.deepEqual(filter, EMPTY_FILTER);
  assert.equal(listingQueryString(filter), '');
  assert.equal(isCanonicalListingIndex(filter), true);
  // Any filter at all makes it a view of the index rather than a page of its own.
  assert.equal(isCanonicalListingIndex(parseListingFilter({ sex: 'MALE' })), false);
  assert.equal(isCanonicalListingIndex(parseListingFilter({ page: '2' })), false);
});

test('every unrecognised value becomes null instead of reaching SQL', () => {
  const filter = parseListingFilter({
    species: "DOG'; drop table animal_listing; --",
    breed: '1 OR 1=1',
    province: '../../etc/passwd',
    city: 'not-a-uuid',
    priceMode: 'FREE',
    sex: 'OTHER',
    seller: 'ADMIN',
    vaccination: 'MAYBE',
    neuter: '',
    delivery: 'TELEPORT',
    sort: 'RANDOM',
    pedigree: 'PERHAPS',
    parentage: '1',
  });
  assert.equal(filter.species, null);
  assert.equal(filter.breedId, null);
  assert.equal(filter.provinceCode, null);
  assert.equal(filter.cityId, null);
  assert.equal(filter.priceMode, null);
  assert.equal(filter.sex, null);
  assert.equal(filter.sellerKind, null);
  assert.equal(filter.vaccination, null);
  assert.equal(filter.neuter, null);
  assert.equal(filter.delivery, null);
  assert.equal(filter.pedigree, null);
  assert.equal(filter.parentage, null);
  // An unknown sort falls back to the default rather than to no order at all.
  assert.equal(filter.sort, 'NEWEST');
});

test('a species code that is a real code is kept, normalised to upper case', () => {
  assert.equal(parseListingFilter({ species: 'dog' }).species, 'DOG');
  assert.equal(parseListingFilter({ species: 'DOG' }).species, 'DOG');
  // Length and character class are both bounded.
  assert.equal(parseListingFilter({ species: 'x'.repeat(41) }).species, null);
  assert.equal(parseListingFilter({ species: 'dog cat' }).species, null);
});

test('the free-text term is cleaned, bounded and stripped of direction overrides', () => {
  const dirty = 'سگ‮evil\u0000 ' + 'x'.repeat(200);
  const filter = parseListingFilter({ q: dirty });
  assert.ok(filter.term!.length <= MAX_TERM_LENGTH);
  assert.ok(!filter.term!.includes('‮'));
  assert.ok(!filter.term!.includes('\u0000'));
  // An empty or whitespace-only term is no term.
  assert.equal(parseListingFilter({ q: '   ' }).term, null);
});

test('numbers are bounded and a reversed range is read the way it was plainly meant', () => {
  const filter = parseListingFilter({ minPrice: '9000000', maxPrice: '1000000', minAge: '40', maxAge: '4' });
  assert.equal(filter.minPriceToman, 1_000_000n);
  assert.equal(filter.maxPriceToman, 9_000_000n);
  assert.equal(filter.minAgeMonths, 4);
  assert.equal(filter.maxAgeMonths, 40);

  // Nonsense is dropped rather than coerced, so the filter never lies about
  // what the visitor asked for.
  assert.equal(parseListingFilter({ minPrice: '-5' }).minPriceToman, null);
  assert.equal(parseListingFilter({ minPrice: '1e9' }).minPriceToman, null);
  assert.equal(parseListingFilter({ minPrice: '1,000' }).minPriceToman, null);
  assert.equal(parseListingFilter({ minPrice: '0' }).minPriceToman, null);
  assert.equal(parseListingFilter({ maxAge: String(MAX_AGE_MONTHS + 1) }).maxAgeMonths, null);
});

test('paging is bounded in both directions', () => {
  assert.equal(parseListingFilter({ page: '0' }).page, 1);
  assert.equal(parseListingFilter({ page: '-3' }).page, 1);
  assert.equal(parseListingFilter({ page: String(MAX_PAGE + 1) }).page, 1);
  assert.equal(parseListingFilter({ page: '7' }).page, 7);
  assert.equal(parseListingFilter({ pageSize: '0' }).pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(parseListingFilter({ pageSize: String(MAX_PAGE_SIZE + 1) }).pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(parseListingFilter({ pageSize: '24' }).pageSize, 24);
});

test('a repeated parameter is read once, not concatenated', () => {
  const filter = parseListingFilter({ sex: ['MALE', 'FEMALE'], page: ['3', '9'] });
  assert.equal(filter.sex, 'MALE');
  assert.equal(filter.page, 3);
});

test('two links meaning the same search produce the same canonical query', () => {
  const a = parseListingFilter({ sex: 'MALE', province: 'tehran', sort: 'PRICE_ASC' });
  const b = parseListingFilter({ sort: 'PRICE_ASC', province: 'tehran', sex: 'MALE', nonsense: 'x' });
  assert.equal(listingQueryString(a), listingQueryString(b));
  // The defaults never appear in the address.
  assert.ok(!listingQueryString(a).includes('page='));
  assert.ok(!listingQueryString(a).includes('pageSize='));
  assert.equal(listingQueryString(parseListingFilter({ sort: 'NEWEST' })), '');
  // Round trip: parsing a canonical query gives back the same filter.
  assert.deepEqual(parseListingFilter(Object.fromEntries(new URLSearchParams(listingQueryString(a).slice(1)))), a);
});

test('the booleans round-trip through the query string as YES and NO', () => {
  const on = parseListingFilter({ pedigree: 'YES', parentage: 'NO' });
  assert.equal(on.pedigree, true);
  assert.equal(on.parentage, false);
  assert.ok(listingQueryString(on).includes('pedigree=YES'));
  assert.ok(listingQueryString(on).includes('parentage=NO'));
});

test('a listing path is built from the id and nothing else', () => {
  assert.equal(listingPath('abc'), '/animals-market/abc');
});

test('every sort has a Persian name', () => {
  for (const sort of LISTING_SORTS) assert.ok(LISTING_SORT_FA[sort]);
});

test('a promotion moves an advert among the results, it never adds one', () => {
  const rows = [
    { id: 'a', promoted: false },
    { id: 'b', promoted: true },
    { id: 'c', promoted: false },
    { id: 'd', promoted: true },
  ];
  const placed = placePromoted(rows);
  // Same set, no additions and no removals.
  assert.deepEqual([...placed].map((r) => r.id).sort(), ['a', 'b', 'c', 'd']);
  // Promoted first, in their own original order.
  assert.deepEqual(placed.slice(0, 2).map((r) => r.id), ['b', 'd']);
  // And the organic order of the rest is untouched.
  assert.deepEqual(placed.slice(2).map((r) => r.id), ['a', 'c']);
  // With nothing promoted, the order is exactly what came in.
  assert.deepEqual(placePromoted(rows.map((r) => ({ ...r, promoted: false }))).map((r) => r.id), [
    'a',
    'b',
    'c',
    'd',
  ]);
});

test('the promoted label is a fixed word, not a per-page invention', () => {
  assert.equal(PROMOTED_LABEL_FA, 'تبلیغ');
});

test('the three report subjects are named, and nothing else is accepted', () => {
  assert.deepEqual([...MARKET_REPORT_TARGETS], ['ANIMAL_LISTING', 'LISTING_MEDIA', 'SELLER']);
  for (const target of MARKET_REPORT_TARGETS) assert.ok(MARKET_TARGET_FA[target]);
  assert.ok(isMarketReportTarget('SELLER'));
  assert.ok(!isMarketReportTarget('CONTENT'));
  assert.ok(!isMarketReportTarget('ANYTHING'));
});

test('the marketplace reuses the existing decision list rather than inventing one', () => {
  // A second set of names for the same four actions would be another thing to
  // keep in step, so the labels are keyed by the decisions that already exist.
  assert.deepEqual(Object.keys(LISTING_DECISION_FA).sort(), [...MODERATION_DECISIONS].sort());
  for (const decision of MODERATION_DECISIONS) assert.ok(LISTING_DECISION_FA[decision]);
});

test('only the plain index is offered for indexing, and every filtered view is not', () => {
  /*
   * The page turns `isCanonicalListingIndex` into the `noindex` flag, so this
   * pins both halves: the plain index is indexable in production, and any
   * filter or page makes the same address a view rather than a page of its own.
   * It cannot be checked in the browser suite, because outside production every
   * page is noindex by design (DEC-0152).
   */
  const production = { origin: 'https://example.invalid', production: true };
  const page = (raw: Record<string, string>) =>
    buildMetadata(
      {
        title: 'بازار',
        description: 'توضیح',
        path: '/animals-market',
        noindex: !isCanonicalListingIndex(parseListingFilter(raw)),
      },
      production,
    );

  const plain = page({}).robots as { index: boolean } | undefined;
  assert.equal(plain?.index, true);

  const views: Record<string, string>[] = [{ sex: 'MALE' }, { page: '2' }, { sort: 'PRICE_ASC' }, { q: 'سگ' }];
  for (const raw of views) {
    const filtered = page(raw).robots as { index: boolean } | undefined;
    assert.equal(filtered?.index, false, JSON.stringify(raw));
  }

  // The canonical address never carries the query string, so every permutation
  // points at the same page rather than competing with it.
  assert.equal(page({ sex: 'MALE' }).alternates?.canonical, 'https://example.invalid/animals-market');
});
