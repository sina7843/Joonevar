/**
 * Breed bank rules that need no database — Requirements-Phase-2 §6, §16, §19, §23.
 *
 * The attribute lists are closed on purpose (DEC-0154): a breed's size, coat or
 * energy is one of a few values a person can filter by, not a sentence someone
 * typed. Persian labels live here so every screen names a value the same way.
 */
export const BREED_SIZES = ['TOY', 'SMALL', 'MEDIUM', 'LARGE', 'GIANT'] as const;
export const BREED_COATS = ['HAIRLESS', 'SHORT', 'MEDIUM', 'LONG', 'WIRE', 'CURLY'] as const;
export const BREED_LEVELS = ['LOW', 'MODERATE', 'HIGH'] as const;
export const BREED_PROFILE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const BREED_CLAIM_KINDS = ['HEALTH_NOTE', 'PREDISPOSED_CONDITION', 'SUGGESTED_GENETIC_TEST'] as const;

export type BreedSize = (typeof BREED_SIZES)[number];
export type BreedCoat = (typeof BREED_COATS)[number];
export type BreedLevel = (typeof BREED_LEVELS)[number];
export type BreedProfileStatus = (typeof BREED_PROFILE_STATUSES)[number];
export type BreedClaimKind = (typeof BREED_CLAIM_KINDS)[number];

export const SIZE_FA: Record<BreedSize, string> = {
  TOY: 'خیلی کوچک',
  SMALL: 'کوچک',
  MEDIUM: 'متوسط',
  LARGE: 'بزرگ',
  GIANT: 'خیلی بزرگ',
};

export const COAT_FA: Record<BreedCoat, string> = {
  HAIRLESS: 'بدون مو',
  SHORT: 'کوتاه',
  MEDIUM: 'متوسط',
  LONG: 'بلند',
  WIRE: 'زبر',
  CURLY: 'فرفری',
};

export const LEVEL_FA: Record<BreedLevel, string> = { LOW: 'کم', MODERATE: 'متوسط', HIGH: 'زیاد' };

export const STATUS_FA: Record<BreedProfileStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  ARCHIVED: 'بایگانی‌شده',
};

export const CLAIM_KIND_FA: Record<BreedClaimKind, string> = {
  HEALTH_NOTE: 'نکته سلامت',
  PREDISPOSED_CONDITION: 'بیماری‌های مستعد',
  SUGGESTED_GENETIC_TEST: 'آزمایش‌های ژنتیکی پیشنهادی',
};

/** Level-valued attributes, in the order a profile shows them. */
export const LEVEL_ATTRIBUTES = [
  { key: 'energy', labelFa: 'انرژی' },
  { key: 'trainability', labelFa: 'آموزش‌پذیری' },
  { key: 'careNeed', labelFa: 'نیاز نگهداری' },
  { key: 'withChildren', labelFa: 'سازگاری با کودکان' },
  { key: 'withOtherAnimals', labelFa: 'سازگاری با حیوانات دیگر' },
] as const;

export type LevelAttribute = (typeof LEVEL_ATTRIBUTES)[number]['key'];

export const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

// ── Addresses ─────────────────────────────────────────────────────────────

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidSlug = (value: string): boolean => value.length <= 80 && SLUG_PATTERN.test(value);

/** A latin address from the English name: `German Shepherd` → `german-shepherd`. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

// ── Search ────────────────────────────────────────────────────────────────

// Built from code points: these letters look identical to their Persian
// counterparts and the joiners are invisible, so literals would be unreviewable.
const cp = (...codes: number[]) => String.fromCharCode(...codes);
const ARABIC_YEH = new RegExp('[' + cp(0x064a, 0x0649) + ']', 'g');
const ARABIC_KAF = new RegExp(cp(0x0643), 'g');
const IGNORED_MARKS = new RegExp(
  '[' + cp(0x200c, 0x200d, 0x0640, 0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0670) + ']',
  'g',
);
const PERSIAN_DIGITS = new RegExp('[' + cp(0x06f0) + '-' + cp(0x06f9) + cp(0x0660) + '-' + cp(0x0669) + ']', 'g');

/**
 * One spelling for comparison: Arabic yeh and kaf become Persian, joiners,
 * tatweel and short vowels disappear, Persian digits become latin, and case,
 * spaces and punctuation stop mattering — so «ژرمن شپرد», «ژرمن‌شپرد» and
 * «german-shepherd» meet. Typo tolerance is PROMPT-012's search.
 */
/** Arabic yeh and kaf written as their Persian letters, so one word has one spelling. */
export function unifyPersianLetters(value: string): string {
  return value.replace(ARABIC_YEH, cp(0x06cc)).replace(ARABIC_KAF, cp(0x06a9));
}

export function normalizeForSearch(value: string): string {
  return unifyPersianLetters(value.normalize('NFKC').toLowerCase())
    .replace(IGNORED_MARKS, '')
    .replace(PERSIAN_DIGITS, (digit) => String((digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)) % 10))
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export interface SearchableBreed {
  readonly nameFa: string;
  readonly nameEn: string;
  readonly slug: string;
  readonly altNames: readonly string[];
}

export function matchesBreedSearch(breed: SearchableBreed, term: string): boolean {
  const needle = normalizeForSearch(term);
  if (needle === '') return true;
  return [breed.nameFa, breed.nameEn, breed.slug, ...breed.altNames].some((name) =>
    normalizeForSearch(name).includes(needle),
  );
}

/** Alternative names from a textarea: one per line, trimmed, no blanks or repeats. */
export function parseAltNames(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of raw.split(/[\n،,]/)) {
    const name = line.trim();
    const key = normalizeForSearch(name);
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// ── Facts ─────────────────────────────────────────────────────────────────

const REGION_FA = new Intl.DisplayNames(['fa'], { type: 'region' });

/** Persian name of an ISO 3166-1 alpha-2 code, or null for anything the platform does not know. */
export function countryNameFa(code: string): string | null {
  if (!/^[A-Z]{2}$/.test(code)) return null;
  try {
    const name = REGION_FA.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** A review date is a real calendar day that has already happened. */
export function isReviewDate(value: string, today: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value && day.getTime() <= today.getTime();
}

// ── Publication ───────────────────────────────────────────────────────────

const TRANSITIONS: Record<BreedProfileStatus, readonly BreedProfileStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: ['PUBLISHED'],
};

export const canTransition = (from: BreedProfileStatus, to: BreedProfileStatus): boolean =>
  TRANSITIONS[from].includes(to);

/**
 * A breed page goes public only with written content. §19 keeps thin pages out
 * of the index; a page that is nothing but a name is exactly that.
 */
export function publishBlockers(breed: { historyFa: string | null; standardFa: string | null }): string[] {
  const hasText = (value: string | null) => value !== null && value.trim() !== '';
  return hasText(breed.historyFa) || hasText(breed.standardFa)
    ? []
    : ['پیش از انتشار، تاریخچه یا خلاصه استاندارد نژاد را بنویسید.'];
}
