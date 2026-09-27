/**
 * Mating profile — pure rules (PHASE-4 PROMPT-003).
 *
 * Who may activate, which state may follow which, what is public, how old an
 * animal is, whether a breed rule's age or cooldown applies, and how the last
 * mating is written in Persian. No database here; the services load the facts
 * and these decide.
 */
import { addCalendarMonths, addDays, compareCivilDates, formatCivilDateFa, parseCivilDate, type CivilDate } from '../domain/calendar.ts';

// ── Lifecycle ────────────────────────────────────────────────────────────────

export const LIFE_EVENT_KINDS = ['DECEASED', 'MISSING', 'FOUND', 'ARCHIVED', 'RESTORED'] as const;
export type LifeEventKind = (typeof LIFE_EVENT_KINDS)[number];
export type LifeStatus = 'ACTIVE' | 'DECEASED' | 'MISSING' | 'ARCHIVED';

export const LIFE_EVENT_FA: Record<LifeEventKind, string> = {
  DECEASED: 'فوت',
  MISSING: 'مفقود شدن',
  FOUND: 'پیدا شدن',
  ARCHIVED: 'بایگانی',
  RESTORED: 'خروج از بایگانی',
};

export const LIFE_STATUS_FA: Record<LifeStatus, string> = {
  ACTIVE: 'فعال',
  DECEASED: 'فوت‌شده',
  MISSING: 'مفقود',
  ARCHIVED: 'بایگانی‌شده',
};

export const isLifeEventKind = (value: unknown): value is LifeEventKind =>
  typeof value === 'string' && (LIFE_EVENT_KINDS as readonly string[]).includes(value);

/** The current life status is the effect of the newest event; events are passed oldest first. */
export function lifeStatus(kindsOldestFirst: readonly LifeEventKind[]): LifeStatus {
  let status: LifeStatus = 'ACTIVE';
  for (const kind of kindsOldestFirst) status = nextLifeStatus(status, kind) ?? status;
  return status;
}

function nextLifeStatus(current: LifeStatus, kind: LifeEventKind): LifeStatus | null {
  if (current === 'DECEASED') return null;
  switch (kind) {
    case 'DECEASED':
      return 'DECEASED';
    case 'MISSING':
      return current === 'ACTIVE' ? 'MISSING' : null;
    case 'FOUND':
      return current === 'MISSING' ? 'ACTIVE' : null;
    case 'ARCHIVED':
      return current === 'ACTIVE' ? 'ARCHIVED' : null;
    case 'RESTORED':
      return current === 'ARCHIVED' ? 'ACTIVE' : null;
  }
}

/** Null when the event may be recorded now; otherwise why not. Death is final. */
export function lifeEventProblem(current: LifeStatus, kind: LifeEventKind): string | null {
  if (nextLifeStatus(current, kind) !== null) return null;
  if (current === 'DECEASED') return 'فوت این حیوان ثبت شده است و رویداد دیگری پذیرفته نمی‌شود.';
  return 'این رویداد با وضعیت فعلی حیوان (' + LIFE_STATUS_FA[current] + ') سازگار نیست.';
}

// ── Profile states ───────────────────────────────────────────────────────────

export const PROFILE_STATES = ['INACTIVE', 'READY', 'TEMPORARILY_UNAVAILABLE', 'INVITE_ONLY', 'COORDINATING', 'MATCH_SELECTED'] as const;
export type ProfileState = (typeof PROFILE_STATES)[number];

export const PROFILE_STATE_FA: Record<ProfileState, string> = {
  INACTIVE: 'غیرفعال',
  READY: 'آماده دریافت درخواست',
  TEMPORARILY_UNAVAILABLE: 'موقتاً غیرفعال',
  INVITE_ONLY: 'فقط با دعوت',
  COORDINATING: 'در حال هماهنگی',
  MATCH_SELECTED: 'جفت انتخاب‌شده',
};

export const DEACTIVATION_FA: Record<string, string> = {
  OWNER: 'غیرفعال‌شده توسط مالک',
  TRANSFER: 'مالکیت حیوان منتقل شد؛ مالک تازه باید دوباره فعال کند',
  LIFE_EVENT: 'رویداد فوت، مفقودی یا بایگانی ثبت شد',
  IDENTITY_CHANGE: 'اطلاعات هویتی حساس تغییر کرد؛ پیش از فعال‌سازی دوباره بررسی کنید',
  MODERATION: 'توسط مدیریت از جفت‌یابی خارج شد',
  SUBSCRIPTION_ENDED: 'اشتراک پایان یافت و این پروفایل بیش از ظرفیت رایگان بود',
  SUSPENSION: 'دسترسی جفت‌یابی این حساب تعلیق شد',
};

export const isProfileState = (value: unknown): value is ProfileState =>
  typeof value === 'string' && (PROFILE_STATES as readonly string[]).includes(value);

