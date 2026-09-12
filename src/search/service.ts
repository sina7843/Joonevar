/**
 * Global search — Requirements-Phase-2 §15, §16, P2-D04, P2-D05 (PROMPT-012).
 *
 * One question asked of every public directory at once, answered in one order.
 * The order is the five bands of §15 and nothing else: a live advertising
 * package buys placement among records that already match the search, and never
 * a claim about the record itself. Each source keeps its own rules about what
 * is public; this module only asks them and ranks what comes back.
 *
 * ponytail: the sources are queried in full and filtered in memory. That is
 * what the existing directories already do; moving all six behind one indexed
 * query is a database change of its own, not part of this slice.
 */
import type { DbClient } from '../db/client.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import { publishedVets } from '../vets/directory.ts';
import { publishedCentres } from '../centres/service.ts';
import { publishedCommunities } from '../communities/service.ts';
import { publishedBreeds } from '../breeds/service.ts';
import { publicContentList } from '../content/service.ts';
import {
  RANKING_VERSION,
  SEARCH_KINDS,
  SEARCH_KIND_PATH,
  compareRanked,
  matchesTerm,
  promotedWhenRelevant,
  rankTier,
  type RankTier,
  type SearchKind,
} from './model.ts';

/** One page of every source, large enough that ranking sees the whole set. */
const SOURCE_LIMIT = 500;

export interface SearchQuery {
  readonly term?: string;
  readonly kind?: string | null;
  readonly species?: string | null;
  readonly province?: string | null;
  readonly cityId?: string | null;
  readonly specialty?: string | null;
  readonly service?: string | null;
  /** One axis at a time; the axes never combine into a score (P2-D05). */
  readonly status?: 'VERIFIED' | 'TRUSTED' | null;
  readonly page: number;
  readonly pageSize?: number;
}

export interface SearchResult {
  readonly kind: SearchKind;
  readonly slug: string;
  readonly path: string;
  readonly titleFa: string;
  readonly subtitleFa: string | null;
  readonly placeFa: string | null;
  readonly tier: RankTier;
  readonly promoted: boolean;
  readonly trusted: boolean;
  readonly verified: boolean;
}

export interface SearchAnswer extends Page<SearchResult> {
  readonly totalByKind: Record<SearchKind, number>;
  /** Stamped on every answer so an order can be traced to its rule (§15). */
  readonly rankingVersion: string;
  /** Which kinds the active filters can still answer, and why they were dropped. */
  readonly skippedKindsFa: readonly string[];
}

/**
 * A place or a professional filter is a question only the directories can
 * answer: a breed page or an article has no city and no licence, so including
 * them would answer a geographic search with something that is not relevant
 * (§15, §16).
 */
const placeFiltered = (query: SearchQuery): boolean =>
  Boolean(query.province || query.cityId || query.specialty || query.service || query.status);

