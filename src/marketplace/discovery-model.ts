/**
 * Public marketplace discovery rules — PROMPT-004.
 *
 * Pure functions: what a filter may say, how a query string becomes a filter,
 * how results are ordered and where the promoted ones go. No database and no
 * framework, so the same normalisation answers the page, the canonical URL, the
 * sitemap and the tests.
 *
 * Every value that reaches SQL passes through here first and comes out as a
 * member of a closed list, a UUID, or a bounded integer. A free-text term is
 * the one exception and it is bound as a parameter, never concatenated.
 */
import {
  DELIVERY_METHODS,
  DISCLOSURES,
  PRICE_MODES,
  type DeliveryMethod,
  type Disclosure,
  type PriceMode,
} from './listing-model.ts';

// ── sorting ────────────────────────────────────────────────────────────────

export const LISTING_SORTS = ['NEWEST', 'PRICE_ASC', 'PRICE_DESC'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const LISTING_SORT_FA: Record<ListingSort, string> = {
  NEWEST: 'تازه‌ترین',
  PRICE_ASC: 'ارزان‌ترین',
  PRICE_DESC: 'گران‌ترین',
};

export const isListingSort = (value: unknown): value is ListingSort =>
  typeof value === 'string' && (LISTING_SORTS as readonly string[]).includes(value);

// ── seller kind ────────────────────────────────────────────────────────────

export const SELLER_KIND_FILTERS = ['OWNER', 'KENNEL'] as const;
export type SellerKindFilter = (typeof SELLER_KIND_FILTERS)[number];

// ── the filter itself ──────────────────────────────────────────────────────

export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 48;
export const DEFAULT_PAGE_SIZE = 12;
/** A bound rather than an opinion: a deeper page is a crawler, not a buyer. */
export const MAX_PAGE = 200;
export const MAX_TERM_LENGTH = 80;
/** Ages beyond this are a typo, not a dog. */
export const MAX_AGE_MONTHS = 360;

export interface ListingFilter {
  readonly term: string | null;
  readonly species: string | null;
  readonly breedId: string | null;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly priceMode: PriceMode | null;
  readonly minPriceToman: bigint | null;
  readonly maxPriceToman: bigint | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly sellerKind: SellerKindFilter | null;
  readonly pedigree: boolean | null;
  readonly parentage: boolean | null;
  readonly vaccination: Disclosure | null;
  readonly neuter: Disclosure | null;
  readonly delivery: DeliveryMethod | null;
  readonly sort: ListingSort;
  readonly page: number;
  readonly pageSize: number;
}

export const EMPTY_FILTER: ListingFilter = {
  term: null,
  species: null,
  breedId: null,
  provinceCode: null,
  cityId: null,
  priceMode: null,
  minPriceToman: null,
  maxPriceToman: null,
  sex: null,
  minAgeMonths: null,
  maxAgeMonths: null,
  sellerKind: null,
  pedigree: null,
  parentage: null,
  vaccination: null,
  neuter: null,
  delivery: null,
  sort: 'NEWEST',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

export type RawSearch = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Species and province are short latin/dash codes in the taxonomy. */
const CODE = /^[a-z0-9][a-z0-9-]{0,39}$/i;
/** Control characters and the bidirectional overrides that can disguise text. */
const CONTROL = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;

const one = (value: string | string[] | undefined): string =>
  ((Array.isArray(value) ? value[0] : value) ?? '').trim();

const inList = <T extends string>(list: readonly T[], value: string): T | null =>
  (list as readonly string[]).includes(value) ? (value as T) : null;

const boundedInt = (value: string, min: number, max: number): number | null => {
  if (!/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
};

const money = (value: string): bigint | null => {
  // Digits only: no separators, no sign, no exponent. A malformed amount is
  // dropped rather than coerced, because a coerced filter silently lies about
  // what the visitor asked for.
  if (!/^\d{1,15}$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n ? parsed : null;
};

const yesNo = (value: string): boolean | null => (value === 'YES' ? true : value === 'NO' ? false : null);

/**
 * A query string, made safe.
 *
 * Anything unrecognised becomes null rather than an error: a link someone
 * edited by hand still shows the marketplace, it simply ignores the part it
 * cannot read. That also means a hostile query string has nothing to inject
 * with — every field below is either a closed list, a UUID, a bounded integer
 * or a cleaned term bound as a parameter.
 */
export function parseListingFilter(raw: RawSearch): ListingFilter {
  const term = one(raw.q).replace(CONTROL, '').slice(0, MAX_TERM_LENGTH).trim();
  const minPrice = money(one(raw.minPrice));
  const maxPrice = money(one(raw.maxPrice));
  const minAge = boundedInt(one(raw.minAge), 0, MAX_AGE_MONTHS);
  const maxAge = boundedInt(one(raw.maxAge), 0, MAX_AGE_MONTHS);

  return {
    term: term === '' ? null : term,
    species: CODE.test(one(raw.species)) ? one(raw.species).toUpperCase() : null,
    breedId: UUID.test(one(raw.breed)) ? one(raw.breed) : null,
    provinceCode: CODE.test(one(raw.province)) ? one(raw.province) : null,
    cityId: UUID.test(one(raw.city)) ? one(raw.city) : null,
    priceMode: inList(PRICE_MODES, one(raw.priceMode)),
    // A reversed range is a mistake, not a query for nothing: the two swap so
    // the visitor gets the range they plainly meant.
    minPriceToman: minPrice !== null && maxPrice !== null && minPrice > maxPrice ? maxPrice : minPrice,
    maxPriceToman: minPrice !== null && maxPrice !== null && minPrice > maxPrice ? minPrice : maxPrice,
    sex: inList(['MALE', 'FEMALE'] as const, one(raw.sex)),
    minAgeMonths: minAge !== null && maxAge !== null && minAge > maxAge ? maxAge : minAge,
    maxAgeMonths: minAge !== null && maxAge !== null && minAge > maxAge ? minAge : maxAge,
    sellerKind: inList(SELLER_KIND_FILTERS, one(raw.seller)),
    pedigree: yesNo(one(raw.pedigree)),
    parentage: yesNo(one(raw.parentage)),
    vaccination: inList(DISCLOSURES, one(raw.vaccination)),
    neuter: inList(DISCLOSURES, one(raw.neuter)),
    delivery: inList(DELIVERY_METHODS, one(raw.delivery)),
    sort: isListingSort(one(raw.sort)) ? (one(raw.sort) as ListingSort) : 'NEWEST',
    page: boundedInt(one(raw.page), 1, MAX_PAGE) ?? 1,
    pageSize: boundedInt(one(raw.pageSize), MIN_PAGE_SIZE, MAX_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE,
  };
}

/**
 * The canonical query string for a filter.
 *
 * Keys in a fixed order with empty ones dropped, so two links that mean the
 * same search produce the same address and the page has one canonical URL
 * rather than one per permutation a visitor happens to type.
 */
export function listingQueryString(filter: ListingFilter): string {
  const parts: Array<[string, string]> = [];
  const add = (key: string, value: string | number | bigint | null) => {
    if (value === null || value === '') return;
    parts.push([key, String(value)]);
  };
  add('q', filter.term);
  add('species', filter.species);
  add('breed', filter.breedId);
  add('province', filter.provinceCode);
  add('city', filter.cityId);
  add('priceMode', filter.priceMode);
  add('minPrice', filter.minPriceToman);
  add('maxPrice', filter.maxPriceToman);
  add('sex', filter.sex);
  add('minAge', filter.minAgeMonths);
  add('maxAge', filter.maxAgeMonths);
  add('seller', filter.sellerKind);
  add('pedigree', filter.pedigree === null ? null : filter.pedigree ? 'YES' : 'NO');
  add('parentage', filter.parentage === null ? null : filter.parentage ? 'YES' : 'NO');
  add('vaccination', filter.vaccination);
  add('neuter', filter.neuter);
  add('delivery', filter.delivery);
  if (filter.sort !== 'NEWEST') add('sort', filter.sort);
  if (filter.page !== 1) add('page', filter.page);
  if (filter.pageSize !== DEFAULT_PAGE_SIZE) add('pageSize', filter.pageSize);

  const search = new URLSearchParams(parts).toString();
  return search === '' ? '' : '?' + search;
}

export const LISTING_INDEX_PATH = '/animals-market';
export const listingPath = (id: string): string => LISTING_INDEX_PATH + '/' + id;

/**
 * Whether this view should be indexed by a search engine.
 *
 * The unfiltered first page is the page worth having in an index. Every
 * filtered or paged permutation points its canonical at that page instead, so
 * one marketplace does not become ten thousand near-duplicate results.
 */
export function isCanonicalListingIndex(filter: ListingFilter): boolean {
  return listingQueryString(filter) === '';
}

// ── promoted placement ─────────────────────────────────────────────────────

export interface Placeable {
  readonly id: string;
  readonly promoted: boolean;
}

/**
 * Promoted rows first, then the organic order, with nothing else changed.
 *
 * Three properties the tests pin, because each of them is a way this could
 * quietly become dishonest:
 *  - a promoted row is only ever moved among rows that already matched, so a
 *    promotion never adds a result the visitor did not ask for;
 *  - the organic order of everything else is untouched;
 *  - being promoted is a placement, never a reputation — nothing in the rest of
 *    the product reads this flag.
 */
export function placePromoted<T extends Placeable>(rows: readonly T[]): T[] {
  const promoted = rows.filter((row) => row.promoted);
  const organic = rows.filter((row) => !row.promoted);
  return [...promoted, ...organic];
}

export const PROMOTED_LABEL_FA = 'تبلیغ';