/**
 * What the owner may change by hand. INACTIVE → READY is activation and goes
 * through the eligibility and capacity check instead; COORDINATING and
 * MATCH_SELECTED are entered and left only by the request and contract flow
 * (PROMPT-005/006), so an owner cannot walk out of a coordination silently.
 */
const OWNER_TRANSITIONS: Readonly<Record<ProfileState, readonly ProfileState[]>> = {
  INACTIVE: [],
  READY: ['TEMPORARILY_UNAVAILABLE', 'INVITE_ONLY', 'INACTIVE'],
  TEMPORARILY_UNAVAILABLE: ['READY', 'INVITE_ONLY', 'INACTIVE'],
  INVITE_ONLY: ['READY', 'TEMPORARILY_UNAVAILABLE', 'INACTIVE'],
  COORDINATING: [],
  MATCH_SELECTED: [],
};

export const ownerMayMove = (from: ProfileState, to: ProfileState): boolean => OWNER_TRANSITIONS[from].includes(to);

export const ownerTargets = (from: ProfileState): readonly ProfileState[] => OWNER_TRANSITIONS[from];

/** Every state but INACTIVE holds a slot of the owner's capacity. */
export const holdsCapacity = (state: ProfileState): boolean => state !== 'INACTIVE';

/** Shown in discovery and on its public page. A paused profile keeps its slot but is not shown. */
export const PUBLIC_STATES: readonly ProfileState[] = ['READY', 'INVITE_ONLY', 'COORDINATING', 'MATCH_SELECTED'];
export const publiclyListed = (state: ProfileState): boolean => PUBLIC_STATES.includes(state);

/** Only a READY profile takes a new request; INVITE_ONLY takes invitations (PROMPT-005). */
export const acceptsRequests = (state: ProfileState): boolean => state === 'READY';

// ── Eligibility (PRODUCT_DECISIONS §3, R4) ────────────────────────────────────

export interface EligibilityFacts {
  readonly actorIsOwner: boolean;
  readonly ownerKycApproved: boolean;
  readonly animalStatus: 'DRAFT' | 'REGISTERED' | 'ARCHIVED';
  readonly speciesOpen: boolean;
  readonly lifeStatus: LifeStatus;
  /** A row in the official microchip table. The owner's declared number never counts. */
  readonly hasOfficialChip: boolean;
  readonly hasBreed: boolean;
  readonly hasSex: boolean;
  readonly hasBirthDate: boolean;
  /** The newest owner declaration, or null when none was made. */
  readonly fertility: 'NOT_STERILIZED' | 'STERILIZED' | null;
  readonly hasFullBodyImage: boolean;
  readonly hasFaceImage: boolean;
}

export interface EligibilityProblem {
  readonly code: string;
  readonly fa: string;
}

/** Every unmet condition, in the order the owner fixes them. Empty means eligible. */
export function eligibilityProblems(f: EligibilityFacts): readonly EligibilityProblem[] {
  const out: EligibilityProblem[] = [];
  const need = (ok: boolean, code: string, fa: string) => {
    if (!ok) out.push({ code, fa });
  };
  need(f.actorIsOwner, 'NOT_OWNER', 'فقط مالک فعلی حیوان می‌تواند آن را وارد جفت‌یابی کند.');
  need(f.ownerKycApproved, 'KYC', 'احراز هویت مالک باید تأیید شده باشد.');
  need(f.animalStatus === 'REGISTERED', 'NOT_REGISTERED', 'حیوان باید ثبت‌شده و فعال باشد.');
  need(f.speciesOpen, 'SPECIES_CLOSED', 'جفت‌یابی برای گونه این حیوان باز نیست.');
  need(f.lifeStatus === 'ACTIVE', 'LIFE', 'برای این حیوان ' + LIFE_STATUS_FA[f.lifeStatus] + ' ثبت شده است.');
  need(f.hasOfficialChip, 'CHIP', 'میکروچیپ رسمی باید توسط دامپزشک معتمد ثبت شده باشد؛ شماره اظهاری کافی نیست.');
  need(f.hasBreed && f.hasSex && f.hasBirthDate, 'IDENTITY', 'نژاد، جنسیت و تاریخ تولد حیوان باید ثبت شده باشند.');
  need(f.fertility !== null, 'FERTILITY_UNDECLARED', 'وضعیت عقیم‌نبودن حیوان را اظهار کنید.');
  need(f.fertility !== 'STERILIZED', 'STERILIZED', 'حیوان عقیم‌شده وارد جفت‌یابی نمی‌شود.');
  need(f.hasFullBodyImage, 'FULL_BODY', 'یک تصویر واضح تمام‌بدن لازم است.');
  need(f.hasFaceImage, 'FACE', 'یک تصویر صورت لازم است.');
  return out;
}

// ── Age, rules and cooldown ──────────────────────────────────────────────────

/** Whole months between a birth date and today; negative inputs are nonsense and read as 0. */
export function ageInMonths(birthDate: CivilDate, today: CivilDate): number {
  const b = parseCivilDate(birthDate);
  const t = parseCivilDate(today);
  const months = (t.year - b.year) * 12 + (t.month - b.month) - (t.day < b.day ? 1 : 0);
  return Math.max(0, months);
}

