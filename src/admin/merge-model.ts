/**
 * Merging duplicate directory records — Requirements-Phase-2 §21 (PROMPT-016).
 *
 * §21 asks that a merge keep the redirect, the relations, the history and the
 * possibility of review. The rules here are the same ones the breed bank has
 * followed since PROMPT-003, written once so all four directories answer a
 * duplicate the same way:
 *
 *  - the duplicate record is never deleted. It keeps its row, its audit trail
 *    and its public address, and that address points at the primary record;
 *  - a record already marked duplicate is not merged again, and a record that
 *    other duplicates point at cannot itself become a duplicate, so a chain of
 *    redirects can never form;
 *  - nothing is merged without a reason, because a merge is the kind of change
 *    §21 expects to be reviewable afterwards.
 */

export const MERGE_KINDS = ['VET', 'CENTRE', 'COMMUNITY'] as const;
export type MergeKind = (typeof MERGE_KINDS)[number];

export const MERGE_KIND_FA: Record<MergeKind, string> = {
  VET: 'پروفایل دامپزشک',
  CENTRE: 'مرکز دامپزشکی',
  COMMUNITY: 'انجمن یا کلاب',
};

/** Where the public page of each kind lives, for the canonical of a duplicate. */
export const MERGE_KIND_PATH: Record<MergeKind, string> = {
  VET: '/veterinarians/',
  CENTRE: '/centers/',
  COMMUNITY: '/associations/',
};

export const isMergeKind = (value: unknown): value is MergeKind =>
  typeof value === 'string' && (MERGE_KINDS as readonly string[]).includes(value);

export interface MergeCheck {
  readonly duplicateId: string;
  readonly primaryId: string;
  /** The duplicate already points at some other record. */
  readonly duplicateAlreadyMerged: boolean;
  /** The chosen primary is itself a duplicate of a third record. */
  readonly primaryAlreadyMerged: boolean;
  /** Some other record already points at the duplicate. */
  readonly duplicateHasDependents: boolean;
  readonly reason: string;
}

/**
 * Why this merge may not happen, in the order an operator should hear it.
 *
 * Identity first (it is a mistake, not a policy), then the two rules that keep
 * redirects one hop deep, then the reason every reviewable change needs.
 */
export function mergeProblem(input: MergeCheck): string | null {
  if (input.duplicateId === input.primaryId) return 'یک رکورد نمی‌تواند تکراریِ خودش باشد.';
  if (input.duplicateAlreadyMerged) return 'این رکورد پیش‌تر به‌عنوان تکراری ثبت شده است.';
  if (input.primaryAlreadyMerged) return 'رکورد اصلی خودش تکراری است؛ رکورد اصلیِ آن را انتخاب کنید.';
  if (input.duplicateHasDependents) {
    return 'رکورد دیگری تکراریِ همین رکورد ثبت شده است؛ این رکورد نمی‌تواند خودش تکراری شود.';
  }
  if ((input.reason ?? '').trim() === '') return 'دلیل ادغام را بنویسید؛ این تغییر در تاریخچه می‌ماند.';
  return null;
}

/** The address a merged record sends a visitor to. */
export const primaryPathOf = (kind: MergeKind, primarySlug: string): string => MERGE_KIND_PATH[kind] + primarySlug;

/** What a visitor reads on the page of a record that turned out to be a duplicate. */
export const DUPLICATE_NOTICE_FA =
  'این رکورد تکراری بوده و با رکورد اصلی یکی شده است. اطلاعات کامل در همان رکورد اصلی نگهداری می‌شود.';
