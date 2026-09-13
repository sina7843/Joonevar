/**
 * The licensed veterinarian submission — Phase 2.5 PROMPT-006.
 *
 * One case type serves two people: a doctor whose council code is already
 * verified and who now adds a practice licence, and a doctor who applies with
 * the council code and the licence together. Either way the submission carries
 * all five mandatory components — council code, general or specialist, licence
 * code, licence date and licence file — and may carry certificates, website,
 * Instagram, clinic, professional phone and services.
 *
 * Nothing reviewed is overwritten. Every edit, whether before review or in
 * answer to a correction, is a new immutable submission version (a revision
 * without a new file keeps the earlier file), and it bumps the case version so a
 * reviewer cannot decide on facts they did not see. The profile only receives
 * licence facts at approval, and approval reaches LICENSE_APPROVED_AWAITING_PAYMENT
 * and no further: the licensed tag belongs to a verified payment (PROMPT-008).
 */
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, storedFiles } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { cities } from '../db/schema/geography.ts';
import {
  vetApplications,
  vetProfessionalCases,
  vetProfessionalDocuments,
  vetProfessionalSubmissions,
  vetProfileCertificates,
  vetProfiles,
  vetProfileServices,
  vetServices,
} from '../db/schema/vets.ts';
import { putPrivateFile } from '../files/storage.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { boundedRows } from '../privacy/limits.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetCaseMove, vetTagLabel, type VetCaseStatus, type VetPracticeScope } from './professional-model.ts';
import {
  CASE_STATUS_FA,
  LICENCE_DECISION_OUTCOME,
  MAX_CERTIFICATES,
  OPEN_CASE_STATUSES,
  isLicenceDocumentKind,
  isLicenceDecision,
  licenceFieldProblems,
  normalizeInstagram,
  normalizeLicenceCode,
  normalizeWebsite,
  type LicenceDocumentKind,
  type LicenceFields,
} from './professional-profile-model.ts';
import { normalizeCouncilCode } from './onboarding-model.ts';
import { unifyPersianLetters } from '../breeds/model.ts';
import { currentVetTag, replaceVetTag } from './professional-tags.ts';
import { CASE_TARGET, professionalCaseHistory } from './student-application.ts';

