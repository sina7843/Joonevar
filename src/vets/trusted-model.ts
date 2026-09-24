/**
 * What a trusted veterinarian must have, and what they declare — Phase 2.5 §7 (PROMPT-010).
 *
 * The conditions are an active practice licence period and a valid association
 * membership, both read from the one authoritative answer each of them has
 * (PROMPT-008, PROMPT-009). Nothing here consults a status column of its own, and
 * nothing here is proven by a file: the microchip reader is a self-declaration,
 * so every word shown publicly about it says «تجهیزات اعلام‌شده».
 */
import type { VetCaseStatus } from './professional-model.ts';

export const TRUSTED_TERMS_TEXT_KEY = 'guide_text.trusted_vet_terms';
export const TRUSTED_TERMS_VERSION_KEY = 'trusted_vet.terms_version';
export const TRUSTED_DECLARATION_VERSION_KEY = 'trusted_vet.declaration_version';

/** The equipment the product asks about by name; the rest is optional and free. */
export const MICROCHIP_READER_CODE = 'MICROCHIP_READER';

export const TRUSTED_DECISIONS = ['APPROVE', 'REQUEST_CORRECTION', 'REJECT'] as const;
export type TrustedDecision = (typeof TRUSTED_DECISIONS)[number];

export const TRUSTED_DECISION_FA: Record<TrustedDecision, string> = {
  APPROVE: 'تأیید؛ پرداخت دوره معتمد باز می‌شود',
  REQUEST_CORRECTION: 'درخواست اصلاح',
  REJECT: 'رد درخواست',
};

/** Approval opens the trusted period payment and nothing more (PROMPT-011). */
export const TRUSTED_DECISION_OUTCOME: Record<TrustedDecision, VetCaseStatus> = {
  APPROVE: 'TRUSTED_APPROVED_AWAITING_PAYMENT',
  REQUEST_CORRECTION: 'NEEDS_CORRECTION',
  REJECT: 'REJECTED',
};

export const isTrustedDecision = (value: string): value is TrustedDecision => (TRUSTED_DECISIONS as readonly string[]).includes(value);

/** One unmet condition, said exactly, with where the applicant can go about it. */
export interface TrustedRequirement {
  readonly code: 'LICENCE' | 'MEMBERSHIP' | 'TERMS' | 'OPEN_CASE' | 'ALREADY_TRUSTED';
  readonly met: boolean;
  readonly labelFa: string;
  readonly reasonFa: string | null;
  readonly href: string | null;
}

export interface TrustedEligibilityFacts {
  /** The licence case is active and its paid period has not run out. */
  readonly licenceActive: boolean;
  readonly licenceStandingFa: string;
  readonly membershipValid: boolean;
  readonly membershipStatusFa: string;
  /** The terms text and both versions are configured; otherwise nothing may be accepted. */
  readonly termsConfigured: boolean;
  /** An open trusted case of this account, if there is one. */
  readonly openCaseStatus: VetCaseStatus | null;
  readonly alreadyTrusted: boolean;
}

/**
 * Every condition, met or not, each with its own reason and link.
 *
 * The caller shows the request only to an active licensed veterinarian; when the
 * membership is what is missing, the button is disabled and the reason names the
 * membership and links to it, rather than saying «شرایط را ندارید».
 */
