/**
 * The canonical veterinary professional profile, without a database — Phase 2.5 PROMPT-003.
 *
 * The profile is the existing `vet_profile` row, one per account (P2-D15 forbids
 * a second vet record). What the applicant submitted is kept separately and never
 * overwritten: a case holds numbered, immutable submissions and their documents,
 * so a correction adds a version instead of destroying the evidence reviewed before.
 *
 * Nothing here is invented for old records: a profile that never said whether it
 * holds a licence has `hasLicence` null, and one that never said general or
 * specialist is NOT_DECLARED (DEC-0188, DEC-0189).
 */
import { vetTagLabel, type VetCaseStatus, type VetPracticeScope, type VetTag } from './professional-model.ts';

export const VET_APPLICANT_TYPES = ['STUDENT', 'DOCTOR'] as const;
export type VetApplicantType = (typeof VET_APPLICANT_TYPES)[number];

/** What a case asks to be verified. CLAIM keeps the Phase 2 claim of an unowned page. */
export const VET_CASE_TYPES = ['STUDENT', 'COUNCIL', 'LICENCE', 'CLAIM'] as const;
export type VetCaseType = (typeof VET_CASE_TYPES)[number];

export const PROFESSIONAL_DOCUMENT_KINDS = ['STUDENT_CARD', 'COUNCIL_CARD', 'PRACTICE_LICENCE', 'CERTIFICATE', 'IDENTITY', 'OTHER'] as const;
export type ProfessionalDocumentKind = (typeof PROFESSIONAL_DOCUMENT_KINDS)[number];

/** Statuses in which a case is still open; at most one open case of each type per account. */
export const OPEN_CASE_STATUSES: readonly VetCaseStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CORRECTION'];

/** A Phase 2 application of each kind becomes a case of this type (DEC-0189). */
export const LEGACY_APPLICATION_CASE_TYPE: Record<'PROFILE' | 'CLAIM', VetCaseType> = { PROFILE: 'COUNCIL', CLAIM: 'CLAIM' };

export const APPLICANT_TYPE_FA: Record<VetApplicantType, string> = { STUDENT: 'دانشجوی دامپزشکی', DOCTOR: 'دکتر دامپزشک' };
export const CASE_TYPE_FA: Record<VetCaseType, string> = {
  STUDENT: 'احراز دانشجویی',
  COUNCIL: 'احراز کد نظام',
  LICENCE: 'ثبت پروانه فعالیت',
  CLAIM: 'Claim پروفایل بدون مالک',
};
export const CASE_STATUS_FA: Record<VetCaseStatus, string> = {
  DRAFT: 'پیش‌نویس',
  SUBMITTED: 'ارسال‌شده',
  UNDER_REVIEW: 'در حال بررسی',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  REJECTED: 'ردشده',
  WITHDRAWN: 'انصراف',
  VERIFIED_STUDENT: 'دانشجوی تأییدشده',
  VERIFIED_NO_LICENSE: 'کد نظام تأییدشده',
  LICENSE_APPROVED_AWAITING_PAYMENT: 'پروانه تأییدشده، در انتظار پرداخت',
  ACTIVE_LICENSED_VET: 'پروانه فعال',
  EXPIRED: 'منقضی',
  SUSPENDED: 'معلق',
};
export const DOCUMENT_KIND_FA: Record<ProfessionalDocumentKind, string> = {
  STUDENT_CARD: 'کارت دانشجویی',
  COUNCIL_CARD: 'کارت نظام دامپزشکی',
  PRACTICE_LICENCE: 'پروانه فعالیت',
  CERTIFICATE: 'گواهی',
  IDENTITY: 'مدرک هویتی',
  OTHER: 'سایر مدارک',
};

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isApplicantType = oneOf(VET_APPLICANT_TYPES);
export const isCaseType = oneOf(VET_CASE_TYPES);
export const isProfessionalDocumentKind = oneOf(PROFESSIONAL_DOCUMENT_KINDS);
export const isOpenCase = (status: VetCaseStatus): boolean => OPEN_CASE_STATUSES.includes(status);

// ── Cross-field rules ──────────────────────────────────────────────────────

export interface ProfessionalFields {
  readonly applicantType: VetApplicantType | null;
  readonly studentNumber: string | null;
  readonly universityFa: string | null;
  readonly practiceScope: VetPracticeScope | null;
  readonly councilCode: string | null;
  readonly councilVerified: boolean;
  readonly hasLicence: boolean | null;
  readonly licenceCode: string | null;
  readonly licenceDate: string | null;
  readonly licenceFileId: string | null;
  readonly licenceVerified: boolean;
}

const present = (value: string | null): boolean => value !== null && value.trim() !== '';

/**
 * Every combination the product rules out. The database checks the same rules
 * (`vet_profile_*` constraints); this answers first, with a message a person can act on.
 */
