/**
 * Veterinary centre rules that need no database — Requirements-Phase-2 §9, §19, §22 (PROMPT-008).
 *
 * A centre is an organisation with branches; a branch is the same
 * `vet_location` row Phase 1 already uses, never a second copy of it (P2-D15,
 * DEC-0167). Announced hours are information, never an appointment: the
 * directory introduces centres and nothing here reserves a time (P2-D08).
 *
 * The status axes stay separate exactly as they do for a veterinarian (P2-D05):
 * Completeness is computed, Ownership/Claim is the owning account, Verification
 * is the centre's own licence, Hamzist service is the Phase 1 licence of a
 * linked branch, and Advertising arrives with PROMPT-011.
 */
export const CENTRE_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;
export type CentreStatus = (typeof CENTRE_STATUSES)[number];

export const CENTRE_STATUS_FA: Record<CentreStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشرشده',
  HIDDEN: 'پنهان',
};

export const LICENCE_STATUSES = ['NONE', 'VALID', 'EXPIRED', 'REVOKED'] as const;
export type LicenceStatusName = (typeof LICENCE_STATUSES)[number];

export const LICENCE_STATUS_FA: Record<LicenceStatusName, string> = {
  NONE: 'ثبت‌نشده',
  VALID: 'معتبر',
  EXPIRED: 'منقضی',
  REVOKED: 'باطل‌شده',
};

/** Saturday first, as the Persian week runs. */
export const WEEKDAYS_FA = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'] as const;

export const isCentreStatus = (value: unknown): value is CentreStatus =>
  typeof value === 'string' && (CENTRE_STATUSES as readonly string[]).includes(value);

export const isLicenceStatus = (value: unknown): value is LicenceStatusName =>
  typeof value === 'string' && (LICENCE_STATUSES as readonly string[]).includes(value);

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** An announced opening time, or null when the field is left empty. */
export function parseClock(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  let out = '';
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c >= 0x06f0 && c <= 0x06f9) out += String(c - 0x06f0);
    else if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else out += ch;
  }
  out = out.replace(/[.٫]/g, ':');
  if (/^\d{1,2}:\d{1,2}$/.test(out)) {
    const [h, m] = out.split(':');
    out = h!.padStart(2, '0') + ':' + m!.padStart(2, '0');
  }
  if (!HHMM.test(out)) throw new Error('BAD_CLOCK');
  return out;
}

export interface HoursRowInput {
  readonly weekday: number;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

/**
 * What a day of the week says. A day with neither time is simply not announced;
 * a half-filled or reversed day is refused rather than guessed.
 */
export function hoursProblem(row: { weekday: number; opensAt: string | null; closesAt: string | null }): string | null {
  if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6) return 'روز هفته معتبر نیست.';
  if (row.opensAt === null && row.closesAt === null) return null;
  if (row.opensAt === null || row.closesAt === null) {
    return WEEKDAYS_FA[row.weekday] + ': ساعت باز و بسته شدن را با هم بنویسید یا هر دو را خالی بگذارید.';
  }
  if (row.opensAt >= row.closesAt) {
    return WEEKDAYS_FA[row.weekday] + ': ساعت بسته شدن باید بعد از ساعت باز شدن باشد.';
  }
  return null;
}

export interface CentreCompletenessInput {
  readonly aboutFa: string | null;
  readonly phone: string | null;
  readonly serviceCount: number;
  readonly speciesCount: number;
  readonly facilityCount: number;
  readonly publicBranchesWithCity: number;
  readonly branchesWithHours: number;
  readonly acceptedMembers: number;
  readonly licenceRecorded: boolean;
}

const ITEMS: ReadonlyArray<{ labelFa: string; done: (input: CentreCompletenessInput) => boolean }> = [
  { labelFa: 'معرفی مرکز', done: (i) => hasText(i.aboutFa) },
  { labelFa: 'تماس عمومی', done: (i) => hasText(i.phone) },
  { labelFa: 'دست‌کم یک خدمت', done: (i) => i.serviceCount > 0 },
  { labelFa: 'گونه‌هایی که پذیرفته می‌شوند', done: (i) => i.speciesCount > 0 },
  { labelFa: 'امکانات', done: (i) => i.facilityCount > 0 },
  { labelFa: 'دست‌کم یک شعبه عمومی با شهر', done: (i) => i.publicBranchesWithCity > 0 },
  { labelFa: 'ساعات اعلام‌شده دست‌کم یک شعبه', done: (i) => i.branchesWithHours > 0 },
  { labelFa: 'دست‌کم یک عضو حرفه‌ای تأییدشده', done: (i) => i.acceptedMembers > 0 },
  { labelFa: 'مجوز ثبت‌شده', done: (i) => i.licenceRecorded },
];

function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== '';
}

export function centreCompleteness(input: CentreCompletenessInput): {
  done: number;
  total: number;
  missing: string[];
  complete: boolean;
} {
  const missing = ITEMS.filter((item) => !item.done(input)).map((item) => item.labelFa);
  return { done: ITEMS.length - missing.length, total: ITEMS.length, missing, complete: missing.length === 0 };
}

/**
 * A centre page goes public when a visitor can actually use it: who it is and
 * where to go. An unowned, reviewed suggestion has a city instead of a branch
 * until someone claims it (§10, DEC-0166).
 */
export function centrePublishBlockers(
  input: CentreCompletenessInput,
  ownership: { owned: boolean; hasListedCity: boolean } = { owned: true, hasListedCity: false },
): string[] {
  if (!ownership.owned) {
    // A city is enough: either the one recorded for the suggestion, or a public branch's.
    return ownership.hasListedCity || input.publicBranchesWithCity > 0
      ? []
      : ['پیش از انتشار، شهر مرکز بدون مالک را انتخاب کنید یا شعبه‌ای با شهر را عمومی کنید.'];
  }
  const problems: string[] = [];
  if (!hasText(input.aboutFa)) problems.push('پیش از انتشار، معرفی مرکز را بنویسید.');
  if (input.publicBranchesWithCity === 0) problems.push('پیش از انتشار، دست‌کم یک شعبه را با شهر عمومی کنید.');
  return problems;
}

/**
 * The licence a visitor may read. Only what a reviewer actually recorded: an
 * unrecorded licence is shown as unrecorded, never as valid (§9, prompt rule on
 * invented licences).
 */
export const publicLicence = (
  licenceStatus: LicenceStatusName,
  licenceNumber: string | null,
): { statusFa: string; number: string | null } | null =>
  licenceStatus === 'NONE' && !hasText(licenceNumber)
    ? null
    : { statusFa: LICENCE_STATUS_FA[licenceStatus], number: hasText(licenceNumber) ? licenceNumber!.trim() : null };