export function ageFa(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const fa = (n: number) => n.toLocaleString('fa-IR');
  if (years === 0) return fa(rest) + ' ماه';
  return rest === 0 ? fa(years) + ' سال' : fa(years) + ' سال و ' + fa(rest) + ' ماه';
}

export interface RuleFacts {
  readonly id: string;
  readonly version: number;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly cooldownDays: number | null;
  readonly cooldownMonths: number | null;
  readonly cooldownMode: 'WARN' | 'BLOCK';
}

/**
 * Whether requests are closed for this age. A breed with no published age range
 * keeps requests closed and says so (DEC-0217 §13): the product gave no range,
 * and a guessed one would decide who may breed.
 */
export function ageRequestProblem(rule: RuleFacts | null, months: number): string | null {
  if (rule === null || (rule.minAgeMonths === null && rule.maxAgeMonths === null)) {
    return 'بازه سنی مجاز این نژاد هنوز توسط مدیریت تعیین نشده است؛ درخواست برای این حیوان فعلاً بسته است.';
  }
  if (rule.minAgeMonths !== null && months < rule.minAgeMonths) {
    return 'سن حیوان کمتر از حداقل سن مجاز این نژاد (' + ageFa(rule.minAgeMonths) + ') است؛ درخواست برای آن بسته است.';
  }
  if (rule.maxAgeMonths !== null && months > rule.maxAgeMonths) {
    return 'سن حیوان بیشتر از حداکثر سن مجاز این نژاد (' + ageFa(rule.maxAgeMonths) + ') است؛ درخواست برای آن بسته است.';
  }
  return null;
}

export interface CooldownState {
  readonly state: 'NO_HISTORY' | 'CLEAR' | 'IN_COOLDOWN' | 'NOT_CONFIGURED';
  readonly endsOn: CivilDate | null;
  readonly mode: 'WARN' | 'BLOCK' | null;
  readonly fa: string;
}

/** Cooldown from the rule and the derived last mating. Warning unless the rule says BLOCK. */
export function cooldownState(rule: RuleFacts | null, lastMatedOn: CivilDate | null, today: CivilDate): CooldownState {
  if (lastMatedOn === null) return { state: 'NO_HISTORY', endsOn: null, mode: null, fa: 'بدون فاصله فعال' };
  if (rule === null) return { state: 'NOT_CONFIGURED', endsOn: null, mode: null, fa: 'قاعده فاصله جفت‌گیری تعیین نشده است' };
  const endsOn =
    rule.cooldownDays !== null ? addDays(lastMatedOn, rule.cooldownDays) : addCalendarMonths(lastMatedOn, rule.cooldownMonths ?? 0);
  if (compareCivilDates(today, endsOn) >= 0) return { state: 'CLEAR', endsOn, mode: rule.cooldownMode, fa: 'خارج از فاصله استراحت' };
  return {
    state: 'IN_COOLDOWN',
    endsOn,
    mode: rule.cooldownMode,
    fa:
      'در فاصله استراحت تا ' +
      formatCivilDateFa(endsOn) +
      (rule.cooldownMode === 'BLOCK' ? ' — درخواست تا آن زمان بسته است' : ' — فقط هشدار، درخواست بسته نیست'),
  };
}

// ── Last mating ──────────────────────────────────────────────────────────────

export const NO_CONFIRMED_MATING_FA = 'سابقه جفت‌گیری تأییدشده ثبت نشده';

const dayNumber = (date: CivilDate) => {
  const { year, month, day } = parseCivilDate(date);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** «۱۲ خرداد ۱۴۰۵ – ۱۰۵ روز قبل», or the fixed empty text. */
export function lastMatingFa(lastMatedOn: CivilDate | null, today: CivilDate): string {
  if (lastMatedOn === null) return NO_CONFIRMED_MATING_FA;
  const days = Math.max(0, dayNumber(today) - dayNumber(lastMatedOn));
  return formatCivilDateFa(lastMatedOn) + ' – ' + (days === 0 ? 'امروز' : days.toLocaleString('fa-IR') + ' روز قبل');
}

// ── Completeness ─────────────────────────────────────────────────────────────

export interface CompletenessFacts {
  readonly hasPedigree: boolean;
  readonly identityVerifiedByVet: boolean;
  readonly imageCount: number;
  readonly hasVideo: boolean;
  readonly hasPreferences: boolean;
}

/**
 * Pedigree adds to completeness; it is never a condition of entering the finder
 * (PRODUCT_DECISIONS §3). Five items, each worth one.
 */
export function completeness(f: CompletenessFacts): { readonly score: number; readonly total: number } {
  const items = [f.hasPedigree, f.identityVerifiedByVet, f.imageCount >= 3, f.hasVideo, f.hasPreferences];
  return { score: items.filter(Boolean).length, total: items.length };
}
