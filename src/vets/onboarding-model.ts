/**
 * Veterinarian application and claim rules without a database —
 * Requirements-Phase-2 §8, §10, §22 (PROMPT-007).
 *
 * An approved application gives the account a directory profile (new or
 * claimed) with Professional Verification. It never grants the Phase 1
 * TRUSTED_VET role and never buys or implies advertising (DEC-0145, P2-D05).
 */
export const VET_APPLICATION_KINDS = ['PROFILE', 'CLAIM'] as const;
export type VetApplicationKind = (typeof VET_APPLICATION_KINDS)[number];

export const VET_APPLICATION_STATUSES = ['SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const;
export type VetApplicationStatus = (typeof VET_APPLICATION_STATUSES)[number];

export const VET_DOCUMENT_KINDS = ['COUNCIL_CARD', 'PRACTICE_LICENCE', 'IDENTITY', 'OTHER'] as const;
export type VetDocumentKind = (typeof VET_DOCUMENT_KINDS)[number];

export const REVIEW_DECISIONS = ['APPROVE', 'REQUEST_CORRECTION', 'REJECT'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const APPLICATION_KIND_FA: Record<VetApplicationKind, string> = {
  PROFILE: 'ساخت پروفایل دامپزشک',
  CLAIM: 'Claim پروفایل بدون مالک',
};

export const APPLICATION_STATUS_FA: Record<VetApplicationStatus, string> = {
  SUBMITTED: 'در انتظار بررسی',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
  WITHDRAWN: 'بایگانی‌شده با انصراف',
};

export const DOCUMENT_KIND_FA: Record<VetDocumentKind, string> = {
  COUNCIL_CARD: 'کارت نظام دامپزشکی',
  PRACTICE_LICENCE: 'پروانه اشتغال',
  IDENTITY: 'مدرک هویتی',
  OTHER: 'سایر مدارک',
};

export const REVIEW_DECISION_FA: Record<ReviewDecision, string> = {
  APPROVE: 'تأیید',
  REQUEST_CORRECTION: 'درخواست اصلاح',
  REJECT: 'رد',
};

export const OPEN_STATUSES: readonly VetApplicationStatus[] = ['SUBMITTED', 'NEEDS_CORRECTION'];
export const MAX_DOCUMENTS = 5;

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isApplicationKind = oneOf(VET_APPLICATION_KINDS);
export const isDocumentKind = oneOf(VET_DOCUMENT_KINDS);
export const isReviewDecision = oneOf(REVIEW_DECISIONS);

export const isOpenApplication = (status: VetApplicationStatus): boolean => OPEN_STATUSES.includes(status);

/** The status a decision leads to; only a submitted application is decided. */
export function decisionOutcome(status: VetApplicationStatus, decision: ReviewDecision): VetApplicationStatus | null {
  if (status !== 'SUBMITTED') return null;
  if (decision === 'APPROVE') return 'APPROVED';
  return decision === 'REJECT' ? 'REJECTED' : 'NEEDS_CORRECTION';
}

export const canResubmit = (status: VetApplicationStatus): boolean => status === 'NEEDS_CORRECTION';
export const canWithdraw = (status: VetApplicationStatus): boolean => isOpenApplication(status);

/** One appeal per application, and only after a rejection (§8). */
export const canAppeal = (application: { status: VetApplicationStatus; appealedAt: Date | null }): boolean =>
  application.status === 'REJECTED' && application.appealedAt === null;

function latinDigits(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else out += ch;
  }
  return out;
}

/**
 * The council code as typed: Persian or Arabic digits, spaces and letter case
 * do not make a different code. No official format is invented here; only a
 * plausible shape is required (DEC-0165).
 */
export function normalizeCouncilCode(raw: string): string {
  return latinDigits(raw).replace(/\s+/g, '').toUpperCase();
}

export function councilCodeProblem(code: string): string | null {
  if (code === '') return 'کد نظام دامپزشکی را بنویسید.';
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) return 'کد نظام دامپزشکی فقط رقم، حرف لاتین و خط تیره دارد (۳ تا ۲۰ نویسه).';
  return null;
}
