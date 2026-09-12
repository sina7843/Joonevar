/**
 * Document verification rules that need no database — Requirements-Phase-2
 * §17 (PROMPT-014).
 *
 * Two decisions live here: how a typed or scanned code is read, and how little
 * a stranger is told about the document behind it. The answer never contains
 * the owner's name or contact, a national id, an address, a microchip number or
 * a file — a verification proves a document exists, it does not hand over the
 * record (§17, §20).
 */

export const DOCUMENT_KINDS = ['REGISTRATION_SHEET', 'PEDIGREE', 'PUPPY_CARD'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_FA: Record<DocumentKind, string> = {
  REGISTRATION_SHEET: 'برگه ثبتی',
  PEDIGREE: 'شجره‌نامه',
  PUPPY_CARD: 'کارت توله',
};

/**
 * What a verification can answer.
 *
 * `REPLACED` is a document that still exists but has been superseded: a
 * pedigree whose parentage result was later corrected carries that notice.
 * There is deliberately no «باطل» state: Phase 1 records no revocation of an
 * issued document, and inventing one would claim a fact the platform does not
 * hold (DEC-0174).
 */
export const VERIFICATION_STATES = ['VALID', 'REPLACED', 'NOT_FOUND', 'RATE_LIMITED'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const VERIFICATION_STATE_FA: Record<VerificationState, string> = {
  VALID: 'معتبر',
  REPLACED: 'جایگزین‌شده',
  NOT_FOUND: 'یافت نشد',
  RATE_LIMITED: 'تعداد استعلام بیش از حد مجاز',
};

/** Prefix → what kind of document that code belongs to (`src/domain/ids.ts`). */
const PREFIX: ReadonlyArray<{ prefix: string; kind: DocumentKind; byPetId?: boolean }> = [
  { prefix: 'RS-', kind: 'REGISTRATION_SHEET' },
  { prefix: 'PD-', kind: 'PEDIGREE' },
  { prefix: 'PC-', kind: 'PUPPY_CARD' },
  // The animal's own identifier, printed on its registration sheet (§13).
  { prefix: 'PET-', kind: 'REGISTRATION_SHEET', byPetId: true },
];

const PERSIAN_DIGITS = /[۰-۹٠-٩]/g;

/**
 * Read what the visitor gave us.
 *
 * The same value arrives three ways — typed from paper, pasted, or scanned as a
 * QR that holds the verification address — so a full address is reduced to its
 * last segment, Persian digits become Latin ones, and anything that is not part
 * of a code is dropped rather than guessed at.
 */
export function normalizeCode(raw: string): string {
  let value = (raw ?? '').trim();
  if (value === '') return '';

  // A scanned QR carries the address of this very page.
  const marker = value.lastIndexOf('/verify/');
  if (marker >= 0) value = value.slice(marker + '/verify/'.length);
  const query = value.indexOf('?');
  if (query >= 0) value = value.slice(0, query);
  try {
    value = decodeURIComponent(value);
  } catch {
    // A half-encoded paste is read as it stands rather than refused.
  }

  return value
    .replace(PERSIAN_DIGITS, (digit) => String((digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)) % 10))
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}

export interface CodeShape {
  readonly kind: DocumentKind;
  /** True when the code is the animal's Pet ID rather than the document's own number. */
  readonly byPetId: boolean;
  readonly code: string;
}

/** Which document a code belongs to, or null when no prefix matches. */
export function readCode(raw: string): CodeShape | null {
  const code = normalizeCode(raw);
  if (code === '') return null;
  const match = PREFIX.find((entry) => code.startsWith(entry.prefix));
  if (!match) return null;
  // Prefix plus at least six characters: shorter is a typo, not a code.
  if (code.length < match.prefix.length + 6) return null;
  return { kind: match.kind, byPetId: match.byPetId === true, code };
}

export interface PublicAnimalFacts {
  readonly speciesFa: string | null;
  readonly breedFa: string | null;
  readonly sexFa: string | null;
  /** The year only: a birth date narrows an animal down further than §17 asks. */
  readonly birthYear: string | null;
}

export const SEX_FA: Record<string, string> = { MALE: 'نر', FEMALE: 'ماده' };

export function publicAnimalFacts(input: {
  speciesFa: string | null;
  breedFa: string | null;
  sex: string | null;
  birthDate: string | null;
}): PublicAnimalFacts {
  return {
    speciesFa: input.speciesFa,
    breedFa: input.breedFa,
    sexFa: input.sex === null ? null : (SEX_FA[input.sex] ?? null),
    birthYear: input.birthDate === null ? null : (/^(\d{4})-/.exec(input.birthDate)?.[1] ?? null),
  };
}

/**
 * The fields a verification answer may never carry, kept as data so the test
 * can assert on the same list the reviewer reads (§17, §20).
 */
export const NEVER_DISCLOSED: readonly string[] = [
  'ownerName',
  'ownerAccountId',
  'ownerPhone',
  'nationalId',
  'address',
  'microchipNumber',
  'sampleTrackingCode',
  'fileId',
  'animalName',
];
