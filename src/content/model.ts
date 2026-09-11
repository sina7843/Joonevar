/**
 * CMS rules that need no database — Requirements-Phase-2 §12, §19, §22 (PROMPT-004).
 *
 * Who may create which type, which status moves each role may make, when a
 * reason is required, what must be written before publishing, and what the
 * public sees at a given moment. Scheduling has no scheduler: a published item
 * with a future `publishAt` simply is not visible yet (DEC-0159).
 */
import { isHttpUrl, normalizeForSearch, unifyPersianLetters } from '../breeds/model.ts';

export const CONTENT_KINDS = ['ARTICLE', 'NEWS', 'ANNOUNCEMENT', 'CLUB_POST'] as const;
export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED', 'DELETED'] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type ContentRole = 'AUTHOR' | 'CONTENT_ADMIN';

export interface ContentSource {
  readonly title: string;
  readonly url: string | null;
}

export const KIND_FA: Record<ContentKind, string> = {
  ARTICLE: 'آموزش',
  NEWS: 'خبر',
  ANNOUNCEMENT: 'اطلاعیه',
  CLUB_POST: 'نوشته کلاب',
};

export const KIND_PLURAL_FA: Record<ContentKind, string> = {
  ARTICLE: 'آموزش‌ها',
  NEWS: 'اخبار',
  ANNOUNCEMENT: 'اطلاعیه‌ها',
  CLUB_POST: 'نوشته‌های کلاب',
};

/** Public list address of each type. A club post lives under its club (PROMPT-010). */
export const KIND_PATH: Record<ContentKind, string | null> = {
  ARTICLE: '/articles',
  NEWS: '/news',
  ANNOUNCEMENT: '/announcements',
  CLUB_POST: null,
};

export const STATUS_FA: Record<ContentStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  HIDDEN: 'پنهان‌شده توسط ادمین محتوا',
  ARCHIVED: 'بایگانی‌شده',
  DELETED: 'حذف‌شده',
};

export const isContentKind = (value: unknown): value is ContentKind =>
  typeof value === 'string' && (CONTENT_KINDS as readonly string[]).includes(value);
export const isContentStatus = (value: unknown): value is ContentStatus =>
  typeof value === 'string' && (CONTENT_STATUSES as readonly string[]).includes(value);

// ── Who may do what ───────────────────────────────────────────────────────

/**
 * An author writes education and news; announcements speak for the platform, so
 * they belong to the content admin. A club post needs a club, and clubs arrive in
 * PROMPT-010 — until then nobody can create one (DEC-0158).
 */
const CREATABLE: Record<ContentRole, readonly ContentKind[]> = {
  AUTHOR: ['ARTICLE', 'NEWS'],
  CONTENT_ADMIN: ['ARTICLE', 'NEWS', 'ANNOUNCEMENT'],
};

export const creatableKinds = (role: ContentRole): readonly ContentKind[] => CREATABLE[role];

type Move = readonly [ContentStatus, ContentStatus];

const AUTHOR_MOVES: readonly Move[] = [
  ['DRAFT', 'PUBLISHED'],
  ['PUBLISHED', 'DRAFT'],
  ['PUBLISHED', 'ARCHIVED'],
  ['ARCHIVED', 'PUBLISHED'],
  ['DRAFT', 'DELETED'],
  ['ARCHIVED', 'DELETED'],
];

const ADMIN_MOVES: readonly Move[] = [
  ...AUTHOR_MOVES,
  ['PUBLISHED', 'DELETED'],
  ['DRAFT', 'HIDDEN'],
  ['PUBLISHED', 'HIDDEN'],
  ['ARCHIVED', 'HIDDEN'],
  ['HIDDEN', 'DRAFT'],
  ['HIDDEN', 'PUBLISHED'],
  ['HIDDEN', 'DELETED'],
  ['DELETED', 'DRAFT'],
];

/**
 * Status moves open to this role on this item. An author acts only on their own
 * content, and not at all once the content admin has hidden or deleted it — a
 * moderation decision is not undone by the person it was about.
 */
export function allowedMoves(role: ContentRole, from: ContentStatus, isOwner: boolean): ContentStatus[] {
  if (role === 'AUTHOR' && (!isOwner || from === 'HIDDEN' || from === 'DELETED')) return [];
  const moves = role === 'CONTENT_ADMIN' ? ADMIN_MOVES : AUTHOR_MOVES;
  return moves.filter(([source]) => source === from).map(([, target]) => target);
}

/** A sensitive move carries its reason into the audit history. */
export function reasonRequired(role: ContentRole, from: ContentStatus, to: ContentStatus, isOwner: boolean): boolean {
  if (role === 'CONTENT_ADMIN' && !isOwner) return true;
  return ['HIDDEN', 'DELETED', 'ARCHIVED'].includes(to) || from === 'HIDDEN' || from === 'DELETED';
}

export function canEditContent(role: ContentRole, status: ContentStatus, isOwner: boolean): boolean {
  if (status === 'DELETED') return false;
  if (role === 'CONTENT_ADMIN') return true;
  return isOwner && status !== 'HIDDEN';
}

// ── Publication ───────────────────────────────────────────────────────────

export type PublicState = 'VISIBLE' | 'ARCHIVED' | 'SCHEDULED' | 'NOT_PUBLIC';

