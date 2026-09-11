/**
 * Suggested directory records and centre claims — Requirements-Phase-2 §9, §10,
 * §20, §22 (PROMPT-009).
 *
 * An ordinary user may say «this veterinarian exists» or «this centre exists».
 * Nothing they write is published as a fact: a reviewer reads it, the record is
 * created without an owner, and the people it describes take control later by
 * claiming it. A claim moves who may edit from now on; the history the audit
 * trail already holds stays where it is (§10, DEC-0166).
 *
 * The application statuses are the ones PROMPT-007 already defined, so a
 * suggestion, a veterinarian application and a centre claim are read with the
 * same words (DEC-0169).
 */
export const SUGGESTION_KINDS = ['VET', 'CENTRE'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_KIND_FA: Record<SuggestionKind, string> = {
  VET: 'دامپزشک',
  CENTRE: 'مرکز دامپزشکی',
};

/** Documents a representative attaches to a centre claim. None of them is invented by the product. */
export const CLAIM_DOCUMENT_KINDS = ['CENTRE_LICENCE', 'AUTHORIZATION_LETTER', 'IDENTITY', 'OTHER'] as const;
export type ClaimDocumentKind = (typeof CLAIM_DOCUMENT_KINDS)[number];

export const CLAIM_DOCUMENT_KIND_FA: Record<ClaimDocumentKind, string> = {
  CENTRE_LICENCE: 'پروانه یا مجوز مرکز',
  AUTHORIZATION_LETTER: 'معرفی‌نامه یا وکالت‌نامه',
  IDENTITY: 'مدرک هویتی نماینده',
  OTHER: 'سایر مدارک',
};

export const MAX_CLAIM_DOCUMENTS = 5;

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isSuggestionKind = oneOf(SUGGESTION_KINDS);
export const isClaimDocumentKind = oneOf(CLAIM_DOCUMENT_KINDS);

export interface SuggestionFields {
  readonly displayNameFa: string;
  readonly cityId: string | null;
  readonly contactFa: string | null;
  readonly sourceFa: string;
  readonly noteFa: string | null;
}

/**
 * What a suggestion must say before anyone spends review time on it: a name, a
 * city, and where the information came from (§10). A contact is welcome but a
 * suggestion is not refused for the lack of one.
 */
export function suggestionProblem(fields: {
  displayNameFa: string | null;
  cityId: string | null;
  sourceFa: string | null;
}): string | null {
  const name = (fields.displayNameFa ?? '').trim();
  if (name === '') return 'نام را بنویسید.';
  if (name.length < 3) return 'نام دست‌کم سه نویسه دارد.';
  if ((fields.cityId ?? '').trim() === '') return 'شهر را انتخاب کنید.';
  if ((fields.sourceFa ?? '').trim() === '') return 'منبع اطلاعات را بنویسید؛ بدون آن پیشنهاد بررسی نمی‌شود.';
  return null;
}

/**
 * A claim needs a person who says who they are at that centre. The role is
 * free text because the product does not know a centre's internal titles.
 */
export function claimProblem(fields: { claimantNameFa: string | null; roleFa: string | null; documents: number }): string | null {
  if ((fields.claimantNameFa ?? '').trim() === '') return 'نام و نام خانوادگی نماینده را بنویسید.';
  if ((fields.roleFa ?? '').trim() === '') return 'سمت شما در این مرکز را بنویسید.';
  if (fields.documents === 0) return 'دست‌کم یک مدرک (پروانه مرکز یا معرفی‌نامه) پیوست کنید.';
  if (fields.documents > MAX_CLAIM_DOCUMENTS) {
    return 'حداکثر ' + MAX_CLAIM_DOCUMENTS.toLocaleString('fa-IR') + ' مدرک پیوست می‌شود.';
  }
  return null;
}