const APPLICANT_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
export const LICENCE_REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];
/** A licence case in one of these states already holds this account's licence. */
const LICENCE_HELD: readonly VetCaseStatus[] = ['LICENSE_APPROVED_AWAITING_PAYMENT', 'ACTIVE_LICENSED_VET', 'EXPIRED', 'SUSPENDED'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const MAX_DOCUMENTS = 8;

export type LicenceCaseRow = typeof vetProfessionalCases.$inferSelect;
type ProfileRow = typeof vetProfiles.$inferSelect;

export interface LicenceDocumentInput {
  readonly kind: string;
  readonly bytes: Uint8Array;
  readonly originalName?: string | null;
  /** Required for a certificate: what it certifies. */
  readonly titleFa?: string | null;
}

export interface LicenceApplicationInput {
  readonly displayNameFa?: string | null;
  readonly practiceScope: string;
  readonly councilCode: string;
  readonly licenceCode: string;
  readonly licenceDate: string;
  readonly phone?: string | null;
  readonly cityId?: string | null;
  readonly websiteUrl?: string | null;
  readonly instagramHandle?: string | null;
  readonly clinicNameFa?: string | null;
  readonly serviceCodes?: readonly string[];
  readonly documents: readonly LicenceDocumentInput[];
}

export interface LicencePayload extends LicenceFields {
  readonly source: 'LICENCE_APPLICATION';
  readonly newDoctor: boolean;
  readonly licenceFileId: string;
  readonly certificates: ReadonlyArray<{ readonly fileId: string; readonly titleFa: string }>;
}

function assertApplicant(actor: Actor): void {
  if (!APPLICANT_CONTEXTS.includes(actor.context)) throw forbidden('ثبت پروانه از حساب کاربری خودتان انجام می‌شود.');
}

function assertReviewer(actor: Actor): void {
  if (!LICENCE_REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden('بررسی پروانه فعالیت فقط در محیط انجمن ممکن است.');
}

const clean = (value: string | null | undefined): string | null => {
  const out = unifyPersianLetters((value ?? '').trim()).replace(/[ \t]+/g, ' ');
  return out === '' ? null : out;
};

/** The calendar day in Iran, where a licence is dated; UTC would call a licence issued this morning "tomorrow". */
export const tehranToday = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(now);

function validFields(input: LicenceApplicationInput, now: Date, newDoctor: boolean): LicenceFields {
  const problems: string[] = [];
  const website = normalizeWebsite(input.websiteUrl);
  const instagram = normalizeInstagram(input.instagramHandle);
  if ('problem' in website) problems.push(website.problem);
  if ('problem' in instagram) problems.push(instagram.problem);
  const fields: LicenceFields = {
    displayNameFa: newDoctor ? clean(input.displayNameFa) : null,
    practiceScope: input.practiceScope ?? '',
    councilCode: normalizeCouncilCode(input.councilCode ?? ''),
    licenceCode: normalizeLicenceCode(input.licenceCode),
    licenceDate: (input.licenceDate ?? '').trim(),
    phone: clean(input.phone),
    cityId: newDoctor ? clean(input.cityId) : null,
    websiteUrl: 'value' in website ? website.value : null,
    instagramHandle: 'value' in instagram ? instagram.value : null,
    clinicNameFa: clean(input.clinicNameFa),
    serviceCodes: [...new Set((input.serviceCodes ?? []).map((code) => code.trim()).filter((code) => code !== ''))],
  };
  problems.push(...licenceFieldProblems(fields, { today: tehranToday(now), newDoctor }));
  if (problems.length > 0) throw validation(problems.join(' '), { problems });
  return fields;
}

function validDocuments(
  documents: readonly LicenceDocumentInput[],
  rules: { requireLicence: boolean; requireCouncilCard: boolean; certificatesAlready: number },
): void {
  if (documents.length > MAX_DOCUMENTS) throw validation('در هر ارسال حداکثر ' + MAX_DOCUMENTS.toLocaleString('fa-IR') + ' فایل پیوست می‌شود.');
  const of = (kind: LicenceDocumentKind) => documents.filter((document) => document.kind === kind);
  for (const document of documents) if (!isLicenceDocumentKind(document.kind)) throw validation('نوع مدرک معتبر نیست.');
  if (of('PRACTICE_LICENCE').length > 1 || of('COUNCIL_CARD').length > 1) throw validation('از هر مدرک اصلی یک فایل پیوست کنید.');
  if (rules.requireLicence && of('PRACTICE_LICENCE').length === 0) throw validation('فایل پروانه فعالیت را پیوست کنید؛ بدون آن ارسال ممکن نیست.');
  if (rules.requireCouncilCard && of('COUNCIL_CARD').length === 0) throw validation('تصویر کارت نظام دامپزشکی را پیوست کنید.');
  const certificates = of('CERTIFICATE');
  if (rules.certificatesAlready + certificates.length > MAX_CERTIFICATES) throw validation('حداکثر ' + MAX_CERTIFICATES.toLocaleString('fa-IR') + ' گواهی ثبت می‌شود.');
  for (const certificate of certificates) {
    const title = clean(certificate.titleFa);
    if (title === null) throw validation('برای هر گواهی عنوان آن را بنویسید.');
    if (title.length > 120) throw validation('عنوان گواهی حداکثر ۱۲۰ نویسه است.');
  }
}

const uniqueAsConflict = (error: unknown): unknown =>
  ((error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code) === '23505'
    ? conflict('درخواست یا پروفایل دیگری با همین مشخصات هم‌زمان ثبت شد؛ صفحه را دوباره باز کنید.')
    : error;

async function lockAccount(tx: DbClient, accountId: string): Promise<void> {
  await tx.execute(sql`select id from account where id = ${accountId} for update`);
}

/**
 * Who may submit a licence, and on what profile: a verified doctor's own profile,
 * or none at all for a doctor applying with council code and licence together.
 */
async function standingOf(tx: DbClient, accountId: string, exceptCaseId: string | null): Promise<ProfileRow | null> {
  const cases = await tx
    .select({ id: vetProfessionalCases.id, caseType: vetProfessionalCases.caseType, status: vetProfessionalCases.status })
    .from(vetProfessionalCases)
    .where(eq(vetProfessionalCases.accountId, accountId));
  const others = cases.filter((row) => row.id !== exceptCaseId);
  if (others.some((row) => OPEN_CASE_STATUSES.includes(row.status as VetCaseStatus))) throw conflict('پرونده حرفه‌ای دیگری از شما باز است؛ همان را پیگیری کنید.');
  if (others.some((row) => row.caseType === 'LICENCE' && LICENCE_HELD.includes(row.status as VetCaseStatus))) {
    throw conflict('پروانه شما پیش‌تر تأیید شده است؛ ادامه آن از مسیر پرداخت و تمدید دوره است.');
  }
  const [application] = await tx
    .select({ id: vetApplications.id })
    .from(vetApplications)
    .where(and(eq(vetApplications.accountId, accountId), inArray(vetApplications.status, ['SUBMITTED', 'NEEDS_CORRECTION'])))
    .limit(1);
  if (application) throw conflict('درخواست دامپزشک شما از پیش در حال بررسی است؛ همان را پیگیری کنید.');

  const [profile] = await tx.select().from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
  if (profile?.applicantType === 'STUDENT') throw conflict('دانشجوی دامپزشکی پروانه فعالیت ثبت نمی‌کند.');
  if (profile && (profile.applicantType !== 'DOCTOR' || profile.councilVerifiedAt === null || profile.councilCode === null)) {
    throw conflict('پیش از ثبت پروانه، کد نظام شما باید تأیید شده باشد.');
  }
  if (!profile) {
    const [role] = await tx
      .select({ id: accountRoles.id })
      .from(accountRoles)
      .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.role, 'TRUSTED_VET'), eq(accountRoles.status, 'ACTIVE')))
      .limit(1);
    if (role) throw conflict('پرونده دامپزشک معتمد شما پروفایل ثبت‌شده ندارد؛ با پشتیبانی انجمن تماس بگیرید.');
    if (await currentVetTag(tx, accountId)) throw conflict('این حساب Tag حرفه‌ای دارد ولی پروفایل تأییدشده ندارد.');
  }
  return profile ?? null;
}

