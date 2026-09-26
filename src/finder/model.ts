/**
 * Phase 4 mating finder — shared pure model (PROMPT-002, DEC-0218).
 *
 * No database and no framework: who may configure what, which flows have a kill
 * switch, who sees whose profile, whether a pair may form, how much capacity an
 * account has and whether its subscription is live. The services read these
 * instead of restating them, so each answer has one place to be wrong.
 */
import { forbidden, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

// ── Plans ────────────────────────────────────────────────────────────────────

export const FINDER_AUDIENCES = ['OWNER', 'KENNEL'] as const;
export type FinderAudience = (typeof FINDER_AUDIENCES)[number];

export const FINDER_AUDIENCE_FA: Record<FinderAudience, string> = {
  OWNER: 'مالک',
  KENNEL: 'کنل',
};

/** The four initial durations (PRODUCT_DECISIONS §2). A closed list, not managed data. */
export const FINDER_DURATIONS = [1, 3, 6, 12] as const;
export type FinderDuration = (typeof FINDER_DURATIONS)[number];

export const FINDER_DURATION_FA: Record<FinderDuration, string> = {
  1: 'یک‌ماهه',
  3: 'سه‌ماهه',
  6: 'شش‌ماهه',
  12: 'دوازده‌ماهه',
};

export const isFinderAudience = (value: unknown): value is FinderAudience =>
  typeof value === 'string' && (FINDER_AUDIENCES as readonly string[]).includes(value);

export const isFinderDuration = (value: unknown): value is FinderDuration =>
  typeof value === 'number' && (FINDER_DURATIONS as readonly number[]).includes(value);

export const SUSPENSION_POLICIES = ['PERIOD_CONTINUES_NO_REFUND', 'PERIOD_PAUSED_NO_REFUND'] as const;
export type SuspensionPolicy = (typeof SUSPENSION_POLICIES)[number];

/** Neither policy refunds anything: suspension never promises money back (§12). */
export const SUSPENSION_POLICY_FA: Record<SuspensionPolicy, string> = {
  PERIOD_CONTINUES_NO_REFUND: 'در تعلیق، دوره ادامه می‌یابد و بازپرداخت خودکار ندارد',
  PERIOD_PAUSED_NO_REFUND: 'در تعلیق، دوره متوقف می‌شود و بازپرداخت خودکار ندارد',
};

export const isSuspensionPolicy = (value: unknown): value is SuspensionPolicy =>
  typeof value === 'string' && (SUSPENSION_POLICIES as readonly string[]).includes(value);

/**
 * Add calendar months to an instant, clamping to the last day of a shorter
 * month (31 January + 1 month = 28 or 29 February), in UTC so the answer does
 * not move with the server's time zone.
 */
export function addMonths(from: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1) throw validation('طول دوره معتبر نیست.');
  const day = from.getUTCDate();
  const target = new Date(from.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export interface PlanForSale {
  readonly status: 'PUBLISHED' | 'ARCHIVED';
  readonly priceToman: bigint | null;
  readonly purchasableFrom: Date | null;
  readonly purchasableUntil: Date | null;
}

/**
 * Why a plan cannot be bought right now, or null when it can. The first reason
 * is the operator's: an unset price is said in so many words, never shown as free.
 */
export function planPurchaseProblem(plan: PlanForSale, now: Date): string | null {
  if (plan.status !== 'PUBLISHED') return 'این طرح دیگر فروخته نمی‌شود؛ صفحه را دوباره باز کنید.';
  if (plan.priceToman === null) return 'قیمت این طرح هنوز توسط مدیریت ثبت نشده است؛ خرید آن ممکن نیست.';
  if (plan.purchasableFrom !== null && now.getTime() < plan.purchasableFrom.getTime()) {
    return 'فروش این طرح هنوز شروع نشده است.';
  }
  if (plan.purchasableUntil !== null && now.getTime() >= plan.purchasableUntil.getTime()) {
    return 'مهلت فروش این طرح تمام شده است.';
  }
  return null;
}

// ── Subscription standing ───────────────────────────────────────────────────

export interface PaidPeriod {
  readonly audience: FinderAudience;
  readonly activeAnimalCapacity: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface Standing {
  /** NONE: never subscribed. EXPIRED: subscribed once, nothing live now. */
  readonly state: 'NONE' | 'ACTIVE' | 'EXPIRED';
  /** The period covering `now`, if any. */
  readonly current: PaidPeriod | null;
  /** Where the whole paid chain ends; a renewal starts here. */
  readonly chainEndsAt: Date | null;
}

/** Periods never overlap, so at most one covers an instant. The end is exclusive. */
export function standingAt(periods: readonly PaidPeriod[], now: Date): Standing {
  if (periods.length === 0) return { state: 'NONE', current: null, chainEndsAt: null };
  const t = now.getTime();
  const current = periods.find((p) => p.startsAt.getTime() <= t && t < p.endsAt.getTime()) ?? null;
  const chainEndsAt = new Date(Math.max(...periods.map((p) => p.endsAt.getTime())));
  return { state: current ? 'ACTIVE' : 'EXPIRED', current, chainEndsAt };
}

// ── Capacity ─────────────────────────────────────────────────────────────────

export interface Capacity {
  /** Null = NOT_CONFIGURED: no profile may be activated until an operator enters a figure. */
  readonly limit: number | null;
  readonly source: 'PLAN' | 'FREE';
  readonly audience: FinderAudience | null;
}

/**
 * How many profiles an account may hold active. A live plan decides; without one
 * the managed free-owner figure decides, and an expired plan falls back to it
 * rather than to "no limit" — the defect the Phase 3 seller plan carries is not
 * repeated here (DEC-0217 §12).
 */
export function capacityOf(standing: Standing, freeOwnerCapacity: number | null): Capacity {
  if (standing.current) {
    return { limit: standing.current.activeAnimalCapacity, source: 'PLAN', audience: standing.current.audience };
  }
  return { limit: freeOwnerCapacity, source: 'FREE', audience: null };
}

/** Null when there is room; otherwise the reason, for the owner and for the audit. */
export function capacityProblem(capacity: Capacity, activeCount: number): string | null {
  if (capacity.limit === null) return 'ظرفیت حیوان فعال برای حساب‌های بدون اشتراک هنوز توسط مدیریت تعیین نشده است.';
  if (activeCount >= capacity.limit) {
    return capacity.source === 'PLAN'
      ? 'ظرفیت حیوان فعال طرح شما پر است.'
      : 'ظرفیت حیوان فعال حساب رایگان پر است؛ برای افزایش آن اشتراک تهیه کنید.';
  }
  return null;
}

// ── Access matrix (PRODUCT_DECISIONS §2, R3, R4) ──────────────────────────────

export interface VisibilityFacts {
  readonly viewerIsOwner: boolean;
  readonly ownerSubscribed: boolean;
  readonly viewerSubscribed: boolean;
  /** Kill switch `finder.flag.free_pool_visibility`; closed hides free-owner animals from subscribers too. */
  readonly freePoolOpen: boolean;
}

/**
 * Whether a viewer may see one active profile.
 *
 *  - a subscribed owner's active animals are public;
 *  - a subscriber also sees opted-in animals of free owners;
 *  - a free user or a visitor sees only subscribed owners' animals;
 *  - the owner always sees their own.
 */
export function profileVisible(facts: VisibilityFacts): boolean {
  if (facts.viewerIsOwner) return true;
  if (facts.ownerSubscribed) return true;
  return facts.viewerSubscribed && facts.freePoolOpen;
}

export interface PairFacts {
  readonly senderKycApproved: boolean;
  readonly receiverKycApproved: boolean;
  readonly senderSubscribed: boolean;
  readonly receiverSubscribed: boolean;
}

/** Null when the pair may form; otherwise why not. At least one side must be subscribed. */
export function pairProblem(facts: PairFacts): string | null {
  if (!facts.senderKycApproved) return 'برای ارسال درخواست، احراز هویت شما باید تأیید شده باشد.';
  if (!facts.receiverKycApproved) return 'احراز هویت مالک حیوان مقابل هنوز تأیید نشده است.';
  if (!facts.senderSubscribed && !facts.receiverSubscribed) {
    return 'برای شکل‌گیری درخواست، دست‌کم یکی از دو مالک باید اشتراک فعال جفت‌یابی داشته باشد.';
  }
  return null;
}

// ── Breed rules ──────────────────────────────────────────────────────────────

export const RULE_MODES = ['WARN', 'BLOCK'] as const;
export type RuleMode = (typeof RULE_MODES)[number];

export const RULE_MODE_FA: Record<RuleMode, string> = { WARN: 'فقط هشدار', BLOCK: 'مانع درخواست' };

export const isRuleMode = (value: unknown): value is RuleMode =>
  typeof value === 'string' && (RULE_MODES as readonly string[]).includes(value);

/**
 * The confirmed baseline (PRODUCT_DECISIONS §4): male 14 days, female 6 months,
 * warning only. Everything else — ages, kinship threshold, a hard block — is left
 * unset until a superadmin publishes a rule, because the product gave no figure.
 */
export const BASELINE_RULES = [
  { sex: 'MALE', cooldownDays: 14, cooldownMonths: null },
  { sex: 'FEMALE', cooldownDays: null, cooldownMonths: 6 },
] as const;

export interface RuleInput {
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly cooldownDays: number | null;
  readonly cooldownMonths: number | null;
  readonly kinshipMaxDegree: number | null;
}

/** The database repeats these as CHECKs; this gives the operator a Persian reason first. */
export function ruleProblem(rule: RuleInput): string | null {
  const ints = [rule.minAgeMonths, rule.maxAgeMonths, rule.cooldownDays, rule.cooldownMonths, rule.kinshipMaxDegree];
  if (ints.some((v) => v !== null && (!Number.isInteger(v) || v < 0))) return 'مقدارها باید عدد صحیح نامنفی باشند.';
  if ((rule.cooldownDays === null) === (rule.cooldownMonths === null)) {
    return 'فاصله جفت‌گیری را یا به روز یا به ماه وارد کنید، نه هر دو و نه هیچ‌کدام.';
  }
  if (rule.maxAgeMonths !== null && rule.maxAgeMonths < 1) return 'حداکثر سن باید دست‌کم یک ماه باشد.';
  if (rule.minAgeMonths !== null && rule.maxAgeMonths !== null && rule.minAgeMonths > rule.maxAgeMonths) {
    return 'حداقل سن نمی‌تواند بیشتر از حداکثر سن باشد.';
  }
  if (rule.kinshipMaxDegree !== null && (rule.kinshipMaxDegree < 1 || rule.kinshipMaxDegree > 6)) {
    return 'درجه خویشاوندی باید بین ۱ و ۶ باشد.';
  }
  return null;
}

// ── Capabilities ─────────────────────────────────────────────────────────────

/**
 * What a Finder operator may do. Listed one by one, like the Phase 3
 * marketplace capabilities, because a level always grants something nobody meant.
 *
 * Deliberately absent: any capability to read a chat or a contract body. Support
 * sees a contract's status and history, never its private text (R8, R12).
 */
export const FINDER_CAPABILITIES = [
  /** The Finder operations overview and the state of its switches. */
  'FINDER_OVERVIEW_VIEW',
  /** Plans, prices, capacities, breed rules, bounds, species and kill switches (§12: superadmin). */
  'FINDER_CONFIG_WRITE',
  /** One account's subscription periods and payments, to answer a question about them. */
  'FINDER_SUBSCRIPTION_VIEW',
  /** Hide or restore a profile after a report. */
  'FINDER_PROFILE_MODERATE',
  /** Suspend or restore an account's Finder access; never refunds a subscription. */
  'FINDER_ACCESS_SUSPEND',
  /** A contract's status, versions and cancellation history — metadata only. */
  'FINDER_CONTRACT_SUPPORT',
  /** Aggregate, minimised Finder analytics. */
  'FINDER_ANALYTICS_VIEW',
] as const;
export type FinderCapability = (typeof FINDER_CAPABILITIES)[number];

/**
 * The grant table. The properties the tests pin:
 *  - configuration belongs to the superadmin alone (PRODUCT_DECISIONS §12);
 *  - moderation, support and analytics are three different people;
 *  - no context other than the superadmin holds more than three capabilities.
 */
const CAPABILITIES: Partial<Record<ActorContextName, readonly FinderCapability[]>> = {
  SUPERADMIN: FINDER_CAPABILITIES,
  MARKETPLACE_ADMIN: ['FINDER_OVERVIEW_VIEW', 'FINDER_ANALYTICS_VIEW'],
  LISTING_MODERATOR: ['FINDER_OVERVIEW_VIEW', 'FINDER_PROFILE_MODERATE'],
  SUPPORT_AGENT: ['FINDER_OVERVIEW_VIEW', 'FINDER_SUBSCRIPTION_VIEW', 'FINDER_CONTRACT_SUPPORT'],
  DISPUTE_REVIEWER: ['FINDER_OVERVIEW_VIEW', 'FINDER_CONTRACT_SUPPORT'],
  FINANCE_OPERATOR: ['FINDER_OVERVIEW_VIEW', 'FINDER_SUBSCRIPTION_VIEW', 'FINDER_ANALYTICS_VIEW'],
};

export const finderCapabilitiesOf = (context: ActorContextName): readonly FinderCapability[] =>
  CAPABILITIES[context] ?? [];

export const hasFinderCapability = (actor: Actor, capability: FinderCapability): boolean =>
  finderCapabilitiesOf(actor.context).includes(capability);

export function assertFinderCapability(actor: Actor, capability: FinderCapability): void {
  if (!hasFinderCapability(actor, capability)) throw forbidden('این کار در نقش فعلی شما مجاز نیست.');
}

// ── Kill switches ────────────────────────────────────────────────────────────

/**
 * One switch per flow the prompt names. BOOL settings in the MATING_FINDER group:
 * versioned, audited and superadmin-only. Every one starts closed and an unset
 * switch reads as closed, so nothing opens because nobody entered a value.
 * Closing one stops new actions in that flow; it never hides history, a
 * confirmed contract or its PDF.
 */
export const FINDER_FLAGS = [
  { key: 'finder.flag.discovery', labelFa: 'کشف و جست‌وجوی جفت', closedFa: 'جست‌وجوی جفت در حال حاضر بسته است.' },
  {
    key: 'finder.flag.free_pool_visibility',
    labelFa: 'نمایش حیوانات مالکان رایگان به مشترکان',
    closedFa: 'نمایش حیوانات مالکان بدون اشتراک در حال حاضر بسته است.',
  },
  {
    key: 'finder.flag.subscription_purchase',
    labelFa: 'خرید و تمدید اشتراک',
    closedFa: 'خرید اشتراک جفت‌یابی در حال حاضر بسته است.',
  },
  { key: 'finder.flag.requests', labelFa: 'درخواست جفت‌گیری', closedFa: 'ارسال درخواست جفت‌گیری در حال حاضر بسته است.' },
  { key: 'finder.flag.chat', labelFa: 'گفت‌وگوی جفت‌یابی', closedFa: 'گفت‌وگوی جفت‌یابی در حال حاضر بسته است.' },
  { key: 'finder.flag.contracts', labelFa: 'قرارداد جفت‌گیری', closedFa: 'تنظیم قرارداد تازه در حال حاضر بسته است.' },
  {
    key: 'finder.flag.official_handoff',
    labelFa: 'ورود به مسیر مجوز رسمی',
    closedFa: 'ورود به مسیر مجوز رسمی از جفت‌یابی در حال حاضر بسته است.',
  },
  {
    key: 'finder.flag.personal_handoff',
    labelFa: 'ورود به مسیر شخصی',
    closedFa: 'ثبت جفت‌گیری شخصی از جفت‌یابی در حال حاضر بسته است.',
  },
  { key: 'finder.flag.notifications', labelFa: 'اعلان‌های جفت‌یابی', closedFa: 'اعلان‌های جفت‌یابی در حال حاضر خاموش است.' },
] as const;

export type FinderFlagKey = (typeof FINDER_FLAGS)[number]['key'];

export const finderFlag = (key: string): (typeof FINDER_FLAGS)[number] | null =>
  FINDER_FLAGS.find((flag) => flag.key === key) ?? null;

// ── Managed bounds ───────────────────────────────────────────────────────────

export const FINDER_SETTING_KEYS = {
  freeOwnerCapacity: 'finder.capacity.free_owner',
  requestExpiryDays: 'finder.request.expiry_days',
  otpLifetimeSeconds: 'finder.otp.lifetime_seconds',
  otpMaxAttempts: 'finder.otp.max_attempts',
  otpResendSeconds: 'finder.otp.resend_seconds',
  mediaMaxImages: 'finder.media.max_images',
  mediaMaxVideoMb: 'finder.media.max_video_mb',
} as const;

/** The species the finder is open for at launch (PRODUCT_DECISIONS §1). */
export const FINDER_LAUNCH_SPECIES = 'DOG';
