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

// ── Student application (PROMPT-004) ───────────────────────────────────────

/**
 * A student number as typed: Persian or Arabic digits, spaces and letter case do
 * not make a different number — the same normalisation a council code gets. No
 * official format is known, so only a plausible shape is required (DEC-0190).
 */
export function normalizeStudentNumber(raw: string | null | undefined): string {
  let out = '';
  for (const ch of raw ?? '') {
    const code = ch.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else out += ch;
  }
  return out.replace(/\s+/g, '').toUpperCase();
}

export interface StudentFields {
  readonly displayNameFa: string;
  readonly studentNumber: string;
  readonly universityFa: string;
}

/** Everything wrong with a student application, in the order a person reads the form. */
export function studentFieldProblems(fields: StudentFields): string[] {
  const problems: string[] = [];
  const name = fields.displayNameFa.trim();
  if (name === '') problems.push('نام و نام خانوادگی را بنویسید.');
  else if (name.length > 120) problems.push('نام و نام خانوادگی حداکثر ۱۲۰ نویسه است.');
  if (fields.studentNumber === '') problems.push('شماره دانشجویی را بنویسید.');
  else if (!/^[A-Z0-9-]{4,20}$/.test(fields.studentNumber)) problems.push('شماره دانشجویی فقط رقم، حرف لاتین و خط تیره دارد (۴ تا ۲۰ نویسه).');
  const university = fields.universityFa.trim();
  if (university === '') problems.push('نام دانشگاه را بنویسید.');
  else if (university.length < 2 || university.length > 120) problems.push('نام دانشگاه باید ۲ تا ۱۲۰ نویسه باشد.');
  return problems;
}

export const STUDENT_DECISIONS = ['VERIFY', 'REQUEST_CORRECTION', 'REJECT'] as const;
export type StudentDecision = (typeof STUDENT_DECISIONS)[number];
export const STUDENT_DECISION_OUTCOME: Record<StudentDecision, VetCaseStatus> = {
  VERIFY: 'VERIFIED_STUDENT',
  REQUEST_CORRECTION: 'NEEDS_CORRECTION',
  REJECT: 'REJECTED',
};
export const STUDENT_DECISION_FA: Record<StudentDecision, string> = {
  VERIFY: 'تأیید دانشجو',
  REQUEST_CORRECTION: 'درخواست اصلاح',
  REJECT: 'رد',
};
export const isStudentDecision = oneOf(STUDENT_DECISIONS);

// ── Doctor without a practice licence (PROMPT-005) ─────────────────────────

