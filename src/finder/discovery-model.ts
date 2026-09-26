/**
 * Discovery filters and ordering — PHASE-4 PROMPT-004. Pure.
 *
 * Filters arrive from a query string, so everything is parsed against a closed
 * vocabulary and a value that does not fit is dropped rather than passed on: a
 * hostile query string can narrow a search, never widen it or reach SQL.
 *
 * Ordering is keyset, not offset: the cursor carries the last sort key and id,
 * so a profile activated while someone pages cannot duplicate or skip a row.
 */
import { PUBLIC_STATES, type ProfileState } from './profile-model.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LAST_MATING_FILTERS = ['ANY', 'NONE', '90', '180', '365'] as const;
export type LastMatingFilter = (typeof LAST_MATING_FILTERS)[number];

export interface SearchFilters {
  readonly breedId: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly province: string | null;
  readonly city: string | null;
  readonly maxDistanceKm: number | null;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly pedigree: 'ANY' | 'YES' | 'NO';
  /** NONE: no confirmed mating at all; a number: no confirmed mating within that many days. */
  readonly lastMating: LastMatingFilter;
  readonly cooldown: 'ANY' | 'CLEAR';
  readonly ownerKind: 'ANY' | 'OWNER' | 'KENNEL';
  readonly availability: ProfileState | null;
  readonly minCompleteness: number;
  /** One of the viewer's own animals: match mode, forcing same breed and opposite sex. */
  readonly forAnimalId: string | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  breedId: null,
  sex: null,
  province: null,
  city: null,
  maxDistanceKm: null,
  minAgeMonths: null,
  maxAgeMonths: null,
  pedigree: 'ANY',
  lastMating: 'ANY',
  cooldown: 'ANY',
  ownerKind: 'ANY',
  availability: null,
  minCompleteness: 0,
  forAnimalId: null,
};

const int = (raw: unknown, min: number, max: number): number | null => {
  if (typeof raw !== 'string' || !/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
};
const text = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t === '' || t.length > 60 ? null : t;
};
const oneOf = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T =>
  typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

export function parseFilters(raw: Readonly<Record<string, unknown>>): SearchFilters {
  const availability = typeof raw.availability === 'string' && (PUBLIC_STATES as readonly string[]).includes(raw.availability)
    ? (raw.availability as ProfileState)
    : null;
  const sex = raw.sex === 'MALE' || raw.sex === 'FEMALE' ? raw.sex : null;
  return {
    breedId: typeof raw.breed === 'string' && UUID.test(raw.breed) ? raw.breed : null,
    sex,
    province: text(raw.province),
    city: text(raw.city),
    maxDistanceKm: int(raw.distance, 5, 2000),
    minAgeMonths: int(raw.minAge, 0, 300),
    maxAgeMonths: int(raw.maxAge, 0, 300),
    pedigree: oneOf(raw.pedigree, ['ANY', 'YES', 'NO'] as const, 'ANY'),
    lastMating: oneOf(raw.lastMating, LAST_MATING_FILTERS, 'ANY'),
    cooldown: oneOf(raw.cooldown, ['ANY', 'CLEAR'] as const, 'ANY'),
    ownerKind: oneOf(raw.ownerKind, ['ANY', 'OWNER', 'KENNEL'] as const, 'ANY'),
    availability,
    minCompleteness: int(raw.completeness, 0, 5) ?? 0,
    forAnimalId: typeof raw.for === 'string' && UUID.test(raw.for) ? raw.for : null,
  };
}

/** The same filters as query parameters, for links and for a saved search. */
export function filtersToQuery(f: SearchFilters): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.breedId) q.breed = f.breedId;
  if (f.sex) q.sex = f.sex;
  if (f.province) q.province = f.province;
  if (f.city) q.city = f.city;
  if (f.maxDistanceKm !== null) q.distance = String(f.maxDistanceKm);
  if (f.minAgeMonths !== null) q.minAge = String(f.minAgeMonths);
  if (f.maxAgeMonths !== null) q.maxAge = String(f.maxAgeMonths);
  if (f.pedigree !== 'ANY') q.pedigree = f.pedigree;
  if (f.lastMating !== 'ANY') q.lastMating = f.lastMating;
  if (f.cooldown !== 'ANY') q.cooldown = f.cooldown;
  if (f.ownerKind !== 'ANY') q.ownerKind = f.ownerKind;
  if (f.availability) q.availability = f.availability;
  if (f.minCompleteness > 0) q.completeness = String(f.minCompleteness);
  if (f.forAnimalId) q.for = f.forAnimalId;
  return q;
}

// ── keyset ordering ──────────────────────────────────────────────────────────

export interface Sortable {
  readonly profileId: string;
  /** Higher first: the compatibility score in match mode, activation time otherwise. */
  readonly sortKey: number;
}

export interface Cursor {
  readonly k: number;
  readonly id: string;
}

export const compareSortable = (a: Sortable, b: Sortable): number =>
  b.sortKey !== a.sortKey ? b.sortKey - a.sortKey : a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0;

export function encodeCursor(item: Sortable): string {
  return Buffer.from(JSON.stringify({ k: item.sortKey, id: item.profileId })).toString('base64url');
}

export function decodeCursor(raw: unknown): Cursor | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { k?: unknown; id?: unknown };
    if (typeof parsed.k !== 'number' || !Number.isFinite(parsed.k) || typeof parsed.id !== 'string' || !UUID.test(parsed.id)) return null;
    return { k: parsed.k, id: parsed.id };
  } catch {
    return null;
  }
}

/** One page after the cursor, in the stable order, plus the cursor for the next page. */
export function pageAfter<T extends Sortable>(items: readonly T[], cursor: Cursor | null, size: number): { page: T[]; next: string | null } {
  const sorted = [...items].sort(compareSortable);
  const start = cursor === null ? 0 : sorted.findIndex((item) => compareSortable(item, { profileId: cursor.id, sortKey: cursor.k }) > 0);
  const from = start < 0 ? sorted.length : start;
  const page = sorted.slice(from, from + size);
  const more = from + size < sorted.length;
  return { page, next: more && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null };
}