export function trustedRequirements(facts: TrustedEligibilityFacts): readonly TrustedRequirement[] {
  return [
    {
      code: 'LICENCE',
      met: facts.licenceActive,
      labelFa: 'پروانه فعالیت فعال',
      reasonFa: facts.licenceActive ? null : 'دوره فعالیت پروانه شما فعال نیست (' + facts.licenceStandingFa + '). تا فعال نشدن آن، درخواست معتمد باز نمی‌شود.',
      href: facts.licenceActive ? null : '/account/vet-profile',
    },
    {
      code: 'MEMBERSHIP',
      met: facts.membershipValid,
      labelFa: 'عضویت معتبر انجمن',
      reasonFa: facts.membershipValid ? null : 'عضویت انجمن شما معتبر نیست (' + facts.membershipStatusFa + '). برای درخواست معتمد، عضویت باید معتبر باشد.',
      href: facts.membershipValid ? null : '/membership',
    },
    {
      code: 'TERMS',
      met: facts.termsConfigured,
      labelFa: 'تعهدنامه منتشرشده',
      reasonFa: facts.termsConfigured ? null : 'متن و نسخه تعهدنامه معتمد هنوز از پنل مدیریت ثبت نشده است؛ تا آن زمان درخواستی پذیرفته نمی‌شود.',
      href: null,
    },
    {
      code: 'OPEN_CASE',
      met: facts.openCaseStatus === null,
      labelFa: 'نداشتن درخواست باز معتمد',
      reasonFa: facts.openCaseStatus === null ? null : 'یک درخواست معتمد باز دارید؛ نتیجه آن در همین صفحه دیده می‌شود.',
      href: facts.openCaseStatus === null ? null : '/account/vet-profile',
    },
    {
      code: 'ALREADY_TRUSTED',
      met: !facts.alreadyTrusted,
      labelFa: 'معتمد نبودن در حال حاضر',
      reasonFa: facts.alreadyTrusted ? 'شما هم‌اکنون دامپزشک معتمد هستید.' : null,
      href: null,
    },
  ];
}

export const trustedAllowed = (requirements: readonly TrustedRequirement[]): boolean => requirements.every((requirement) => requirement.met);

/** The reasons that are not met, in the order the applicant should read them. */
export const unmetTrusted = (requirements: readonly TrustedRequirement[]): readonly TrustedRequirement[] => requirements.filter((requirement) => !requirement.met);

export interface TrustedDeclarationInput {
  readonly acceptedTermsVersion: string;
  readonly microchipReaderDeclared: boolean;
  /** Anything else the applicant says they have. Optional, and never verified. */
  readonly equipmentCodes?: readonly string[];
  readonly statementFa?: string | null;
}

/**
 * Why a declaration cannot be accepted, or null.
 *
 * Accepting a version that is no longer the published one is refused rather than
 * silently upgraded: what was accepted must be what was shown.
 */
export function declarationProblem(input: TrustedDeclarationInput, currentTermsVersion: string): string | null {
  if (!input.microchipReaderDeclared) return 'برای درخواست معتمد، داشتن دستگاه میکروچیپ‌ریدر باید خوداظهاری شود.';
  const accepted = (input.acceptedTermsVersion ?? '').trim();
  if (accepted === '') return 'پذیرش تعهدنامه ثبت نشده است.';
  if (accepted !== currentTermsVersion) return 'متن تعهدنامه به‌روز شده است؛ صفحه را تازه کنید و نسخه تازه را بپذیرید.';
  const statement = (input.statementFa ?? '').trim();
  if (statement.length > 1000) return 'توضیح درخواست حداکثر ۱۰۰۰ نویسه است.';
  const codes = input.equipmentCodes ?? [];
  if (codes.length > 20) return 'فهرست تجهیزات اعلام‌شده بیش از حد مجاز است.';
  if (new Set(codes).size !== codes.length) return 'یک تجهیز دوبار اعلام شده است.';
  return null;
}

/** The structured checks the association records for a trusted application (PROMPT-007). */
export const TRUSTED_REVIEW_CHECKS = [
  { code: 'LICENCE_STILL_ACTIVE', labelFa: 'دوره پروانه فعالیت متقاضی هنوز فعال است' },
  { code: 'MEMBERSHIP_STILL_VALID', labelFa: 'عضویت انجمن متقاضی هنوز معتبر است' },
  { code: 'TERMS_ACCEPTED', labelFa: 'نسخه پذیرفته‌شده تعهدنامه همان نسخه منتشرشده است' },
  { code: 'READER_DECLARED', labelFa: 'خوداظهاری داشتن میکروچیپ‌ریدر ثبت شده است (مدرک لازم نیست)' },
] as const;
