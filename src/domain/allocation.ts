/**
 * Allocation rules — §16 step 5, §19.
 *
 * The rule agreed before birth is a rule, not ownership of a particular unborn
 * puppy. These functions validate its shape only: how it lands on real puppies,
 * including any rounding, is decided when the litter actually exists and both
 * sides confirm it (§19). Nothing here assumes a number of newborns.
 */
import { validation } from './errors.ts';

export type AllocationRuleType = 'FIXED' | 'PERCENTAGE' | 'MIXED';
export type AllocationSide = 'SIRE_SIDE' | 'DAM_SIDE';

export const RULE_TYPE_FA: Record<AllocationRuleType, string> = {
  FIXED: 'سهم ثابت',
  PERCENTAGE: 'سهم درصدی',
  MIXED: 'ترکیبی',
};

export const SIDE_FA: Record<AllocationSide, string> = {
  SIRE_SIDE: 'سمت پدر',
  DAM_SIDE: 'سمت مادر',
};

export interface ShareInput {
  readonly side: AllocationSide;
  readonly fixedCount?: number | null;
  readonly percent?: number | null;
}

/**
 * Structural validation of the rule — §16.
 *
 * Percentages have to add up to a whole agreement, fixed counts have to be
 * whole non-negative numbers, and a mixed rule needs both halves present. The
 * one thing this never does is guess how many puppies there will be.
 */
export function assertAllocationRule(type: AllocationRuleType, shares: readonly ShareInput[]): void {
  const sides = new Set(shares.map((s) => s.side));
  if (shares.length !== 2 || !sides.has('SIRE_SIDE') || !sides.has('DAM_SIDE')) {
    throw validation('قاعده تقسیم باید برای هر دو طرف ثبت شود.');
  }

  for (const share of shares) {
    if (type !== 'PERCENTAGE') {
      const count = share.fixedCount;
      if (count === null || count === undefined) throw validation('سهم ثابت هر دو طرف را وارد کنید.');
      if (!Number.isInteger(count) || count < 0) throw validation('سهم ثابت باید عدد صحیح و نامنفی باشد.');
    }
    if (type !== 'FIXED') {
      const percent = share.percent;
      if (percent === null || percent === undefined) throw validation('درصد سهم هر دو طرف را وارد کنید.');
      if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
        throw validation('درصد سهم باید عددی صحیح بین ۰ و ۱۰۰ باشد.');
      }
    }
  }

  if (type !== 'FIXED') {
    const total = shares.reduce((sum, share) => sum + (share.percent ?? 0), 0);
    if (total !== 100) throw validation('مجموع درصد سهم دو طرف باید ۱۰۰ باشد.');
  }
  if (type === 'FIXED') {
    const total = shares.reduce((sum, share) => sum + (share.fixedCount ?? 0), 0);
    if (total < 1) throw validation('در سهم ثابت، مجموع سهم دو طرف باید حداقل یک توله باشد.');
  }
}

/** Human-readable summary of one side, for the review screen and the permit. */
export function describeShare(type: AllocationRuleType, share: ShareInput): string {
  const parts: string[] = [];
  if (type !== 'PERCENTAGE' && share.fixedCount !== null && share.fixedCount !== undefined) {
    parts.push(share.fixedCount + ' توله ثابت');
  }
  if (type !== 'FIXED' && share.percent !== null && share.percent !== undefined) {
    parts.push(share.percent + '٪');
  }
  return parts.join(' و ') || '—';
}

/**
 * The sentence every screen showing a rule has to carry (§16, §19).
 *
 * It exists as one constant so no screen can quietly promise more than the rule
 * actually is.
 */
export const PRE_BIRTH_RULE_NOTE_FA =
  'این توافق پیش از تولد، مالکیت هیچ توله مشخصی را نهایی نمی‌کند. تخصیص واقعی پس از ثبت توله‌ها و تأیید هر دو طرف انجام می‌شود و تعداد توله‌ها پیش از زایمان فرض نمی‌شود.';
