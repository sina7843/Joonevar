/**
 * Finder and referral rules — §11, §26, D15.
 *
 * Pure functions over facts, for the same reason the eligibility rules are:
 * the screen that greys a location out and the server that refuses a check-in
 * have to be reading the same sentence.
 *
 * Two things the source is emphatic about live here:
 *  - the 21-day deadline is a database setting, never a constant in logic;
 *  - a location that holds only part of the mandatory facilities does not get
 *    a reduced path, it is simply not offered for that context.
 */

export type VisitContextName = 'MICROCHIP' | 'DNA' | 'PREGNANCY';
export type VisitServiceTypeName =
  | 'MICROCHIP_IMPLANT'
  | 'MICROCHIP_VERIFICATION'
  | 'DNA_RESAMPLING'
  | 'PREGNANCY_CHECK';

export type LocationCapability = 'IMPLANT' | 'BLOOD_SAMPLE' | 'PREGNANCY_CHECK';

/** Exactly the sentence the source prescribes for the cost area (§11.1). */
export const CONTACT_FOR_PRICE_FA = 'برای اطلاع دقیق از قیمت‌ها با دامپزشک یا مرکز تماس بگیرید.';

export const CONTEXT_FA: Record<VisitContextName, string> = {
  MICROCHIP: 'میکروچیپ',
  DNA: 'نمونه‌گیری DNA',
  PREGNANCY: 'بررسی بارداری',
};

export const SERVICE_TYPE_FA: Record<VisitServiceTypeName, string> = {
  MICROCHIP_IMPLANT: 'کاشت میکروچیپ',
  MICROCHIP_VERIFICATION: 'تأیید میکروچیپ',
  DNA_RESAMPLING: 'نمونه‌گیری مجدد DNA',
  PREGNANCY_CHECK: 'بررسی بارداری',
};

export const REFERRAL_STATUS_FA: Record<string, string> = {
  ACTIVE: 'فعال',
  CONSUMED: 'استفاده‌شده',
  EXPIRED: 'منقضی',
  CANCELLED: 'لغوشده',
  SUPERSEDED: 'جایگزین‌شده',
};

/**
 * The colour each state deserves — one table, so every screen agrees.
 *
 * The tone says what kind of end this is, not merely that it ended. Finished
 * work is a success; a request that was replaced is still live somewhere else,
 * so it is informative rather than dead; a cancelled one is simply over, which
 * is neutral and not an error, because nothing went wrong.
 */
export const REQUEST_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'info',
  CHECKED_IN: 'success',
  COMPLETED: 'success',
  SUPERSEDED: 'info',
  CANCELLED: 'neutral',
};

export const REFERRAL_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  ACTIVE: 'info',
  CONSUMED: 'success',
  EXPIRED: 'warning',
  CANCELLED: 'neutral',
  SUPERSEDED: 'info',
};

export const REQUEST_STATUS_FA: Record<string, string> = {
  ACTIVE: 'در انتظار مراجعه',
  CHECKED_IN: 'پذیرش‌شده',
  COMPLETED: 'انجام‌شده',
  SUPERSEDED: 'جایگزین‌شده',
  CANCELLED: 'لغوشده',
};

/** Which service types a context may carry, and which one is chosen per animal. */
export const SERVICES_BY_CONTEXT: Record<VisitContextName, readonly VisitServiceTypeName[]> = {
  MICROCHIP: ['MICROCHIP_IMPLANT', 'MICROCHIP_VERIFICATION'],
  DNA: ['DNA_RESAMPLING'],
  PREGNANCY: ['PREGNANCY_CHECK'],
};

/**
 * Mandatory facilities per context.
 *
 * Blood sampling is required by both microchip paths because §12.4 makes the
 * sample mandatory in implant and verification alike — a place that can implant
 * but cannot draw blood cannot complete either service.
 */
export const REQUIRED_CAPABILITIES: Record<VisitContextName, readonly LocationCapability[]> = {
  MICROCHIP: ['IMPLANT', 'BLOOD_SAMPLE'],
  DNA: ['BLOOD_SAMPLE'],
  PREGNANCY: ['PREGNANCY_CHECK'],
};

export interface LocationFacts {
  readonly isActive: boolean;
  readonly licenceStatus: 'NONE' | 'VALID' | 'EXPIRED' | 'REVOKED';
  readonly cityFa: string | null;
  readonly addressFa: string | null;
  readonly phone: string | null;
  readonly capabilities: readonly LocationCapability[];
}

