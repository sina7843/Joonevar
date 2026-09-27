/**
 * Finder report categories and decision rules — PHASE-4 PROMPT-007, pure.
 */

export const FINDER_REPORT_CATEGORIES = [
  'FALSE_ANIMAL_DATA',
  'INVALID_CHIP_CLAIM',
  'HARASSMENT',
  'CONTRACT_BREACH',
  'UNAUTHORIZED_BROKERAGE',
  'CROSS_BREED_REQUEST',
  'ANIMAL_ABUSE',
  'OTHER_POLICY',
] as const;
export type FinderReportCategory = (typeof FINDER_REPORT_CATEGORIES)[number];

export const CATEGORY_FA: Record<FinderReportCategory, string> = {
  FALSE_ANIMAL_DATA: 'اطلاعات نادرست حیوان',
  INVALID_CHIP_CLAIM: 'ادعای میکروچیپ نامعتبر',
  HARASSMENT: 'مزاحمت یا رفتار نامناسب',
  CONTRACT_BREACH: 'نقض قرارداد',
  UNAUTHORIZED_BROKERAGE: 'واسطه‌گری غیرمجاز',
  CROSS_BREED_REQUEST: 'درخواست خارج از نژاد',
  ANIMAL_ABUSE: 'آزار حیوان',
  OTHER_POLICY: 'نقض دیگر قوانین',
};

export const isFinderCategory = (value: unknown): value is FinderReportCategory =>
  typeof value === 'string' && (FINDER_REPORT_CATEGORIES as readonly string[]).includes(value);

/** The nearest generic reason, kept on the row for readers that predate categories. */
export const REASON_FOR: Record<FinderReportCategory, string> = {
  FALSE_ANIMAL_DATA: 'INCORRECT_INFO',
  INVALID_CHIP_CLAIM: 'INCORRECT_INFO',
  HARASSMENT: 'OFFENSIVE',
  CONTRACT_BREACH: 'OTHER',
  UNAUTHORIZED_BROKERAGE: 'SPAM',
  CROSS_BREED_REQUEST: 'SPAM',
  ANIMAL_ABUSE: 'OFFENSIVE',
  OTHER_POLICY: 'OTHER',
};

export type FinderTarget = 'PROFILE' | 'MEDIA' | 'MESSAGE' | 'REQUEST' | 'ACCOUNT';
export const TARGET_KIND: Record<FinderTarget, string> = {
  PROFILE: 'MATING_PROFILE',
  MEDIA: 'MATING_PROFILE_MEDIA',
  MESSAGE: 'FINDER_MESSAGE',
  REQUEST: 'FINDER_REQUEST',
  ACCOUNT: 'FINDER_ACCOUNT',
};
export const FINDER_TARGET_KINDS = Object.values(TARGET_KIND);

export const TARGET_FA: Record<string, string> = {
  MATING_PROFILE: 'پروفایل جفت‌یابی',
  MATING_PROFILE_MEDIA: 'تصویر پروفایل',
  FINDER_MESSAGE: 'پیام گفت‌وگو',
  FINDER_REQUEST: 'درخواست جفت‌گیری',
  FINDER_ACCOUNT: 'کاربر',
};

/** What a moderator may do to each kind of target. Sanctions are separate and superadmin-only. */
export type FinderAction = 'DISMISS' | 'HIDE_MESSAGE' | 'HIDE_MEDIA' | 'UNLIST_PROFILE' | 'WARN_ONLY';
export const ACTIONS_FOR: Record<string, readonly FinderAction[]> = {
  MATING_PROFILE: ['DISMISS', 'UNLIST_PROFILE', 'WARN_ONLY'],
  MATING_PROFILE_MEDIA: ['DISMISS', 'HIDE_MEDIA', 'UNLIST_PROFILE', 'WARN_ONLY'],
  FINDER_MESSAGE: ['DISMISS', 'HIDE_MESSAGE', 'WARN_ONLY'],
  FINDER_REQUEST: ['DISMISS', 'WARN_ONLY'],
  FINDER_ACCOUNT: ['DISMISS', 'WARN_ONLY'],
};
export const ACTION_FA: Record<FinderAction, string> = {
  DISMISS: 'رد گزارش',
  HIDE_MESSAGE: 'پنهان‌کردن پیام',
  HIDE_MEDIA: 'پنهان‌کردن تصویر',
  UNLIST_PROFILE: 'خارج‌کردن پروفایل از جفت‌یابی',
  WARN_ONLY: 'تأیید تخلف با اخطار',
};

export const MAX_EVIDENCE_FILES = 3;

/** Null when the decision is allowed; otherwise the reason it is not. */
export function decisionProblem(input: {
  targetKind: string;
  action: string;
  reasonFa: string;
  status: string;
  assignedTo: string | null;
  actorId: string;
}): string | null {
  if (input.status !== 'OPEN') return 'این گزارش پیش‌تر تصمیم گرفته شده است.';
  if (input.assignedTo !== input.actorId) return 'ابتدا گزارش را برای بررسی بردارید؛ هر گزارش را یک نفر بررسی می‌کند.';
  if (!(ACTIONS_FOR[input.targetKind] ?? []).includes(input.action as FinderAction)) return 'این اقدام برای این نوع گزارش مجاز نیست.';
  if (input.reasonFa.trim().length < 5) return 'دلیل تصمیم را کامل بنویسید؛ برای اعتراض و سابقه لازم است.';
  return null;
}

/** An appeal is decided by someone other than the person who decided the report. */
export function appealProblem(input: { reportDecidedBy: string | null; actorId: string; status: string; reasonFa: string }): string | null {
  if (input.status !== 'OPEN') return 'این اعتراض پیش‌تر بررسی شده است.';
  if (input.reportDecidedBy === input.actorId) return 'اعتراض را کسی جز تصمیم‌گیرنده اول بررسی می‌کند.';
  if (input.reasonFa.trim().length < 5) return 'دلیل تصمیم درباره اعتراض را بنویسید.';
  return null;
}
