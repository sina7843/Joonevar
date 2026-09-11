/**
 * Public veterinary directory rules that need no database — Requirements-Phase-2 §7, §19, §20 (PROMPT-006).
 *
 * The five status axes of §7 are separate facts and are never folded into one
 * score (P2-D05, DEC-0164):
 *  - Completeness — computed here from what the profile actually says;
 *  - Ownership/Claim — every profile today belongs to its veterinarian's account;
 *    unowned suggestions and claims arrive with PROMPT-007;
 *  - Professional Verification — the council code verified in Phase 1;
 *  - Trusted Hamzist — the active TRUSTED_VET role of Phase 1;
 *  - Advertising — PROMPT-011; nothing here can buy or imply the others.
 */
export const VET_PUBLIC_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;
export type VetPublicStatus = (typeof VET_PUBLIC_STATUSES)[number];

export const VET_PUBLIC_STATUS_FA: Record<VetPublicStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  HIDDEN: 'پنهان',
};

export const LOCATION_KIND_FA: Record<'CLINIC' | 'HOSPITAL' | 'CENTRE', string> = {
  CLINIC: 'کلینیک',
  HOSPITAL: 'بیمارستان',
  CENTRE: 'مرکز دامپزشکی',
};

export const isVetPublicStatus = (value: unknown): value is VetPublicStatus =>
  typeof value === 'string' && (VET_PUBLIC_STATUSES as readonly string[]).includes(value);

export interface CompletenessInput {
  readonly headlineFa: string | null;
  readonly bioFa: string | null;
  readonly experienceFa: string | null;
  readonly specialtyCount: number;
  readonly speciesCount: number;
  readonly publicLocationsWithCity: number;
  /** A phone that may be shown: consent given and a number present. */
  readonly contactShown: boolean;
}

const COMPLETENESS_ITEMS: ReadonlyArray<{ key: string; labelFa: string; done: (input: CompletenessInput) => boolean }> = [
  { key: 'headline', labelFa: 'عنوان حرفه‌ای', done: (i) => hasText(i.headlineFa) },
  { key: 'bio', labelFa: 'معرفی', done: (i) => hasText(i.bioFa) },
  { key: 'experience', labelFa: 'سوابق', done: (i) => hasText(i.experienceFa) },
  { key: 'specialties', labelFa: 'دست‌کم یک تخصص', done: (i) => i.specialtyCount > 0 },
  { key: 'species', labelFa: 'گونه‌هایی که پذیرفته می‌شوند', done: (i) => i.speciesCount > 0 },
  { key: 'location', labelFa: 'دست‌کم یک محل کار عمومی با شهر', done: (i) => i.publicLocationsWithCity > 0 },
  { key: 'contact', labelFa: 'راه تماس عمومی با رضایت', done: (i) => i.contactShown },
];

function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== '';
}

/** The Completeness axis: what is filled in, what is missing, and whether nothing is. */
export function completeness(input: CompletenessInput): {
  done: number;
  total: number;
  missing: string[];
  complete: boolean;
} {
  const missing = COMPLETENESS_ITEMS.filter((item) => !item.done(input)).map((item) => item.labelFa);
  return {
    done: COMPLETENESS_ITEMS.length - missing.length,
    total: COMPLETENESS_ITEMS.length,
    missing,
    complete: missing.length === 0,
  };
}

/**
 * A directory page goes public only when it says something a visitor can use:
 * who the veterinarian is and where to find them. A name alone is a thin page
 * (§19) and a profile without a place helps nobody.
 */
export function vetPublishBlockers(
  input: CompletenessInput,
  ownership: { owned: boolean; hasListedCity: boolean } = { owned: true, hasListedCity: false },
): string[] {
  // An unowned profile is a reviewed suggestion: a name and a city are what it has (§10, DEC-0166).
  if (!ownership.owned) return ownership.hasListedCity ? [] : ['پیش از انتشار، شهر پروفایل بدون مالک را انتخاب کنید.'];
  const problems: string[] = [];
  if (!hasText(input.bioFa)) problems.push('پیش از انتشار، معرفی دامپزشک را بنویسید.');
  if (input.publicLocationsWithCity === 0) problems.push('پیش از انتشار، دست‌کم یک محل کار را با شهر عمومی کنید.');
  return problems;
}

/**
 * Only a claimed profile may buy an advertising package (§14). An unowned
 * profile has nobody entitled to pay for it, and a package never creates
 * ownership, verification or trust (P2-D05). PROMPT-011 asks this before any
 * payment starts (DEC-0166).
 */
export function packagePurchaseEligibility(profile: {
  accountId: string | null;
}): { allowed: true } | { allowed: false; reasonFa: string } {
  return profile.accountId === null
    ? { allowed: false, reasonFa: 'فقط پروفایلی که Claim و تأیید شده است می‌تواند بسته تبلیغاتی بخرد.' }
    : { allowed: true };
}

/** The phone a visitor may see: only with consent, and only when there is one (§20). */
export const publicPhone = (showPhone: boolean, phone: string | null): string | null =>
  showPhone && hasText(phone) ? phone!.trim() : null;