export interface DoctorFields {
  readonly displayNameFa: string;
  readonly practiceScope: string;
  /** Already normalised with `normalizeCouncilCode`. */
  readonly councilCode: string;
  readonly phone: string | null;
  readonly cityId: string | null;
  readonly statementFa: string | null;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything wrong with a doctor application. General or specialist must be
 * declared: NOT_DECLARED belongs to records older than the question and is never
 * a choice (DEC-0188). The council code shape is the Phase 2 one (DEC-0165).
 */
export function doctorFieldProblems(fields: DoctorFields): string[] {
  const problems: string[] = [];
  const name = fields.displayNameFa.trim();
  if (name === '') problems.push('نام و نام خانوادگی دامپزشک را بنویسید.');
  else if (name.length > 120) problems.push('نام و نام خانوادگی حداکثر ۱۲۰ نویسه است.');
  if (fields.practiceScope !== 'GENERAL' && fields.practiceScope !== 'SPECIALIST') problems.push('عمومی یا متخصص بودن را انتخاب کنید.');
  if (fields.councilCode === '') problems.push('کد نظام دامپزشکی را بنویسید.');
  else if (!/^[A-Z0-9-]{3,20}$/.test(fields.councilCode)) problems.push('کد نظام دامپزشکی فقط رقم، حرف لاتین و خط تیره دارد (۳ تا ۲۰ نویسه).');
  if (fields.phone !== null && fields.phone.length > 20) problems.push('تلفن حداکثر ۲۰ نویسه است.');
  if (fields.cityId !== null && !UUID_SHAPE.test(fields.cityId)) problems.push('شهر انتخاب‌شده در فهرست شهرها نیست.');
  if (fields.statementFa !== null && fields.statementFa.length > 2000) problems.push('توضیح حداکثر ۲۰۰۰ نویسه است.');
  return problems;
}

/** Documents a doctor application may carry. No licence: that is a separate, later case (PROMPT-006). */
export const DOCTOR_DOCUMENT_KINDS = ['COUNCIL_CARD', 'IDENTITY', 'OTHER'] as const;
export type DoctorDocumentKind = (typeof DOCTOR_DOCUMENT_KINDS)[number];
export const isDoctorDocumentKind = oneOf(DOCTOR_DOCUMENT_KINDS);

export const DOCTOR_DECISIONS = ['VERIFY', 'REQUEST_CORRECTION', 'REJECT'] as const;
export type DoctorDecision = (typeof DOCTOR_DECISIONS)[number];
/** Verifying a council code reaches VERIFIED_NO_LICENSE and nothing further (PHASE_2_5_SPEC_FA §4). */
export const DOCTOR_DECISION_OUTCOME: Record<DoctorDecision, VetCaseStatus> = {
  VERIFY: 'VERIFIED_NO_LICENSE',
  REQUEST_CORRECTION: 'NEEDS_CORRECTION',
  REJECT: 'REJECTED',
};
export const DOCTOR_DECISION_FA: Record<DoctorDecision, string> = {
  VERIFY: 'تأیید کد نظام (بدون پروانه فعالیت)',
  REQUEST_CORRECTION: 'درخواست اصلاح',
  REJECT: 'رد',
};
export const isDoctorDecision = oneOf(DOCTOR_DECISIONS);

// ── Licensed veterinarian submission (PROMPT-006) ──────────────────────────

export const MAX_CERTIFICATES = 3;
/** No licence older than this is plausible; an earlier date is a typing mistake, not a fact. */
export const LICENCE_DATE_FLOOR = '1950-01-01';

/** A licence code is read the same however it is typed — the student-number normalisation. */
export const normalizeLicenceCode = (raw: string | null | undefined): string => normalizeStudentNumber(raw);

export interface LicenceFields {
  /** Only for a doctor who has no verified profile yet; an existing profile keeps its name. */
  readonly displayNameFa: string | null;
  readonly practiceScope: string;
  readonly councilCode: string;
  readonly licenceCode: string;
  readonly licenceDate: string;
  readonly phone: string | null;
  readonly cityId: string | null;
  readonly websiteUrl: string | null;
  readonly instagramHandle: string | null;
  readonly clinicNameFa: string | null;
  readonly serviceCodes: readonly string[];
}

/**
 * Everything wrong with a licence submission. The five mandatory components —
 * council code, general or specialist, licence code, licence date and (checked
 * with the documents) the licence file — are each named. `today` is the calendar
 * day where the licence was issued, so a licence dated today is never "future".
 */
export function licenceFieldProblems(f: LicenceFields, options: { today: string; newDoctor: boolean }): string[] {
  const problems: string[] = [];
  if (options.newDoctor) {
    const name = (f.displayNameFa ?? '').trim();
    if (name === '') problems.push('نام و نام خانوادگی دامپزشک را بنویسید.');
    else if (name.length > 120) problems.push('نام و نام خانوادگی حداکثر ۱۲۰ نویسه است.');
  }
  if (f.practiceScope !== 'GENERAL' && f.practiceScope !== 'SPECIALIST') problems.push('عمومی یا متخصص بودن را انتخاب کنید.');
  if (f.councilCode === '') problems.push('کد نظام دامپزشکی را بنویسید.');
  else if (!/^[A-Z0-9-]{3,20}$/.test(f.councilCode)) problems.push('کد نظام دامپزشکی فقط رقم، حرف لاتین و خط تیره دارد (۳ تا ۲۰ نویسه).');
  if (f.licenceCode === '') problems.push('کد پروانه فعالیت را بنویسید.');
  else if (!/^[A-Z0-9/-]{3,30}$/.test(f.licenceCode)) problems.push('کد پروانه فقط رقم، حرف لاتین، خط تیره و / دارد (۳ تا ۳۰ نویسه).');
  if (f.licenceDate === '') problems.push('تاریخ پروانه را وارد کنید.');
  else if (!isIsoDate(f.licenceDate)) problems.push('تاریخ پروانه معتبر نیست.');
  else if (f.licenceDate > options.today) problems.push('تاریخ پروانه نمی‌تواند در آینده باشد.');
  else if (f.licenceDate < LICENCE_DATE_FLOOR) problems.push('تاریخ پروانه پیش از ۱۹۵۰ پذیرفته نمی‌شود؛ تاریخ را دوباره بررسی کنید.');
  if (f.phone !== null && (f.phone.length > 20 || !/^[0-9+()\- ]+$/.test(f.phone))) problems.push('تلفن حرفه‌ای فقط رقم، +، پرانتز و خط تیره دارد (حداکثر ۲۰ نویسه).');
  if (f.clinicNameFa !== null && f.clinicNameFa.length > 120) problems.push('نام کلینیک حداکثر ۱۲۰ نویسه است.');
  if (f.cityId !== null && !UUID_SHAPE.test(f.cityId)) problems.push('شهر انتخاب‌شده در فهرست شهرها نیست.');
  if (f.serviceCodes.length > 20 || new Set(f.serviceCodes).size !== f.serviceCodes.length || f.serviceCodes.some((c) => !/^[A-Z_]{2,40}$/.test(c))) {
    problems.push('فهرست خدمات معتبر نیست.');
  }
  return problems;
}

export const LICENCE_DOCUMENT_KINDS = ['PRACTICE_LICENCE', 'COUNCIL_CARD', 'CERTIFICATE', 'IDENTITY', 'OTHER'] as const;
export type LicenceDocumentKind = (typeof LICENCE_DOCUMENT_KINDS)[number];
export const isLicenceDocumentKind = oneOf(LICENCE_DOCUMENT_KINDS);

export const LICENCE_DECISIONS = ['APPROVE', 'REQUEST_CORRECTION', 'REJECT'] as const;
export type LicenceDecision = (typeof LICENCE_DECISIONS)[number];
/** Approved documents open payment and nothing more: the licensed tag waits for a verified payment (PROMPT-008). */
export const LICENCE_DECISION_OUTCOME: Record<LicenceDecision, VetCaseStatus> = {
  APPROVE: 'LICENSE_APPROVED_AWAITING_PAYMENT',
  REQUEST_CORRECTION: 'NEEDS_CORRECTION',
  REJECT: 'REJECTED',
};
export const LICENCE_DECISION_FA: Record<LicenceDecision, string> = {
  APPROVE: 'تأیید مدارک پروانه (در انتظار پرداخت)',
  REQUEST_CORRECTION: 'درخواست اصلاح',
  REJECT: 'رد',
};
export const isLicenceDecision = oneOf(LICENCE_DECISIONS);

// ── Association review (PROMPT-007) ────────────────────────────────────────

export const REVIEW_CHECK_RESULTS = ['PASS', 'FAIL', 'NOT_APPLICABLE'] as const;
export type ReviewCheckResult = (typeof REVIEW_CHECK_RESULTS)[number];
export const isReviewCheckResult = oneOf(REVIEW_CHECK_RESULTS);
export const REVIEW_CHECK_RESULT_FA: Record<ReviewCheckResult, string> = { PASS: 'درست است', FAIL: 'درست نیست', NOT_APPLICABLE: 'موضوعیت ندارد' };

export interface ReviewCheckDefinition {
  readonly code: string;
  readonly labelFa: string;
}

const IDENTITY_MATCHES: ReviewCheckDefinition = { code: 'IDENTITY_MATCHES_ACCOUNT', labelFa: 'نام و هویت متقاضی با حساب احرازشده یکی است' };

/**
 * What a reviewer checks, per case type. A closed list: a check the product does
 * not name cannot be recorded. The trusted-veterinarian review (PROMPT-010/011)
 * adds its own list when its case type exists.
 */
export const REVIEW_CHECKS: Record<VetCaseType, readonly ReviewCheckDefinition[]> = {
  STUDENT: [
    { code: 'STUDENT_NUMBER_MATCHES', labelFa: 'شماره دانشجویی با مدرک یا استعلام دانشگاه می‌خواند' },
    { code: 'UNIVERSITY_MATCHES', labelFa: 'دانشگاه اعلام‌شده با مدرک یکی است' },
    IDENTITY_MATCHES,
  ],
  COUNCIL: [
    { code: 'COUNCIL_CARD_MATCHES', labelFa: 'کارت نظام خوانا است و با کد نظام اعلام‌شده می‌خواند' },
    IDENTITY_MATCHES,
    { code: 'SCOPE_SUPPORTED', labelFa: 'عمومی یا متخصص بودن با مدارک سازگار است' },
  ],
  LICENCE: [
    { code: 'LICENCE_FILE_LEGIBLE', labelFa: 'فایل پروانه خوانا و کامل است' },
    { code: 'LICENCE_CODE_MATCHES', labelFa: 'کد پروانه با فایل پروانه می‌خواند' },
    { code: 'LICENCE_DATE_MATCHES', labelFa: 'تاریخ پروانه با فایل پروانه می‌خواند' },
    { code: 'COUNCIL_CODE_MATCHES', labelFa: 'کد نظام روی پروانه همان کد نظام پرونده است' },
    IDENTITY_MATCHES,
  ],
  CLAIM: [
    { code: 'COUNCIL_CARD_MATCHES', labelFa: 'کارت نظام خوانا است و با کد نظام اعلام‌شده می‌خواند' },
    IDENTITY_MATCHES,
  ],
};

export const isReviewCheckCode = (caseType: VetCaseType, code: string): boolean => REVIEW_CHECKS[caseType].some((check) => check.code === code);

/** The outcomes that grant something; a recorded failed check on the current version blocks them. */
export const APPROVAL_OUTCOMES: readonly VetCaseStatus[] = ['VERIFIED_STUDENT', 'VERIFIED_NO_LICENSE', 'LICENSE_APPROVED_AWAITING_PAYMENT'];

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