/** What the public sees of an item at `now`. */
export function publicState(item: { status: ContentStatus; publishAt: Date | null }, now: Date): PublicState {
  if (item.status === 'ARCHIVED') return 'ARCHIVED';
  if (item.status !== 'PUBLISHED' || item.publishAt === null) return 'NOT_PUBLIC';
  return item.publishAt.getTime() > now.getTime() ? 'SCHEDULED' : 'VISIBLE';
}

/** A publish takes effect now or at a future moment; it cannot be backdated. */
export function effectivePublishAt(requested: Date | null, now: Date): Date {
  return requested !== null && requested.getTime() > now.getTime() ? requested : now;
}

const hasText = (value: string | null | undefined): boolean => value !== null && value !== undefined && value.trim() !== '';

/**
 * What must be written before an item goes public. Education (آموزش) is where a
 * reader acts on what they read about an animal's health and care, so it needs
 * at least one source and a review date (§12, DEC-0159); news and announcements
 * are dated statements and need neither.
 */
export function publishBlockers(item: {
  kind: ContentKind;
  titleFa: string;
  summaryFa: string;
  bodyFa: string;
  sources: readonly ContentSource[];
  reviewedOn: string | null;
}): string[] {
  const problems: string[] = [];
  if (!hasText(item.titleFa)) problems.push('عنوان را بنویسید.');
  if (!hasText(item.summaryFa)) problems.push('خلاصه را بنویسید.');
  if (!hasText(item.bodyFa)) problems.push('متن را بنویسید.');
  if (item.kind === 'ARTICLE') {
    if (item.sources.length === 0) problems.push('آموزش بدون منبع منتشر نمی‌شود؛ دست‌کم یک منبع وارد کنید.');
    if (!hasText(item.reviewedOn)) problems.push('تاریخ بازبینی آموزش را وارد کنید.');
  }
  return problems;
}

// ── Text fields ───────────────────────────────────────────────────────────

const SLUG = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

/** A readable address from a title, in Persian or latin: «مراقبت از توله» → `مراقبت-از-توله`. */
export function contentSlugify(title: string): string {
  return unifyPersianLetters(title.normalize('NFKC').replace(/\p{M}/gu, '').toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export function isValidContentSlug(value: string): boolean {
  return value.length <= 80 && SLUG.test(value) && value === value.toLowerCase() && value === unifyPersianLetters(value);
}

/** Sources from a textarea: one per line, `title | https://…` or just a title. */
export function parseSources(raw: string): { sources: ContentSource[]; problems: string[] } {
  const sources: ContentSource[] = [];
  const problems: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    const [titlePart = '', ...rest] = line.split('|');
    const title = titlePart.trim();
    const url = rest.join('|').trim();
    if (title === '') {
      problems.push('هر منبع عنوان لازم دارد.');
      continue;
    }
    if (url !== '' && !isHttpUrl(url)) {
      problems.push('پیوند منبع «' + title + '» باید http یا https باشد.');
      continue;
    }
    sources.push({ title: title.slice(0, 300), url: url === '' ? null : url });
  }
  return { sources, problems };
}

export const formatSources = (sources: readonly ContentSource[]): string =>
  sources.map((source) => (source.url ? source.title + ' | ' + source.url : source.title)).join('\n');

/** Tags from a comma or line separated field: trimmed, de-duplicated, at most ten short tags. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(/[\n,،]/)) {
    const tag = part.trim().slice(0, 40);
    const key = normalizeForSearch(tag);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 10) break;
  }
  return tags;
}

// ── Panels and display ────────────────────────────────────────────────────

export type ContentPanel = 'author' | 'content';

export const PANEL_BASE: Record<ContentPanel, string> = { author: '/author', content: '/content' };

export const editorPathFor = (panel: ContentPanel, contentId: string): string =>
  (panel === 'author' ? '/author/content/' : '/content/') + contentId;

export const PUBLIC_STATE_FA: Record<PublicState, string> = {
  VISIBLE: 'در سایت دیده می‌شود',
  SCHEDULED: 'زمان‌بندی‌شده',
  ARCHIVED: 'بایگانی؛ نشانی باز است',
  NOT_PUBLIC: 'در سایت دیده نمی‌شود',
};

export const MOVE_FA: Record<ContentStatus, string> = {
  PUBLISHED: 'انتشار',
  DRAFT: 'برگرداندن به پیش‌نویس',
  ARCHIVED: 'بایگانی',
  HIDDEN: 'پنهان‌کردن',
  DELETED: 'حذف (قابل بازگردانی)',
};

const INSTANT_FA = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tehran',
});

/** A moment in Iran time, as people read it. */
export const formatInstantFa = (value: Date): string => INSTANT_FA.format(value);

export const TEAM_BYLINE = 'تیم همزیست';

/**
 * The public name on a piece of content. An author's display name appears only
 * when they have chosen to show it; otherwise the platform signs it (§20
 * minimising personal data, DEC-0159).
 */
export function bylineFor(profile: { displayName: string | null; displayNameVisible: boolean } | null): string {
  const name = profile?.displayName?.trim() ?? '';
  return profile?.displayNameVisible && name !== '' ? name : TEAM_BYLINE;
}
