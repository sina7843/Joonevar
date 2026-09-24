/**
 * Veterinary professional identity without a database — Phase 2.5 PROMPT-002
 * (PHASE_2_5_SPEC_FA §3–§4, PRODUCT_DECISIONS «دامپزشکان»).
 *
 * Three facts that were one status in Phase 2 are kept apart here:
 *  - Role: the internal permission (`account_role`, e.g. TRUSTED_VET). Only a
 *    Role opens a context or an operation. Nothing in this file grants one.
 *  - Tag: the single public professional description of an account. At most one
 *    is current, and its history is never rewritten (`vet_tag_assignment`).
 *  - Status: where a professional case stands in its workflow.
 *
 * There is no professional Badge. Advertising, «بدون مالک» and moderation are
 * separate facts about a directory page, not professional tags.
 */

export const VET_TAGS = ['STUDENT', 'UNLICENSED', 'LICENSED', 'TRUSTED'] as const;
export type VetTag = (typeof VET_TAGS)[number];

/**
 * General or specialist is a description inside a doctor's tag, not a tag of its
 * own. NOT_DECLARED exists only for records that predate the question: a Phase 2
 * verified profile never said which it was, and inventing one would be a fact
 * nobody gave (DEC-0188).
 */
export const VET_PRACTICE_SCOPES = ['GENERAL', 'SPECIALIST', 'NOT_DECLARED'] as const;
export type VetPracticeScope = (typeof VET_PRACTICE_SCOPES)[number];

/** Sources that may carry NOT_DECLARED: the migration backfill and approvals of the Phase 2 form. */
export const LEGACY_TAG_SOURCES = ['BACKFILL_VET_PROFILE', 'LEGACY_VET_APPLICATION', 'LEGACY_VET_REGISTRY'] as const;

const TAG_FA: Record<VetTag, string> = {
  STUDENT: 'دانشجوی دامپزشکی',
  UNLICENSED: 'دکتر دامپزشک - {scope} - بدون پروانه فعالیت',
  LICENSED: 'دکتر دامپزشک - {scope} - دارای پروانه فعالیت',
  TRUSTED: 'دکتر دامپزشک معتمد - {scope}',
};

const SCOPE_FA: Record<Exclude<VetPracticeScope, 'NOT_DECLARED'>, string> = {
  GENERAL: 'عمومی',
  SPECIALIST: 'متخصص',
};

/** The one public label of a tag. An undeclared scope is left out rather than guessed. */
export function vetTagLabel(tag: VetTag, scope: VetPracticeScope | null): string {
  const label = TAG_FA[tag];
  if (tag === 'STUDENT') return label;
  return scope === null || scope === 'NOT_DECLARED' ? label.replace(' - {scope}', '') : label.replace('{scope}', SCOPE_FA[scope]);
}

/** Things a directory page may show that are not a professional tag and must never be stored as one. */
export const NOT_PROFESSIONAL_TAGS = ['ADVERTISED', 'UNOWNED_PROFILE', 'HIDDEN_BY_REVIEW', 'PENDING_REVIEW', 'DOCUMENTS_VERIFIED'] as const;

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isVetTag = oneOf(VET_TAGS);
export const isPracticeScope = oneOf(VET_PRACTICE_SCOPES);

/** Why a tag and scope cannot go together, or null. */
export function tagScopeProblem(tag: VetTag, scope: VetPracticeScope | null, source: string): string | null {
  if (tag === 'STUDENT') return scope === null ? null : 'Tag دانشجو وصف عمومی یا متخصص ندارد.';
  if (scope === null) return 'برای Tag دکتر، عمومی یا متخصص بودن لازم است.';
  if (scope === 'NOT_DECLARED' && !(LEGACY_TAG_SOURCES as readonly string[]).includes(source)) {
    return 'عمومی یا متخصص بودن باید اعلام شود؛ «اعلام‌نشده» فقط برای سوابق پیش از فاز ۲.۵ است.';
  }
  return null;
}

// ── Workflow status ─────────────────────────────────────────────────────────

export const VET_CASE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'REJECTED',
  'WITHDRAWN',
  'VERIFIED_STUDENT',
  'VERIFIED_NO_LICENSE',
  'LICENSE_APPROVED_AWAITING_PAYMENT',
  'ACTIVE_LICENSED_VET',
  'EXPIRED',
  'SUSPENDED',
  /** A trusted application the association accepted; its period is paid for next (PROMPT-011). */
  'TRUSTED_APPROVED_AWAITING_PAYMENT',
] as const;
export type VetCaseStatus = (typeof VET_CASE_STATUSES)[number];
export const isVetCaseStatus = oneOf(VET_CASE_STATUSES);

/**
 * Who moves a case. APPLICANT is the account the case belongs to; REVIEWER is the
 * association-side reviewer, never the applicant; SYSTEM is a server-verified
 * event such as a payment verification or a period ending — never a browser return.
 */
export type VetCaseActor = 'APPLICANT' | 'REVIEWER' | 'SYSTEM';

type Move = { readonly to: VetCaseStatus; readonly by: VetCaseActor; readonly reasonRequired: boolean };