/** The council code of a licence is the verified one, or — for a new doctor — a code nobody else holds. */
async function assertCouncilCode(tx: DbClient, profile: ProfileRow | null, councilCode: string): Promise<void> {
  if (profile) {
    if (profile.councilCode !== councilCode) throw validation('کد نظام باید همان کد تأییدشده پروفایل شما (' + profile.councilCode + ') باشد.');
    return;
  }
  const [holder] = await tx
    .select({ accountId: vetProfiles.accountId, publicSlug: vetProfiles.publicSlug, publicStatus: vetProfiles.publicStatus })
    .from(vetProfiles)
    .where(eq(vetProfiles.councilCode, councilCode))
    .limit(1);
  if (!holder) return;
  if (holder.accountId === null && holder.publicStatus === 'PUBLISHED') {
    throw conflict('این کد نظام متعلق به یک پروفایل بدون مالک است؛ ابتدا همان را Claim کنید و سپس پروانه را ثبت کنید.', { claimSlug: holder.publicSlug });
  }
  throw conflict('این کد نظام دامپزشکی قبلاً برای پروفایل دیگری ثبت شده است.');
}

async function assertReferences(tx: DbClient, fields: LicenceFields): Promise<void> {
  if (fields.cityId !== null) {
    const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, fields.cityId)).limit(1);
    if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
  }
  if (fields.serviceCodes.length > 0) {
    const known = await tx
      .select({ code: vetServices.code })
      .from(vetServices)
      .where(and(inArray(vetServices.code, [...fields.serviceCodes]), eq(vetServices.isActive, true)));
    if (known.length !== fields.serviceCodes.length) throw validation('خدمت انتخاب‌شده در فهرست خدمات نیست.');
  }
}