export type LocationEligibility =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reasonFa: string };

/**
 * A location enters Finder only when it is complete: active, licensed, with a
 * usable address and contact, and holding every mandatory facility of the
 * context. Partial capability is not a second-class listing (§11.1).
 */
export function locationEligibility(facts: LocationFacts, context: VisitContextName): LocationEligibility {
  if (!facts.isActive) return { eligible: false, reasonFa: 'این مرکز فعال نیست.' };
  if (facts.licenceStatus !== 'VALID') return { eligible: false, reasonFa: 'پروانه معتبر ثبت نشده است.' };
  if (!facts.cityFa || !facts.addressFa || !facts.phone) {
    return { eligible: false, reasonFa: 'اطلاعات مکانی و تماس این مرکز کامل نیست.' };
  }
  const missing = REQUIRED_CAPABILITIES[context].filter((need) => !facts.capabilities.includes(need));
  if (missing.length > 0) {
    return { eligible: false, reasonFa: 'امکانات اجباری این خدمت در این مرکز کامل نیست.' };
  }
  return { eligible: true };
}

/**
 * Great-circle distance in kilometres, used only for the supported distance
 * filter and sort. There is no earliest-slot ordering to compete with it,
 * because appointments do not exist here (§11.1).
 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Expiry is computed from the value read at issuance, never from a constant. */
export function referralExpiry(issuedAt: Date, validityDays: number): Date {
  if (!Number.isInteger(validityDays) || validityDays < 1) {
    throw new RangeError('validityDays must be a positive whole number of days');
  }
  return new Date(issuedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
}

export type CodeRejection =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'CONSUMED'
  | 'CANCELLED'
  | 'SUPERSEDED'
  | 'WRONG_VET'
  | 'WRONG_LOCATION'
  | 'REQUEST_NOT_ACTIVE';

/**
 * Every rejection says only that this code cannot be accepted here. None of
 * them names the animal, its owner or the place the code does belong to, so a
 * wrong scan never becomes a way to look at somebody else's record (§11.3).
 */
export const REJECTION_FA: Record<CodeRejection, string> = {
  NOT_FOUND: 'این کد مراجعه معتبر نیست.',
  EXPIRED: 'مهلت این کد مراجعه گذشته است. کاربر می‌تواند کد جدید بگیرد.',
  CONSUMED: 'این کد قبلاً استفاده شده است.',
  CANCELLED: 'این کد لغو شده است.',
  SUPERSEDED: 'این کد با کد جدیدتری جایگزین شده است.',
  WRONG_VET: 'این کد برای این دامپزشک صادر نشده است.',
  WRONG_LOCATION: 'این کد برای این مرکز صادر نشده است.',
  REQUEST_NOT_ACTIVE: 'این درخواست دیگر فعال نیست.',
};

export interface CheckInFacts {
  readonly referralStatus: 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'CANCELLED' | 'SUPERSEDED';
  readonly expiresAt: Date;
  readonly requestStatus: 'ACTIVE' | 'CHECKED_IN' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
  readonly requestVetAccountId: string;
  readonly requestLocationId: string;
  readonly presentedByVetAccountId: string;
  readonly presentedAtLocationId: string;
  readonly now: Date;
}

/**
 * The order matters: a code presented by the wrong veterinarian is refused for
 * being the wrong veterinarian's, whatever else is true of it.
 */
export function checkInRejection(facts: CheckInFacts): CodeRejection | null {
  if (facts.requestVetAccountId !== facts.presentedByVetAccountId) return 'WRONG_VET';
  if (facts.requestLocationId !== facts.presentedAtLocationId) return 'WRONG_LOCATION';
  if (facts.referralStatus === 'CONSUMED') return 'CONSUMED';
  if (facts.referralStatus === 'CANCELLED') return 'CANCELLED';
  if (facts.referralStatus === 'SUPERSEDED') return 'SUPERSEDED';
  if (facts.referralStatus === 'EXPIRED' || facts.expiresAt.getTime() <= facts.now.getTime()) return 'EXPIRED';
  if (facts.requestStatus !== 'ACTIVE') return 'REQUEST_NOT_ACTIVE';
  return null;
}

/** Codes are compared in one canonical shape, however they were entered. */
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