export async function globalSearch(
  database: DbClient,
  query: SearchQuery,
  now: Date = new Date(),
): Promise<SearchAnswer> {
  const term = (query.term ?? '').trim();
  const wanted = SEARCH_KINDS.filter((kind) => !query.kind || query.kind === kind);
  const directoriesOnly = placeFiltered(query);
  const skipped: string[] = [];

  const results: SearchResult[] = [];

  if (wanted.includes('VET')) {
    const answer = await publishedVets(database, {
      specialty: query.specialty ?? null,
      species: query.species ?? null,
      province: query.province ?? null,
      cityId: query.cityId ?? null,
      status: query.status ?? null,
      page: 1,
      pageSize: SOURCE_LIMIT,
    });
    for (const card of answer.items) {
      if (!matchesTerm([card.nameFa, card.headlineFa, ...card.specialtiesFa, ...card.placesFa], term)) continue;
      results.push({
        kind: 'VET',
        slug: card.slug,
        path: SEARCH_KIND_PATH.VET + card.slug,
        titleFa: card.nameFa,
        subtitleFa: card.headlineFa ?? (card.specialtiesFa.length > 0 ? card.specialtiesFa.join('، ') : null),
        placeFa: card.placesFa[0] ?? null,
        tier: rankTier({
          promoted: promotedWhenRelevant(card.promoted, true),
          trusted: card.trusted,
          verified: card.verified,
          complete: card.complete,
        }),
        promoted: card.promoted,
        trusted: card.trusted,
        verified: card.verified,
      });
    }
  }

  if (wanted.includes('CENTRE')) {
    const answer = await publishedCentres(database, {
      service: query.service ?? null,
      species: query.species ?? null,
      province: query.province ?? null,
      cityId: query.cityId ?? null,
      verified: query.status === 'VERIFIED',
      page: 1,
      pageSize: SOURCE_LIMIT,
    });
    for (const card of answer.items) {
      if (!matchesTerm([card.nameFa, card.typeFa, ...card.servicesFa, ...card.placesFa], term)) continue;
      // A centre has no Phase 1 trust of its own; being a service partner is
      // the closest axis §15 names, and it is recorded, never bought.
      results.push({
        kind: 'CENTRE',
        slug: card.slug,
        path: SEARCH_KIND_PATH.CENTRE + card.slug,
        titleFa: card.nameFa,
        subtitleFa: card.typeFa,
        placeFa: card.placesFa[0] ?? null,
        tier: rankTier({
          promoted: promotedWhenRelevant(card.promoted, true),
          trusted: card.serves,
          verified: card.verified,
          complete: card.complete,
        }),
        promoted: card.promoted,
        trusted: card.serves,
        verified: card.verified,
      });
    }
  }

  if (wanted.includes('COMMUNITY')) {
    const answer = await publishedCommunities(database, {
      species: query.species ?? null,
      province: query.province ?? null,
      page: 1,
      pageSize: SOURCE_LIMIT,
    });
    for (const card of answer.items) {
      if (query.status === 'TRUSTED') continue;
      if (query.status === 'VERIFIED' && !card.registered) continue;
      if (!matchesTerm([card.nameFa, ...card.breedNamesFa, card.placeFa], term)) continue;
      results.push({
        kind: 'COMMUNITY',
        slug: card.slug,
        path: SEARCH_KIND_PATH.COMMUNITY + card.slug,
        titleFa: card.nameFa,
        subtitleFa: card.breedNamesFa.length > 0 ? card.breedNamesFa.join('، ') : null,
        placeFa: card.placeFa,
        tier: rankTier({
          promoted: promotedWhenRelevant(card.promoted, true),
          trusted: false,
          verified: card.registered,
          complete: card.complete,
        }),
        promoted: card.promoted,
        trusted: false,
        verified: card.registered,
      });
    }
  }

  // Breeds and content have no place, no licence and no package: they answer a
  // topical search and stay out of a geographic or professional one.
  if (wanted.includes('BREED')) {
    if (directoriesOnly) {
      skipped.push('نژادها با فیلتر جغرافیایی یا حرفه‌ای جست‌وجو نمی‌شوند.');
    } else {
      const [byName, everything] = await Promise.all([
        publishedBreeds(database, { term, page: 1, pageSize: SOURCE_LIMIT }),
        publishedBreeds(database, { page: 1, pageSize: SOURCE_LIMIT }),
      ]);
      const seen = new Set<string>();
      for (const card of [...byName.items, ...everything.items.filter((row) => matchesTerm([row.nameFa, row.nameEn, row.slug], term))]) {
        if (seen.has(card.slug)) continue;
        seen.add(card.slug);
        results.push({
          kind: 'BREED',
          slug: card.slug,
          path: SEARCH_KIND_PATH.BREED + card.slug,
          titleFa: card.nameFa,
          subtitleFa: card.groupNameFa,
          placeFa: null,
          tier: 'BASE',
          promoted: false,
          trusted: false,
          verified: false,
        });
      }
    }
  }

  for (const kind of ['ARTICLE', 'NEWS'] as const) {
    if (!wanted.includes(kind)) continue;
    if (directoriesOnly) {
      skipped.push(kind === 'ARTICLE' ? 'آموزش‌ها با فیلتر جغرافیایی یا حرفه‌ای جست‌وجو نمی‌شوند.' : 'اخبار با فیلتر جغرافیایی یا حرفه‌ای جست‌وجو نمی‌شوند.');
      continue;
    }
    const answer = await publicContentList(database, { kind, page: 1, pageSize: SOURCE_LIMIT }, now);
    for (const card of answer.items) {
      if (!matchesTerm([card.titleFa, card.summaryFa, card.categoryNameFa], term)) continue;
      results.push({
        kind,
        slug: card.slug,
        path: SEARCH_KIND_PATH[kind] + card.slug,
        titleFa: card.titleFa,
        subtitleFa: card.summaryFa,
        placeFa: null,
        tier: 'BASE',
        promoted: false,
        trusted: false,
        verified: false,
      });
    }
  }

  const totalByKind = Object.fromEntries(
    SEARCH_KINDS.map((kind) => [kind, results.filter((row) => row.kind === kind).length]),
  ) as Record<SearchKind, number>;

  const ordered = [...results].sort((a, b) => compareRanked({ tier: a.tier, nameFa: a.titleFa }, { tier: b.tier, nameFa: b.titleFa }));
  const request = { page: query.page, pageSize: query.pageSize ?? 20 };
  const items = ordered.slice(offsetOf(request), offsetOf(request) + request.pageSize);

  return {
    ...pageOf(items, ordered.length, request),
    totalByKind,
    rankingVersion: RANKING_VERSION,
    skippedKindsFa: [...new Set(skipped)],
  };
}