async function storeDocuments(tx: DbClient, storageRoot: string, actor: Actor, caseId: string, version: number, documents: readonly LicenceDocumentInput[]) {
  let licenceFileId: string | null = null;
  const certificates: Array<{ fileId: string; titleFa: string }> = [];
  for (const document of documents) {
    // The file module checks the real signature and size, and keeps only a safe label of the name.
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'VET_PROFESSIONAL_DOCUMENT',
      bytes: document.bytes,
      originalName: document.originalName ?? null,
    });
    const titleFa = document.kind === 'CERTIFICATE' ? clean(document.titleFa) : null;
    await tx.insert(vetProfessionalDocuments).values({ caseId, submissionVersion: version, kind: document.kind as LicenceDocumentKind, fileId: stored.id, titleFa });
    if (document.kind === 'PRACTICE_LICENCE') licenceFileId = stored.id;
    if (document.kind === 'CERTIFICATE') certificates.push({ fileId: stored.id, titleFa: titleFa! });
  }
  return { licenceFileId, certificates };
}

// ── Applicant ──────────────────────────────────────────────────────────────

export async function submitLicenceApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: LicenceApplicationInput,
  now: Date = new Date(),
): Promise<LicenceCaseRow> {
  assertApplicant(actor);
  try {
    return await database.transaction(async (tx) => {
      await lockAccount(tx, actor.accountId);
      const profile = await standingOf(tx, actor.accountId, null);
      const newDoctor = profile === null;
      // Everything is validated before a single file is written.
      const fields = validFields(input, now, newDoctor);
      validDocuments(input.documents, { requireLicence: true, requireCouncilCard: newDoctor, certificatesAlready: 0 });
      await assertCouncilCode(tx, profile, fields.councilCode);
      await assertReferences(tx, fields);

      const [row] = await tx
        .insert(vetProfessionalCases)
        .values({ accountId: actor.accountId, vetProfileId: profile?.id ?? null, caseType: 'LICENCE', status: 'SUBMITTED', currentSubmissionVersion: 1, createdAt: now, updatedAt: now })
        .returning();
      const stored = await storeDocuments(tx, storageRoot, actor, row!.id, 1, input.documents);
      const payload: LicencePayload = { source: 'LICENCE_APPLICATION', ...fields, newDoctor, licenceFileId: stored.licenceFileId!, certificates: stored.certificates };
      await tx.insert(vetProfessionalSubmissions).values({ caseId: row!.id, version: 1, submittedByAccountId: actor.accountId, submittedAt: now, payload });
      await recordAudit(tx, actor, {
        action: 'VET_LICENCE_CASE_SUBMITTED',
        targetType: CASE_TARGET,
        targetId: row!.id,
        targetVersion: row!.version,
        after: { status: row!.status, submissionVersion: 1, newDoctor, licenceCode: fields.licenceCode, licenceDate: fields.licenceDate, practiceScope: fields.practiceScope },
      });
      return row!;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

/**
 * An edit after submission: while it still waits for review, or in answer to a
 * correction. Always a new version; the earlier versions and their files stay.
 */
export async function reviseLicenceApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: LicenceApplicationInput & { caseId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<LicenceCaseRow> {
  assertApplicant(actor);
  if (!UUID.test(input.caseId)) throw notFound('پرونده پیدا نشد.');
  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
      if (!current || current.accountId !== actor.accountId || current.caseType !== 'LICENCE') throw notFound('پرونده پیدا نشد.');
      if (current.version !== input.expectedVersion) throw conflict(STALE);
      const editable = current.status === 'SUBMITTED' || (current.status === 'NEEDS_CORRECTION' && vetCaseMove('NEEDS_CORRECTION', 'SUBMITTED', 'APPLICANT'));
      if (!editable) throw conflict('این پرونده دیگر قابل ویرایش نیست؛ مدارک بررسی‌شده بازنویسی نمی‌شوند.');
      await lockAccount(tx, actor.accountId);
      const profile = await standingOf(tx, actor.accountId, current.id);
      if ((profile?.id ?? null) !== current.vetProfileId) throw conflict('وضعیت پروفایل شما از زمان ارسال تغییر کرده است؛ درخواست تازه ثبت کنید.');
      const [previous] = await tx
        .select()
        .from(vetProfessionalSubmissions)
        .where(and(eq(vetProfessionalSubmissions.caseId, current.id), eq(vetProfessionalSubmissions.version, current.currentSubmissionVersion)))
        .limit(1);
      const earlier = previous!.payload as LicencePayload;
      const newDoctor = profile === null;
      const fields = validFields(input, now, newDoctor);
      validDocuments(input.documents, { requireLicence: false, requireCouncilCard: false, certificatesAlready: earlier.certificates.length });
      await assertCouncilCode(tx, profile, fields.councilCode);
      await assertReferences(tx, fields);

      const version = current.currentSubmissionVersion + 1;
      const [row] = await tx
        .update(vetProfessionalCases)
        .set({ status: 'SUBMITTED', currentSubmissionVersion: version, version: current.version + 1, updatedAt: now })
        .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      const stored = await storeDocuments(tx, storageRoot, actor, row.id, version, input.documents);
      const payload: LicencePayload = {
        source: 'LICENCE_APPLICATION',
        ...fields,
        newDoctor,
        // No new file: the licence file already reviewed is the one this version still refers to.
        licenceFileId: stored.licenceFileId ?? earlier.licenceFileId,
        certificates: [...earlier.certificates, ...stored.certificates],
      };
      await tx.insert(vetProfessionalSubmissions).values({ caseId: row.id, version, submittedByAccountId: actor.accountId, submittedAt: now, payload });
      await recordAudit(tx, actor, {
        action: 'VET_LICENCE_CASE_REVISED',
        targetType: CASE_TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status, submissionVersion: current.currentSubmissionVersion, licenceCode: earlier.licenceCode, licenceDate: earlier.licenceDate, licenceFileId: earlier.licenceFileId },
        after: { status: row.status, submissionVersion: version, licenceCode: payload.licenceCode, licenceDate: payload.licenceDate, licenceFileId: payload.licenceFileId },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

export async function vetServiceCatalogue(database: DbClient) {
  return database.select({ code: vetServices.code, nameFa: vetServices.nameFa }).from(vetServices).where(eq(vetServices.isActive, true)).orderBy(asc(vetServices.sortOrder));
}

/** The account's newest licence case with its current submission, documents and history. */
export async function myLicenceCase(database: DbClient, actor: Actor) {
  const [row] = await database
    .select()
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, actor.accountId), eq(vetProfessionalCases.caseType, 'LICENCE')))
    .orderBy(desc(vetProfessionalCases.createdAt))
    .limit(1);
  if (!row) return null;
  const [submissions, documents, history] = await Promise.all([
    database.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id)).orderBy(asc(vetProfessionalSubmissions.version)),
    database.select().from(vetProfessionalDocuments).where(eq(vetProfessionalDocuments.caseId, row.id)).orderBy(asc(vetProfessionalDocuments.submissionVersion)),
    professionalCaseHistory(database, [row.id]),
  ]);
  return {
    id: row.id,
    version: row.version,
    status: row.status as VetCaseStatus,
    statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
    reviewNoteFa: row.reviewNoteFa,
    submissionVersion: row.currentSubmissionVersion,
    fields: (submissions.at(-1)?.payload ?? null) as LicencePayload | null,
    documents: documents.map((document) => ({ id: document.id, fileId: document.fileId, kind: document.kind, titleFa: document.titleFa, submissionVersion: document.submissionVersion })),
    history: history[row.id] ?? [],
  };
}

// ── Reviewer ───────────────────────────────────────────────────────────────

const QUEUE: Record<'OPEN' | 'CORRECTION' | 'DECIDED', readonly VetCaseStatus[]> = {
  OPEN: ['SUBMITTED', 'UNDER_REVIEW'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['LICENSE_APPROVED_AWAITING_PAYMENT', 'REJECTED'],
};

export async function licenceCaseQueue(
  database: DbClient,
  actor: Actor,
  query: { view: 'OPEN' | 'CORRECTION' | 'DECIDED'; page: number; pageSize?: number },
) {
  assertReviewer(actor);
  const request = { page: query.page, pageSize: boundedRows(query.pageSize, 20) };
  const where = and(eq(vetProfessionalCases.caseType, 'LICENCE'), inArray(vetProfessionalCases.status, [...QUEUE[query.view]]));
  const [[total], rows] = await Promise.all([
    database.select({ value: count() }).from(vetProfessionalCases).where(where),
    database
      .select({ row: vetProfessionalCases, payload: vetProfessionalSubmissions.payload, profileName: vetProfiles.displayNameFa })
      .from(vetProfessionalCases)
      .leftJoin(
        vetProfessionalSubmissions,
        and(eq(vetProfessionalSubmissions.caseId, vetProfessionalCases.id), eq(vetProfessionalSubmissions.version, vetProfessionalCases.currentSubmissionVersion)),
      )
      .leftJoin(vetProfiles, eq(vetProfiles.id, vetProfessionalCases.vetProfileId))
      .where(where)
      .orderBy(query.view === 'DECIDED' ? desc(vetProfessionalCases.updatedAt) : asc(vetProfessionalCases.updatedAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);
  const items = rows.map(({ row, payload, profileName }) => {
    const fields = (payload ?? {}) as Partial<LicencePayload>;
    return {
      id: row.id,
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      submissionVersion: row.currentSubmissionVersion,
      newDoctor: fields.newDoctor ?? row.vetProfileId === null,
      displayNameFa: profileName ?? fields.displayNameFa ?? null,
      councilCode: fields.councilCode ?? null,
      licenceCode: fields.licenceCode ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
  return pageOf(items, total?.value ?? 0, request);
}

export async function licenceCaseForReview(database: DbClient, actor: Actor, caseId: string) {
  assertReviewer(actor);
  if (!UUID.test(caseId)) return null;
  const [row] = await database.select().from(vetProfessionalCases).where(and(eq(vetProfessionalCases.id, caseId), eq(vetProfessionalCases.caseType, 'LICENCE'))).limit(1);
  if (!row) return null;
  const [submissions, documents, [identity], history, [profile], tag] = await Promise.all([
    database.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id)).orderBy(asc(vetProfessionalSubmissions.version)),
    database
      .select({ id: vetProfessionalDocuments.id, fileId: vetProfessionalDocuments.fileId, kind: vetProfessionalDocuments.kind, titleFa: vetProfessionalDocuments.titleFa, submissionVersion: vetProfessionalDocuments.submissionVersion, mime: storedFiles.mime, originalName: storedFiles.originalName })
      .from(vetProfessionalDocuments)
      .innerJoin(storedFiles, eq(storedFiles.id, vetProfessionalDocuments.fileId))
      .where(eq(vetProfessionalDocuments.caseId, row.id))
      .orderBy(asc(vetProfessionalDocuments.submissionVersion)),
    database.select({ firstName: profiles.firstName, lastName: profiles.lastName, nationalId: profiles.nationalId }).from(profiles).where(eq(profiles.accountId, row.accountId)).limit(1),
    professionalCaseHistory(database, [row.id]),
    row.vetProfileId ? database.select().from(vetProfiles).where(eq(vetProfiles.id, row.vetProfileId)).limit(1) : Promise.resolve([]),
    currentVetTag(database, row.accountId),
  ]);
  const latest = submissions.at(-1)?.payload as LicencePayload | undefined;
  // The same licence code on another profile, or in another account's licence case, comes first.
  const [profilesWithCode, casesWithCode] = latest
    ? await Promise.all([
        database
          .select({ id: vetProfiles.id, accountId: vetProfiles.accountId, displayNameFa: vetProfiles.displayNameFa })
          .from(vetProfiles)
          .where(and(eq(vetProfiles.licenceCode, latest.licenceCode), ne(vetProfiles.accountId, row.accountId)))
          .limit(20),
        database
          .selectDistinct({ caseId: vetProfessionalCases.id, accountId: vetProfessionalCases.accountId, status: vetProfessionalCases.status })
          .from(vetProfessionalSubmissions)
          .innerJoin(vetProfessionalCases, eq(vetProfessionalCases.id, vetProfessionalSubmissions.caseId))
          .where(
            and(
              eq(vetProfessionalCases.caseType, 'LICENCE'),
              ne(vetProfessionalCases.accountId, row.accountId),
              sql`${vetProfessionalSubmissions.payload} ->> 'licenceCode' = ${latest.licenceCode}`,
            ),
          )
          .limit(20),
      ])
    : [[], []];
  return {
    case: { ...row, statusFa: CASE_STATUS_FA[row.status as VetCaseStatus] },
    applicantNameFa: identity ? identity.firstName + ' ' + identity.lastName : null,
    applicantNationalId: identity?.nationalId ?? null,
    profile: profile
      ? { displayNameFa: profile.displayNameFa, councilCode: profile.councilCode, councilVerifiedAt: profile.councilVerifiedAt, practiceScope: profile.practiceScope, hasLicence: profile.hasLicence }
      : null,
    currentTagFa: tag ? vetTagLabel(tag.tag, tag.practiceScope) : null,
    submissions: submissions.map((submission) => ({ version: submission.version, submittedAt: submission.submittedAt, fields: submission.payload as LicencePayload })),
    documents,
    history: history[row.id] ?? [],
    duplicates: { profiles: profilesWithCode, cases: casesWithCode },
  };
}

function decisionTitle(status: VetCaseStatus): string {
  if (status === 'LICENSE_APPROVED_AWAITING_PAYMENT') return 'مدارک پروانه فعالیت شما تأیید شد؛ فعال‌شدن آن پس از پرداخت دوره است';
  if (status === 'NEEDS_CORRECTION') return 'پرونده پروانه فعالیت شما نیازمند اصلاح است';
  return 'پرونده پروانه فعالیت شما رد شد';
}

export async function decideLicenceCase(
  database: Database,
  actor: Actor,
  input: { caseId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<LicenceCaseRow> {
  assertReviewer(actor);
  if (!isLicenceDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const reasonFa = (input.reasonFa ?? '').trim();
  if (reasonFa === '') throw validation('دلیل تصمیم را بنویسید؛ برای متقاضی نمایش داده می‌شود.');
  if (reasonFa.length > 1000) throw validation('دلیل تصمیم حداکثر ۱۰۰۰ نویسه است.');
  if (!UUID.test(input.caseId)) throw notFound('پرونده پیدا نشد.');
  const outcome = LICENCE_DECISION_OUTCOME[input.decision];

  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(vetProfessionalCases).where(and(eq(vetProfessionalCases.id, input.caseId), eq(vetProfessionalCases.caseType, 'LICENCE'))).limit(1);
      if (!current) throw notFound('پرونده پیدا نشد.');
      if (current.accountId === actor.accountId) throw forbidden('پرونده خودتان را نمی‌توانید بررسی کنید.');
      // A revision bumps the version: a decision on a version the reviewer did not see is refused.
      if (current.version !== input.expectedVersion) throw conflict(STALE);
      const reviewable =
        (current.status === 'UNDER_REVIEW' || (current.status === 'SUBMITTED' && vetCaseMove('SUBMITTED', 'UNDER_REVIEW', 'REVIEWER'))) &&
        vetCaseMove('UNDER_REVIEW', outcome, 'REVIEWER');
      if (!reviewable) throw conflict('این پرونده در انتظار بررسی نیست.');

      let vetProfileId = current.vetProfileId;
      let scope: VetPracticeScope | null = null;
      if (outcome === 'LICENSE_APPROVED_AWAITING_PAYMENT') {
        const [latest] = await tx
          .select()
          .from(vetProfessionalSubmissions)
          .where(and(eq(vetProfessionalSubmissions.caseId, current.id), eq(vetProfessionalSubmissions.version, current.currentSubmissionVersion)))
          .limit(1);
        const p = latest!.payload as LicencePayload;
        scope = p.practiceScope as VetPracticeScope;
        await lockAccount(tx, current.accountId);
        const profile = await standingOf(tx, current.accountId, current.id);
        if ((profile?.id ?? null) !== current.vetProfileId) throw conflict('وضعیت پروفایل متقاضی از زمان ارسال تغییر کرده است.');
        await assertCouncilCode(tx, profile, p.councilCode);

        // The reviewed licence facts, exactly as the current version submitted them.
        const licence = {
          practiceScope: scope,
          hasLicence: true,
          licenceCode: p.licenceCode,
          licenceDate: p.licenceDate,
          licenceFileId: p.licenceFileId,
          licenceVerifiedAt: now,
          licenceVerifiedByAccountId: actor.accountId,
          updatedAt: now,
        };
        if (profile) {
          const [updated] = await tx
            .update(vetProfiles)
            .set({
              ...licence,
              phone: p.phone ?? profile.phone,
              websiteUrl: p.websiteUrl ?? profile.websiteUrl,
              instagramHandle: p.instagramHandle ?? profile.instagramHandle,
              clinicNameFa: p.clinicNameFa ?? profile.clinicNameFa,
              version: profile.version + 1,
            })
            .where(and(eq(vetProfiles.id, profile.id), eq(vetProfiles.version, profile.version)))
            .returning();
          if (!updated) throw conflict(STALE);
          await recordAudit(tx, actor, {
            action: 'VET_PROFILE_LICENCE_APPROVED',
            targetType: 'VET_PROFILE',
            targetId: updated.id,
            targetVersion: updated.version,
            before: { hasLicence: profile.hasLicence, licenceCode: profile.licenceCode, licenceDate: profile.licenceDate, practiceScope: profile.practiceScope },
            after: { hasLicence: true, licenceCode: updated.licenceCode, licenceDate: updated.licenceDate, practiceScope: updated.practiceScope },
            reason: reasonFa,
            metadata: { caseId: current.id, submissionVersion: current.currentSubmissionVersion },
          });
        } else {
          const [created] = await tx
            .insert(vetProfiles)
            .values({
              ...licence,
              accountId: current.accountId,
              displayNameFa: p.displayNameFa!,
              applicantType: 'DOCTOR',
              councilCode: p.councilCode,
              councilVerifiedAt: now,
              councilVerifiedByAccountId: actor.accountId,
              phone: p.phone,
              websiteUrl: p.websiteUrl,
              instagramHandle: p.instagramHandle,
              clinicNameFa: p.clinicNameFa,
              listedCityId: p.cityId,
            })
            .returning();
          vetProfileId = created!.id;
          await recordAudit(tx, actor, {
            action: 'VET_PROFILE_CREATED',
            targetType: 'VET_PROFILE',
            targetId: created!.id,
            targetVersion: created!.version,
            after: { accountId: created!.accountId, councilCode: created!.councilCode, hasLicence: true, licenceCode: created!.licenceCode, practiceScope: scope },
            reason: reasonFa,
            metadata: { caseId: current.id },
          });
        }
        if (p.serviceCodes.length > 0) {
          await tx.insert(vetProfileServices).values(p.serviceCodes.map((serviceCode) => ({ vetProfileId: vetProfileId!, serviceCode }))).onConflictDoNothing();
        }
        if (p.certificates.length > 0) {
          await tx
            .insert(vetProfileCertificates)
            .values(p.certificates.map((certificate) => ({ vetProfileId: vetProfileId!, titleFa: certificate.titleFa, fileId: certificate.fileId })))
            .onConflictDoNothing();
        }
      }

      const [row] = await tx
        .update(vetProfessionalCases)
        .set({ status: outcome, reviewNoteFa: reasonFa, reviewedByAccountId: actor.accountId, reviewedAt: now, vetProfileId, version: current.version + 1, updatedAt: now })
        .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);

      if (outcome === 'LICENSE_APPROVED_AWAITING_PAYMENT') {
        // The standing an approved but unpaid licence supports is the unlicensed tag. Never LICENSED here.
        const tag = await currentVetTag(tx, current.accountId);
        if (tag === null || (tag.tag === 'UNLICENSED' && tag.practiceScope !== scope)) {
          await replaceVetTag(tx, actor, { accountId: current.accountId, tag: 'UNLICENSED', practiceScope: scope, reasonFa, source: { type: 'VET_LICENCE_CASE', id: current.id } }, now);
        }
      }
      await recordAudit(tx, actor, {
        action: 'VET_LICENCE_CASE_DECIDED',
        targetType: CASE_TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status },
        after: { status: row.status, decision: input.decision, submissionVersion: row.currentSubmissionVersion },
        reason: reasonFa,
      });
      await createNotification(tx, {
        recipientAccountId: current.accountId,
        kind: 'VET_LICENCE_CASE_DECIDED',
        titleFa: decisionTitle(row.status as VetCaseStatus),
        bodyFa: reasonFa,
        resume: { entity: { type: CASE_TARGET, id: row.id }, step: row.status === 'NEEDS_CORRECTION' ? 'CORRECTION' : 'RESULT', originRoute: '/account/vet-profile' },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}
