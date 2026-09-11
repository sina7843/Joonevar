/**
 * Association and club rules that need no database — Requirements-Phase-2 §11,
 * §19, §22 (PROMPT-010).
 *
 * The two kinds share a profile but never share their rules: only a club has
 * posts, and only when the superadmin has granted that permission; only an
 * association records a registration number. Membership itself is not managed
 * here — the profile says how to join and the community keeps its own register
 * (DEC-0170).
 */
export const COMMUNITY_KINDS = ['ASSOCIATION', 'CLUB'] as const;
export type CommunityKind = (typeof COMMUNITY_KINDS)[number];

export const COMMUNITY_KIND_FA: Record<CommunityKind, string> = {
  ASSOCIATION: 'انجمن',
  CLUB: 'کلاب',
};

export const COMMUNITY_SCOPES = ['NATIONAL', 'PROVINCIAL', 'CITY', 'BREED', 'SPORT', 'OTHER'] as const;
export type CommunityScope = (typeof COMMUNITY_SCOPES)[number];

export const COMMUNITY_SCOPE_FA: Record<CommunityScope, string> = {
  NATIONAL: 'کشوری',
  PROVINCIAL: 'استانی',
  CITY: 'شهری',
  BREED: 'نژادی',
  SPORT: 'ورزشی',
  OTHER: 'سایر',
};

export const COMMUNITY_EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export type CommunityEventStatus = (typeof COMMUNITY_EVENT_STATUSES)[number];

export const EVENT_STATUS_FA: Record<CommunityEventStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  CANCELLED: 'لغوشده',
};

export const MANAGER_STATUS_FA: Record<string, string> = {
  INVITED: 'در انتظار پذیرش',
  ACCEPTED: 'تأییدشده',
  DECLINED: 'ردشده',
  REMOVED: 'برداشته‌شده',
};

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isCommunityKind = oneOf(COMMUNITY_KINDS);
export const isCommunityScope = oneOf(COMMUNITY_SCOPES);
export const isEventStatus = oneOf(COMMUNITY_EVENT_STATUSES);

/** A scope that names a place must name one; a breed scope must name a breed (§11). */
export function scopeProblem(input: {
  scope: CommunityScope;
  provinceCode: string | null;
  cityId: string | null;
  breedCount: number;
}): string | null {
  if (input.scope === 'PROVINCIAL' && input.provinceCode === null) return 'برای حوزه استانی، استان را انتخاب کنید.';
  if (input.scope === 'CITY' && input.cityId === null) return 'برای حوزه شهری، شهر را انتخاب کنید.';
  if (input.scope === 'BREED' && input.breedCount === 0) return 'برای حوزه نژادی، دست‌کم یک نژاد را انتخاب کنید.';
  return null;
}

/**
 * Only a club publishes its own posts, and only with the permission the
 * superadmin granted. An association's news is written in the CMS like any
 * other news (§11).
 */
export function postingProblem(input: { kind: CommunityKind; canPublishPosts: boolean }): string | null {
  if (input.kind !== 'CLUB') return 'فقط کلاب می‌تواند نوشته منتشر کند؛ خبر انجمن از مسیر محتوای همزیست منتشر می‌شود.';
  if (!input.canPublishPosts) return 'انتشار مستقیم نوشته برای این کلاب فعال نشده است؛ مجوز آن را ادمین می‌دهد.';
  return null;
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A Gregorian date is unusable if its year is one nobody holds an event in: a
 * Jamali year typed into this field (1405-01-01) parses as a real Gregorian
 * date, so the year range is what actually catches it.
 */
const unusable = (value: string): boolean => Number.isNaN(Date.parse(value)) || Number(value.slice(0, 4)) < 1900;

/** A date the community actually recorded. Nothing is guessed or shifted here. */
export function eventDateProblem(startsOn: string | null, endsOn: string | null): string | null {
  if (startsOn === null || !CIVIL_DATE.test(startsOn)) return 'تاریخ شروع رویداد را به شکل ۲۰۲۶-۰۳-۲۱ بنویسید.';
  if (unusable(startsOn)) return 'تاریخ شروع رویداد معتبر نیست؛ تاریخ میلادی بنویسید.';
  if (endsOn !== null) {
    if (!CIVIL_DATE.test(endsOn) || unusable(endsOn)) return 'تاریخ پایان رویداد معتبر نیست؛ تاریخ میلادی بنویسید.';
    if (endsOn < startsOn) return 'تاریخ پایان رویداد نمی‌تواند پیش از تاریخ شروع باشد.';
  }
  return null;
}

/** An event is upcoming while its last day has not passed; read at request time, with no scheduler. */
export const isUpcoming = (event: { startsOn: string; endsOn: string | null }, today: string): boolean =>
  (event.endsOn ?? event.startsOn) >= today;

export interface CommunityCompletenessInput {
  readonly aboutFa: string | null;
  readonly contact: string | null;
  readonly membershipInfoFa: string | null;
  readonly speciesCount: number;
  readonly breedCount: number;
  readonly acceptedManagers: number;
  readonly publishedEvents: number;
  readonly scopePlaceSet: boolean;
}

const ITEMS: ReadonlyArray<{ labelFa: string; done: (input: CommunityCompletenessInput) => boolean }> = [
  { labelFa: 'معرفی', done: (i) => hasText(i.aboutFa) },
  { labelFa: 'راه ارتباطی', done: (i) => hasText(i.contact) },
  { labelFa: 'شرایط عضویت', done: (i) => hasText(i.membershipInfoFa) },
  { labelFa: 'حوزه مشخص', done: (i) => i.scopePlaceSet },
  { labelFa: 'گونه یا نژاد مرتبط', done: (i) => i.speciesCount + i.breedCount > 0 },
  { labelFa: 'دست‌کم یک مدیر تأییدشده', done: (i) => i.acceptedManagers > 0 },
  { labelFa: 'دست‌کم یک رویداد منتشرشده', done: (i) => i.publishedEvents > 0 },
];

function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== '';
}

export function communityCompleteness(input: CommunityCompletenessInput): {
  done: number;
  total: number;
  missing: string[];
  complete: boolean;
} {
  const missing = ITEMS.filter((item) => !item.done(input)).map((item) => item.labelFa);
  return { done: ITEMS.length - missing.length, total: ITEMS.length, missing, complete: missing.length === 0 };
}

/** A page goes public when a visitor learns who this is and how to reach them (§19). */
export function communityPublishBlockers(input: CommunityCompletenessInput): string[] {
  const problems: string[] = [];
  if (!hasText(input.aboutFa)) problems.push('پیش از انتشار، معرفی را بنویسید.');
  if (!hasText(input.contact)) problems.push('پیش از انتشار، یک راه ارتباطی ثبت کنید.');
  return problems;
}

/** The registration a visitor may read: only what a reviewer recorded (§11). */
export const publicRegistration = (
  licenceStatus: string,
  registrationNumber: string | null,
): { statusFa: string; number: string | null } | null =>
  licenceStatus === 'NONE' && !hasText(registrationNumber)
    ? null
    : {
        statusFa: { NONE: 'ثبت‌نشده', VALID: 'معتبر', EXPIRED: 'منقضی', REVOKED: 'باطل‌شده' }[licenceStatus] ?? licenceStatus,
        number: hasText(registrationNumber) ? registrationNumber!.trim() : null,
      };
