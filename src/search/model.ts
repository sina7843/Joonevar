/**
 * Search and ranking rules that need no database — Requirements-Phase-2 §15,
 * §16, P2-D04, P2-D05 (PROMPT-012).
 *
 * Two things are decided here and nowhere else: what matches a typed term, and
 * in what order matching records are shown. Both are pure functions with a
 * version stamped on them, so the order a visitor saw can be reproduced and
 * argued about later (§15 "نسخه‌پذیر و قابل Audit").
 */
import { normalizeForSearch } from '../breeds/model.ts';

/**
 * The ranking rule in force. It changes only with a decision, and every page
 * that ranks results reports it, so an order can be traced to its rule.
 */
export const RANKING_VERSION = 'rank-2026-09-a';

export const SEARCH_KINDS = ['VET', 'CENTRE', 'COMMUNITY', 'BREED', 'ARTICLE', 'NEWS'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_FA: Record<SearchKind, string> = {
  VET: 'دامپزشک',
  CENTRE: 'مرکز دامپزشکی',
  COMMUNITY: 'انجمن و کلاب',
  BREED: 'نژاد',
  ARTICLE: 'آموزش',
  NEWS: 'خبر',
};

/** Where each kind lives, so a result links to the page it belongs to. */
export const SEARCH_KIND_PATH: Record<SearchKind, string> = {
  VET: '/veterinarians/',
  CENTRE: '/centers/',
  COMMUNITY: '/associations/',
  BREED: '/breeds/',
  ARTICLE: '/articles/',
  NEWS: '/news/',
};

export const isSearchKind = (value: unknown): value is SearchKind =>
  typeof value === 'string' && (SEARCH_KINDS as readonly string[]).includes(value);

/**
 * The five bands of §15, highest first.
 *
 * They are bands, not a score: nothing adds up, and no band is bought except
 * PROMOTED, which buys placement and nothing else (P2-D05). A promoted record
 * that does not match the search never reaches this function — see
 * `promotedWhenRelevant`.
 */
export const RANK_TIERS = ['PROMOTED', 'TRUSTED', 'VERIFIED', 'COMPLETE', 'BASE'] as const;
export type RankTier = (typeof RANK_TIERS)[number];

export const RANK_TIER_FA: Record<RankTier, string> = {
  PROMOTED: 'تبلیغ',
  TRUSTED: 'معتمد',
  VERIFIED: 'تأییدشده',
  COMPLETE: 'پروفایل کامل',
  BASE: 'پایه',
};

export interface RankSignals {
  /** A live advertising package, and only where the record matches the search. */
  readonly promoted: boolean;
  /** Phase 1 trust, never something a package can grant. */
  readonly trusted: boolean;
  /** A licence or registration a reviewer recorded. */
  readonly verified: boolean;
  readonly complete: boolean;
}

export function rankTier(signals: RankSignals): RankTier {
  if (signals.promoted) return 'PROMOTED';
  if (signals.trusted) return 'TRUSTED';
  if (signals.verified) return 'VERIFIED';
  if (signals.complete) return 'COMPLETE';
  return 'BASE';
}

export const rankOrder = (tier: RankTier): number => RANK_TIERS.indexOf(tier);

/**
 * §15: «تبلیغ نامرتبط حق اشغال جایگاه بالاتر را ندارد».
 *
 * Relevance is decided by the search itself: a record that does not match the
 * term, the place or the topic is not in the result set at all, and a record
 * that only matches because it paid is not promoted either. This function is
 * where that rule is written down, so no caller can quietly skip it.
 */
export const promotedWhenRelevant = (hasLivePackage: boolean, matchesQuery: boolean): boolean =>
  hasLivePackage && matchesQuery;

/**
 * A common misspelling still finds the record.
 *
 * One edit — a wrong letter, a missing one, an extra one — on a term of at
 * least four characters. Two edits would start matching unrelated words, and a
 * short term is left exact so «سگ» does not match «سک» and «شگ» at once.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    // A replacement moves both, an insertion moves only the longer one.
    if (shorter.length === longer.length) i += 1;
    j += 1;
  }
  return edits + (longer.length - j) + (shorter.length - i) <= 1;
}

const TYPO_MIN_LENGTH = 4;

/** One word of the term against one text, forgiving a single edit on a long word. */
function fieldMatchesWord(hay: string, needle: string): boolean {
  if (hay.includes(needle)) return true;
  if (needle.length < TYPO_MIN_LENGTH) return false;
  // A window the size of the word, and one a letter longer or shorter, covers a
  // replacement as well as a missing or extra letter.
  for (const width of [needle.length, needle.length + 1, needle.length - 1]) {
    if (width <= 0 || width > hay.length) continue;
    for (let start = 0; start + width <= hay.length; start += 1) {
      if (withinOneEdit(needle, hay.slice(start, start + width))) return true;
    }
  }
  return false;
}

/**
 * Does this record match the term?
 *
 * Every word of the term has to be found, each one in any of the record's
 * texts. Matching the whole typed phrase as one run of letters would make two
 * different names a single edit apart — «کلاب رتبه آ» and «کلاب رتبه بی» — the
 * same search, so the words are matched one by one instead.
 */
export function matchesTerm(haystacks: readonly (string | null | undefined)[], term: string): boolean {
  const words = (term ?? '')
    .split(/\s+/)
    .map((word) => normalizeForSearch(word))
    .filter((word) => word !== '');
  if (words.length === 0) return true;

  const fields = haystacks
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map((value) => normalizeForSearch(value))
    .filter((value) => value !== '');
  if (fields.length === 0) return false;

  return words.every((word) => fields.some((hay) => fieldMatchesWord(hay, word)));
}

export interface RankedRow {
  readonly tier: RankTier;
  readonly nameFa: string;
}

/** Bands first, then a neutral alphabetical order inside a band. */
export const compareRanked = (a: RankedRow, b: RankedRow): number =>
  rankOrder(a.tier) - rankOrder(b.tier) || a.nameFa.localeCompare(b.nameFa, 'fa');
