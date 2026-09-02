/**
 * Microchip and sample rules — §12, D07, D08.
 *
 * The rule the whole section is built around is short: one animal has one
 * microchip for its whole life. Everything here exists to make sure that rule
 * cannot be walked around — not by a second binding, not by a replacement, and
 * not by resolving a conflict with an overwrite.
 */
import { validation } from './errors.ts';

export type ChipReadMethod = 'BLUETOOTH_READER' | 'MOBILE_READER' | 'PACKAGE_BARCODE' | 'MANUAL';

export const READ_METHOD_FA: Record<ChipReadMethod, string> = {
  BLUETOOTH_READER: 'ریدر بلوتوث',
  MOBILE_READER: 'ریدر متصل به موبایل',
  PACKAGE_BARCODE: 'بارکد بسته‌بندی',
  MANUAL: 'ورود دستی',
};

export type SampleStatusName =
  | 'IN_CUSTODY'
  | 'SEND_INSTRUCTED'
  | 'SHIPPED'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'INVALID'
  | 'INSUFFICIENT'
  | 'DAMAGED'
  | 'LOST';

export const SAMPLE_STATUS_FA: Record<SampleStatusName, string> = {
  IN_CUSTODY: 'نزد دامپزشک',
  SEND_INSTRUCTED: 'دستور ارسال صادر شد',
  SHIPPED: 'ارسال‌شده',
  RECEIVED: 'دریافت‌شده در مرکز',
  PROCESSING: 'در حال پردازش',
  INVALID: 'نامعتبر',
  INSUFFICIENT: 'ناکافی',
  DAMAGED: 'خراب',
  LOST: 'مفقود',
};

/** The four states that make a sample unusable and call for a new collection. */
export const UNUSABLE_STATUSES = ['INVALID', 'INSUFFICIENT', 'DAMAGED', 'LOST'] as const;
export type UnusableStatus = (typeof UNUSABLE_STATUSES)[number];

export const CONFLICT_KIND_FA = {
  BELONGS_TO_OTHER_ANIMAL: 'این سریال به حیوان دیگری متصل است.',
  ANIMAL_HAS_OTHER_CHIP: 'این حیوان میکروچیپ ثبت‌شده دیگری دارد.',
  SERIAL_MISMATCH: 'سریال خوانده‌شده با رکورد نمی‌خواند.',
  DUPLICATE_NUMBER: 'این سریال هم‌زمان برای حیوان دیگری ثبت شد.',
} as const;
export type ConflictKind = keyof typeof CONFLICT_KIND_FA;

/**
 * ISO 11784/11785 transponder codes are 15 digits. The source names one
 * canonical field without giving a format, so the check stays on the shape the
 * standard actually defines and refuses anything else rather than guessing.
 */
const CHIP_NUMBER = /^\d{15}$/;

export function normalizeMicrochipNumber(raw: string): string {
  // A reader, a barcode and a person typing all produce the same value here:
  // spaces and separators are noise around a 15-digit code.
  return raw.trim().replace(/[\s-]/g, '');
}

export function assertMicrochipNumber(raw: string): string {
  const value = normalizeMicrochipNumber(raw);
  if (!CHIP_NUMBER.test(value)) {
    throw validation('شماره میکروچیپ باید ۱۵ رقم باشد.');
  }
  return value;
}

export interface ChipFacts {
  /** The animal already bound to this number, if any. */
  readonly numberBoundToAnimalId: string | null;
  /** The number already bound to this animal, if any. */
  readonly animalBoundNumber: string | null;
}

export type ImplantPreCheck =
  | { readonly state: 'READY' }
  | { readonly state: 'BLOCKED'; readonly conflict: ConflictKind };

/**
 * Before implantation — §12.2.
 *
 * Global uniqueness and the lifetime rule are both checked here, and either one
 * stops the procedure. Nothing about this function can produce a second chip
 * for an animal or move a number between animals.
 */
export function implantPreCheck(facts: ChipFacts): ImplantPreCheck {
  if (facts.animalBoundNumber !== null) return { state: 'BLOCKED', conflict: 'ANIMAL_HAS_OTHER_CHIP' };
  if (facts.numberBoundToAnimalId !== null) return { state: 'BLOCKED', conflict: 'BELONGS_TO_OTHER_ANIMAL' };
  return { state: 'READY' };
}

export type VerificationOutcome =
  | { readonly state: 'CONFIRMED' }
  /** A physical chip with no record: bindable, but only after the same checks. */
  | { readonly state: 'BINDABLE' }
  | { readonly state: 'CONFLICT'; readonly conflict: ConflictKind };

/**
 * The verification table of §12.3, in the order the source lists it.
 *
 * A mismatch between the read serial and the animal's record is a conflict and
 * a full stop. It never becomes a correction, and it never becomes a second
 * binding.
 */
export function verificationOutcome(observedNumber: string, facts: ChipFacts): VerificationOutcome {
  const observed = normalizeMicrochipNumber(observedNumber);

  if (facts.animalBoundNumber !== null) {
    if (facts.animalBoundNumber === observed) return { state: 'CONFIRMED' };
    // The animal has a chip on record and this is not it. Whether the observed
    // number belongs to somebody else or to nobody, the animal's own record is
    // what makes this a stop.
    return {
      state: 'CONFLICT',
      conflict: facts.numberBoundToAnimalId !== null ? 'BELONGS_TO_OTHER_ANIMAL' : 'SERIAL_MISMATCH',
    };
  }

  if (facts.numberBoundToAnimalId !== null) return { state: 'CONFLICT', conflict: 'BELONGS_TO_OTHER_ANIMAL' };
  return { state: 'BINDABLE' };
}

/** The reread after implantation has to be the same serial (§12.2). */
export function rereadMatches(preRead: string, postRead: string): boolean {
  return normalizeMicrochipNumber(preRead) === normalizeMicrochipNumber(postRead);
}

/**
 * Blood sampling is mandatory in both microchip services (§12.4), so the
 * service is not finished until a sample exists.
 */
export function samplingRequiredFor(serviceType: string): boolean {
  return serviceType === 'MICROCHIP_IMPLANT' || serviceType === 'MICROCHIP_VERIFICATION';
}

export function isUnusable(status: SampleStatusName): status is UnusableStatus {
  return (UNUSABLE_STATUSES as readonly string[]).includes(status);
}