export function professionalFieldProblems(f: ProfessionalFields): string[] {
  const problems: string[] = [];
  const licenceData = present(f.licenceCode) || present(f.licenceDate) || present(f.licenceFileId) || f.licenceVerified;
  if (f.applicantType !== 'STUDENT' && (present(f.studentNumber) || present(f.universityFa))) {
    problems.push('شماره دانشجویی و دانشگاه فقط برای دانشجوی دامپزشکی ثبت می‌شود.');
  }
  if (f.applicantType === 'STUDENT') {
    if (present(f.councilCode) || f.councilVerified) problems.push('دانشجو کد نظام دامپزشکی ندارد.');
    if (f.practiceScope !== null) problems.push('دانشجو وصف عمومی یا متخصص ندارد.');
    if (f.hasLicence !== null || licenceData) problems.push('دانشجو پروانه فعالیت ندارد.');
  }
  if (f.applicantType !== 'DOCTOR' && f.applicantType !== 'STUDENT' && (f.practiceScope !== null || f.hasLicence !== null || licenceData)) {
    problems.push('اطلاعات حرفه‌ای دکتر بدون مشخص‌بودن نوع متقاضی ثبت نمی‌شود.');
  }
  if (f.hasLicence !== true && licenceData) problems.push('کد، تاریخ یا فایل پروانه فقط وقتی ثبت می‌شود که «دارای پروانه» اعلام شده باشد.');
  if (f.licenceVerified && !(present(f.licenceCode) && present(f.licenceDate) && present(f.licenceFileId))) {
    problems.push('پروانه بدون کد، تاریخ و فایل تأیید نمی‌شود.');
  }
  if (f.councilVerified && !present(f.councilCode)) problems.push('کد نظام بدون خود کد تأیید نمی‌شود.');
  if (f.licenceDate !== null && !isIsoDate(f.licenceDate)) problems.push('تاریخ پروانه معتبر نیست.');
  return problems;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A website a visitor can open safely: http or https only, no credentials, bounded. */
export function normalizeWebsite(raw: string | null | undefined): { value: string | null } | { problem: string } {
  const text = (raw ?? '').trim();
  if (text === '') return { value: null };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
  } catch {
    return { problem: 'نشانی وب‌سایت معتبر نیست.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { problem: 'نشانی وب‌سایت باید با http یا https باشد.' };
  if (url.username || url.password || !url.hostname.includes('.')) return { problem: 'نشانی وب‌سایت معتبر نیست.' };
  const value = url.toString();
  return value.length > 200 ? { problem: 'نشانی وب‌سایت حداکثر ۲۰۰ نویسه است.' } : { value };
}

/** An Instagram handle from «@name», «name» or an instagram.com address; stored without the @. */
export function normalizeInstagram(raw: string | null | undefined): { value: string | null } | { problem: string } {
  let text = (raw ?? '').trim();
  if (text === '') return { value: null };
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(text);
  if (fromUrl) text = fromUrl[1]!;
  text = text.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(text) ? { value: text.toLowerCase() } : { problem: 'نام کاربری اینستاگرام معتبر نیست.' };
}

// ── Public view ────────────────────────────────────────────────────────────

/** Never in a public payload, at any depth. The public-view test walks the payload for these. */
export const PUBLIC_FORBIDDEN_KEYS = [
  'accountId',
  'studentNumber',
  'universityFa',
  'licenceCode',
  'licenceDate',
  'licenceFileId',
  'fileId',
  'documents',
  'cases',
  'submissions',
  'reviewNoteFa',
  'statementFa',
  'sourceFa',
  'councilVerifiedByAccountId',
  'licenceVerifiedByAccountId',
  'hasLicence',
  'tagHistory',
] as const;

export interface PublicProfessionalInput {
  readonly slug: string;
  readonly displayNameFa: string;
  readonly councilCode: string | null;
  readonly showCouncilCode: boolean;
  readonly phone: string | null;
  readonly showPhone: boolean;
  readonly clinicNameFa: string | null;
  readonly websiteUrl: string | null;
  readonly instagramHandle: string | null;
  readonly tag: { readonly tag: VetTag; readonly practiceScope: VetPracticeScope | null } | null;
  readonly servicesFa: readonly string[];
  readonly equipmentFa: readonly string[];
}

export interface PublicProfessionalView {
  readonly slug: string;
  readonly nameFa: string;
  /** The one public tag, or null. Never a badge, never a status. */
  readonly tagFa: string | null;
  readonly clinicNameFa: string | null;
  readonly websiteUrl: string | null;
  readonly instagramHandle: string | null;
  readonly servicesFa: readonly string[];
  /** Self-declared, so it is always presented as «تجهیزات اعلام‌شده» (PHASE_2_5_SPEC_FA §7). */
  readonly declaredEquipmentFa: readonly string[];
  readonly councilCode: string | null;
  readonly phone: string | null;
}

export const DECLARED_EQUIPMENT_FA = 'تجهیزات اعلام‌شده';

/** What a visitor may see, built by listing the allowed fields rather than removing forbidden ones. */
export function publicProfessionalView(input: PublicProfessionalInput): PublicProfessionalView {
  return {
    slug: input.slug,
    nameFa: input.displayNameFa,
    tagFa: input.tag ? vetTagLabel(input.tag.tag, input.tag.practiceScope) : null,
    clinicNameFa: input.clinicNameFa,
    websiteUrl: input.websiteUrl,
    instagramHandle: input.instagramHandle,
    servicesFa: [...input.servicesFa],
    declaredEquipmentFa: [...input.equipmentFa],
    councilCode: input.showCouncilCode ? input.councilCode : null,
    phone: input.showPhone && input.phone !== null && input.phone.trim() !== '' ? input.phone.trim() : null,
  };
}