const MOVES: Record<VetCaseStatus, readonly Move[]> = {
  DRAFT: [
    { to: 'SUBMITTED', by: 'APPLICANT', reasonRequired: false },
    { to: 'WITHDRAWN', by: 'APPLICANT', reasonRequired: false },
  ],
  SUBMITTED: [
    { to: 'UNDER_REVIEW', by: 'REVIEWER', reasonRequired: false },
    { to: 'WITHDRAWN', by: 'APPLICANT', reasonRequired: false },
  ],
  UNDER_REVIEW: [
    { to: 'NEEDS_CORRECTION', by: 'REVIEWER', reasonRequired: true },
    { to: 'REJECTED', by: 'REVIEWER', reasonRequired: true },
    { to: 'VERIFIED_STUDENT', by: 'REVIEWER', reasonRequired: true },
    { to: 'VERIFIED_NO_LICENSE', by: 'REVIEWER', reasonRequired: true },
    // A trusted approval opens the trusted period payment; it does not make the trusted tag.
    { to: 'TRUSTED_APPROVED_AWAITING_PAYMENT', by: 'REVIEWER', reasonRequired: true },
    // A licence approval opens payment; it does not make the licensed tag (PRODUCT_DECISIONS).
    { to: 'LICENSE_APPROVED_AWAITING_PAYMENT', by: 'REVIEWER', reasonRequired: true },
    // A reviewer who stops mid-review returns it to the queue.
    { to: 'SUBMITTED', by: 'REVIEWER', reasonRequired: false },
  ],
  NEEDS_CORRECTION: [
    { to: 'SUBMITTED', by: 'APPLICANT', reasonRequired: false },
    { to: 'WITHDRAWN', by: 'APPLICANT', reasonRequired: false },
  ],
  REJECTED: [],
  WITHDRAWN: [],
  VERIFIED_STUDENT: [{ to: 'SUSPENDED', by: 'REVIEWER', reasonRequired: true }],
  VERIFIED_NO_LICENSE: [{ to: 'SUSPENDED', by: 'REVIEWER', reasonRequired: true }],
  // No deadline: the wait for payment never expires on its own (R3).
  LICENSE_APPROVED_AWAITING_PAYMENT: [
    { to: 'ACTIVE_LICENSED_VET', by: 'SYSTEM', reasonRequired: false },
    { to: 'SUSPENDED', by: 'REVIEWER', reasonRequired: true },
  ],
  ACTIVE_LICENSED_VET: [
    { to: 'EXPIRED', by: 'SYSTEM', reasonRequired: false },
    { to: 'SUSPENDED', by: 'REVIEWER', reasonRequired: true },
  ],
  // Renewal is a new verified payment for the same approved licence.
  EXPIRED: [{ to: 'ACTIVE_LICENSED_VET', by: 'SYSTEM', reasonRequired: false }],
  // No deadline here either: the trusted approval waits for its payment (PROMPT-011),
  // and the association may still suspend what it approved.
  TRUSTED_APPROVED_AWAITING_PAYMENT: [{ to: 'SUSPENDED', by: 'REVIEWER', reasonRequired: true }],
  SUSPENDED: [{ to: 'UNDER_REVIEW', by: 'REVIEWER', reasonRequired: true }],
};

/** The move from → to by this actor, or null when it is not a legal transition. */
export function vetCaseMove(from: VetCaseStatus, to: VetCaseStatus, by: VetCaseActor): Move | null {
  return MOVES[from].find((move) => move.to === to && move.by === by) ?? null;
}

export const vetCaseMoves = (from: VetCaseStatus, by: VetCaseActor): readonly VetCaseStatus[] =>
  MOVES[from].filter((move) => move.by === by).map((move) => move.to);

export const isTerminalVetCase = (status: VetCaseStatus): boolean => MOVES[status].length === 0;

/**
 * The tag a case's standing supports on its own, or null when it supports none.
 * A licence approved but unpaid keeps the doctor's council-verified standing and
 * nothing more; a paid, active licence is the only way to the licensed tag.
 * Trusted is a separate application (PROMPT-010) on top of an active licence.
 */
export function tagForCaseStatus(status: VetCaseStatus, kind: 'STUDENT' | 'DOCTOR'): Exclude<VetTag, 'TRUSTED'> | null {
  if (kind === 'STUDENT') return status === 'VERIFIED_STUDENT' ? 'STUDENT' : null;
  // An approved trusted application still holds whatever the licence gave it.
  if (status === 'VERIFIED_NO_LICENSE' || status === 'LICENSE_APPROVED_AWAITING_PAYMENT') return 'UNLICENSED';
  return status === 'ACTIVE_LICENSED_VET' ? 'LICENSED' : null;
}

// ── Compatibility with the Phase 2 application ─────────────────────────────

export type LegacyApplicationStatus = 'SUBMITTED' | 'NEEDS_CORRECTION' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

/**
 * How a Phase 2 `vet_application` reads in the Phase 2.5 workflow. Its approval
 * verified a council code and nothing about a licence or a payment, so it is
 * VERIFIED_NO_LICENSE — never an active licence, and never trusted (DEC-0145).
 */
export const LEGACY_APPLICATION_STATUS: Record<LegacyApplicationStatus, VetCaseStatus> = {
  SUBMITTED: 'SUBMITTED',
  NEEDS_CORRECTION: 'NEEDS_CORRECTION',
  APPROVED: 'VERIFIED_NO_LICENSE',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
};
