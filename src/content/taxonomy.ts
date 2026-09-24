/**
 * The baseline content taxonomy — Phase 2.5 §9 (PROMPT-014).
 *
 * Until now a category existed only if a content admin typed it, so a fresh
 * database had no way to file anything and two deployments could disagree about
 * what "آموزش‌های شجره‌نامه" is called. These are the categories the phase asks
 * for, written once, seeded like every other taxonomy: a missing one is added,
 * an existing one is never renamed, re-activated or removed, because an admin
 * who changed it made a decision (§23).
 *
 * Categories are scoped per content kind, so the same subject appears under the
 * kind that actually publishes it rather than once globally.
 */
import type { ContentKind } from './model.ts';

export interface ContentCategorySeed {
  readonly kind: ContentKind;
  readonly slug: string;
  readonly nameFa: string;
  readonly sortOrder: number;
  /**
   * Set where the subject is somebody else's registered name. Material filed
   * here is educational and must carry its own sources; the public page says so
   * in the club's own words rather than implying a relationship that does not
   * exist.
   */
  readonly attribution?: 'EXTERNAL_BODY';
}

/** A category whose subject belongs to an outside organisation (KC, AKC). */
export const EXTERNAL_BODY_SLUGS = ['the-kennel-club', 'american-kennel-club'] as const;

/**
 * What the reader is told on material about an outside organisation. Hamzist
 * describes such a body, links to its own published material and copies none of
 * it; no affiliation, endorsement or representation is claimed.
 */
export const EXTERNAL_BODY_NOTICE_FA =
  'این مطلب آموزشی است و با استناد به منابع اعلام‌شده نوشته شده است. همزیست نماینده این سازمان نیست، با آن وابستگی رسمی ندارد و متن استاندارد یا محتوای حفاظت‌شده آن را بازنشر نمی‌کند؛ برای متن رسمی به منبع مراجعه کنید.';

export const CONTENT_CATEGORY_SEED: readonly ContentCategorySeed[] = [
  // ── آموزش‌ها (ARTICLE) — the educational library the phase asks for ──────
  { kind: 'ARTICLE', slug: 'amuzesh-samaneh', nameFa: 'آموزش کار با سامانه', sortOrder: 10 },
  { kind: 'ARTICLE', slug: 'shajarenameh', nameFa: 'شجره‌نامه', sortOrder: 20 },
  { kind: 'ARTICLE', slug: 'barge-sabti', nameFa: 'برگه ثبتی', sortOrder: 30 },
  { kind: 'ARTICLE', slug: 'microchip', nameFa: 'میکروچیپ', sortOrder: 40 },
  { kind: 'ARTICLE', slug: 'mojavez-jofgiri', nameFa: 'مجوز جفت‌گیری', sortOrder: 50 },
  { kind: 'ARTICLE', slug: 'parentage-test', nameFa: 'تست اصالت نسب', sortOrder: 60 },
  { kind: 'ARTICLE', slug: 'nezhadhaye-sag', nameFa: 'نژادهای سگ', sortOrder: 70 },
  { kind: 'ARTICLE', slug: 'damepezeshk-motamad', nameFa: 'دامپزشک معتمد', sortOrder: 80 },
  { kind: 'ARTICLE', slug: 'bimarestan-va-klinik', nameFa: 'بیمارستان و کلینیک دامپزشکی', sortOrder: 90 },
  { kind: 'ARTICLE', slug: 'anjoman', nameFa: 'انجمن', sortOrder: 100 },
  { kind: 'ARTICLE', slug: 'club', nameFa: 'کلاب', sortOrder: 110 },
  { kind: 'ARTICLE', slug: 'the-kennel-club', nameFa: 'The Kennel Club', sortOrder: 120, attribution: 'EXTERNAL_BODY' },
  { kind: 'ARTICLE', slug: 'american-kennel-club', nameFa: 'American Kennel Club', sortOrder: 130, attribution: 'EXTERNAL_BODY' },

  // ── اخبار (NEWS) ─────────────────────────────────────────────────────────
  { kind: 'NEWS', slug: 'akhbar-anjoman', nameFa: 'اخبار انجمن', sortOrder: 10 },
  { kind: 'NEWS', slug: 'akhbar-club', nameFa: 'اخبار کلاب‌ها', sortOrder: 20 },
  { kind: 'NEWS', slug: 'akhbar-damepezeshki', nameFa: 'اخبار دامپزشکی', sortOrder: 30 },
  { kind: 'NEWS', slug: 'akhbar-nezhadha', nameFa: 'اخبار نژادها', sortOrder: 40 },

  // ── اطلاعیه‌ها (ANNOUNCEMENT) ────────────────────────────────────────────
  { kind: 'ANNOUNCEMENT', slug: 'etelaiye-anjoman', nameFa: 'اطلاعیه‌های انجمن', sortOrder: 10 },
  { kind: 'ANNOUNCEMENT', slug: 'etelaiye-samaneh', nameFa: 'اطلاعیه‌های سامانه', sortOrder: 20 },
  { kind: 'ANNOUNCEMENT', slug: 'etelaiye-club', nameFa: 'اطلاعیه‌های کلاب‌ها', sortOrder: 30 },
];

/** Raising this ships a new category on the next seed run, with no migration. */
export const CONTENT_CATEGORY_VERSION = 1;

export const isExternalBodyCategory = (slug: string | null | undefined): boolean =>
  slug !== null && slug !== undefined && (EXTERNAL_BODY_SLUGS as readonly string[]).includes(slug);

/**
 * Material about an outside body has to name where it came from. The editor
 * already requires sources on an article; this says it in the category's own
 * terms, so the rule is visible where the subject is chosen.
 */
export function externalBodyProblem(input: { categorySlug: string | null; sourceCount: number }): string | null {
  if (!isExternalBodyCategory(input.categorySlug)) return null;
  if (input.sourceCount > 0) return null;
  return 'مطلب درباره این سازمان باید دست‌کم یک منبع داشته باشد؛ بدون منبع منتشر نمی‌شود.';
}

/** The categories of one kind, in the order they were written. */
export const seedCategoriesOf = (kind: ContentKind): readonly ContentCategorySeed[] =>
  CONTENT_CATEGORY_SEED.filter((entry) => entry.kind === kind);
