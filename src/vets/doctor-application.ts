/**
 * The veterinarian (doctor) path without a practice licence — Phase 2.5 PROMPT-005.
 *
 * A signed-in account applies with its name, general or specialist, council code
 * and council card — for a directory profile of its own, or to claim an unowned
 * page a reviewer published. The association admin verifies the council code by
 * hand (DEC-0190), asks for a correction or rejects, always with a reason; an
 * answer to a correction is a new, immutable submission.
 *
 * Verification gives exactly the unlicensed doctor tag with the declared scope,
 * records that no licence was declared, and makes the directory profile the
 * account's own. It infers nothing more: no licence, no active licensed status,
 * no trusted role or eligibility. A claim transfers a page only while it is
 * still unowned, so no account can take over a record someone already owns.
 *
 * This replaces the Phase 2 application as the way a new doctor applies
 * (DEC-0191); applications already open in Phase 2 finish in /review/vets.
 */
import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, storedFiles } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { cities } from '../db/schema/geography.ts';
import { vetApplications, vetProfessionalCases, vetProfessionalDocuments, vetProfessionalSubmissions, vetProfiles } from '../db/schema/vets.ts';
import { putPrivateFile } from '../files/storage.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { boundedRows } from '../privacy/limits.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetCaseMove, type VetCaseStatus, type VetPracticeScope } from './professional-model.ts';
import { assertDecisionAllowed } from './review-workbench.ts';
import {
  CASE_STATUS_FA,
  DOCTOR_DECISION_OUTCOME,
  OPEN_CASE_STATUSES,
  doctorFieldProblems,
  isDoctorDecision,
  isDoctorDocumentKind,
  type DoctorDocumentKind,
  type DoctorFields,
} from './professional-profile-model.ts';
import { normalizeCouncilCode } from './onboarding-model.ts';
import { unifyPersianLetters } from '../breeds/model.ts';
import { currentVetTag, replaceVetTag } from './professional-tags.ts';
import { CASE_TARGET, professionalCaseHistory } from './student-application.ts';

const APPLICANT_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER'];
export const DOCTOR_REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^vet-[0-9a-f]{10}$/;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const MAX_DOCUMENTS = 5;

export type DoctorCaseRow = typeof vetProfessionalCases.$inferSelect;

export interface DoctorDocumentInput {
  readonly kind: string;
  readonly bytes: Uint8Array;
  readonly originalName?: string | null;
}

export interface DoctorFieldsInput {
  readonly displayNameFa: string;
  readonly practiceScope: string;
  readonly councilCode: string;
  readonly phone?: string | null;
  readonly cityId?: string | null;
  readonly statementFa?: string | null;
}

export interface DoctorApplicationInput extends DoctorFieldsInput {
  /** The public address of an unowned page to claim, or nothing for a profile of one's own. */
  readonly claimSlug?: string | null;
  readonly documents: readonly DoctorDocumentInput[];
}

function assertApplicant(actor: Actor): void {
  if (!APPLICANT_CONTEXTS.includes(actor.context)) throw forbidden('درخواست دامپزشک از حساب کاربری خودتان ثبت می‌شود.');
}

function assertReviewer(actor: Actor): void {
  if (!DOCTOR_REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden('بررسی کد نظام دامپزشکی فقط در محیط انجمن ممکن است.');
}

const clean = (value: string | null | undefined): string | null => {
  const out = unifyPersianLetters((value ?? '').trim()).replace(/[ \t]+/g, ' ');
  return out === '' ? null : out;
};

function validFields(input: DoctorFieldsInput): DoctorFields {
  const fields: DoctorFields = {
    displayNameFa: clean(input.displayNameFa) ?? '',
    practiceScope: input.practiceScope ?? '',
    councilCode: normalizeCouncilCode(input.councilCode ?? ''),
    phone: clean(input.phone),
    cityId: clean(input.cityId),
    statementFa: clean(input.statementFa),
  };
  const problems = doctorFieldProblems(fields);
  if (problems.length > 0) throw validation(problems.join(' '), { problems });
  return fields;
}

function validDocuments(documents: readonly DoctorDocumentInput[], requireCouncilCard: boolean): void {
  if (documents.length > MAX_DOCUMENTS) throw validation('در هر ارسال حداکثر ' + MAX_DOCUMENTS.toLocaleString('fa-IR') + ' مدرک پیوست می‌شود.');
  for (const document of documents) {
    if (!isDoctorDocumentKind(document.kind)) throw validation('این نوع مدرک در درخواست دکتر بدون پروانه پذیرفته نمی‌شود.');
  }
  if (requireCouncilCard && !documents.some((document) => document.kind === 'COUNCIL_CARD')) {
    throw validation('تصویر کارت نظام دامپزشکی را پیوست کنید.');
  }
}

const uniqueAsConflict = (error: unknown): unknown =>
  ((error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code) === '23505'
    ? conflict('درخواست یا پروفایل دیگری با همین مشخصات هم‌زمان ثبت شد؛ صفحه را دوباره باز کنید.')
    : error;

async function lockAccount(tx: DbClient, accountId: string): Promise<void> {
  await tx.execute(sql`select id from account where id = ${accountId} for update`);
}

/** A published, unowned, unmerged page — the only kind a claim may target. */
async function claimTarget(tx: DbClient, slug: string) {
  const [target] = SLUG.test(slug)
    ? await tx
        .select()
        .from(vetProfiles)
        .where(and(eq(vetProfiles.publicSlug, slug), isNull(vetProfiles.accountId), eq(vetProfiles.publicStatus, 'PUBLISHED'), isNull(vetProfiles.mergedIntoProfileId)))
        .limit(1)
    : [];
  if (!target) throw notFound('پروفایل بدون مالکی با این نشانی پیدا نشد.');
  return target;
}

/**
 * The states in which an account cannot apply as a doctor, or cannot apply for
 * this code or this page. Checked on submission, on resubmission and again at the
 * moment of verification.
 */
async function assertMayApplyAsDoctor(
  tx: DbClient,
  input: { accountId: string; councilCode: string; targetProfileId: string | null; exceptCaseId: string | null },
): Promise<void> {
  const open = await tx
    .select({ id: vetProfessionalCases.id })
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, input.accountId), inArray(vetProfessionalCases.status, [...OPEN_CASE_STATUSES])));
  if (open.some((row) => row.id !== input.exceptCaseId)) throw conflict('پرونده حرفه‌ای دیگری از شما باز است؛ همان را پیگیری کنید.');

  const [application] = await tx
    .select({ id: vetApplications.id })
    .from(vetApplications)
    .where(and(eq(vetApplications.accountId, input.accountId), inArray(vetApplications.status, ['SUBMITTED', 'NEEDS_CORRECTION'])))
    .limit(1);
  if (application) throw conflict('درخواست دامپزشک شما از پیش در حال بررسی است؛ همان را پیگیری کنید.');

  const [own] = await tx.select({ applicantType: vetProfiles.applicantType }).from(vetProfiles).where(eq(vetProfiles.accountId, input.accountId)).limit(1);
  if (own?.applicantType === 'STUDENT') throw conflict('حساب دانشجوی دامپزشکی تأییدشده از این مسیر درخواست دکتر ثبت نمی‌کند.');
  if (own) throw conflict('این حساب همین حالا پروفایل دامپزشک دارد.');
  if (await currentVetTag(tx, input.accountId)) throw conflict('این حساب Tag حرفه‌ای دارد.');

  const [role] = await tx
    .select({ id: accountRoles.id })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, input.accountId), eq(accountRoles.role, 'TRUSTED_VET'), eq(accountRoles.status, 'ACTIVE')))
    .limit(1);
  if (role) throw conflict('دامپزشک معتمد پیش‌تر ثبت شده است و از این مسیر درخواست نمی‌دهد.');

  const [holder] = await tx
    .select({ id: vetProfiles.id, accountId: vetProfiles.accountId, publicSlug: vetProfiles.publicSlug, publicStatus: vetProfiles.publicStatus })
    .from(vetProfiles)
    .where(eq(vetProfiles.councilCode, input.councilCode))
    .limit(1);
  if (holder && holder.id !== input.targetProfileId) {
    if (holder.accountId === null && holder.publicStatus === 'PUBLISHED') {
      throw conflict('این کد نظام متعلق به یک پروفایل بدون مالک است؛ به‌جای ساخت پروفایل تازه، همان را Claim کنید.', { claimSlug: holder.publicSlug });
    }
    throw conflict('این کد نظام دامپزشکی قبلاً برای پروفایل دیگری ثبت شده است.');
  }

  if (input.targetProfileId !== null) {
    const [otherCase] = await tx
      .select({ id: vetProfessionalCases.id })
      .from(vetProfessionalCases)
      .where(
        and(
          eq(vetProfessionalCases.vetProfileId, input.targetProfileId),
          inArray(vetProfessionalCases.status, [...OPEN_CASE_STATUSES]),
          input.exceptCaseId ? ne(vetProfessionalCases.id, input.exceptCaseId) : undefined,
        ),
      )
      .limit(1);
    const [otherApplication] = await tx
      .select({ id: vetApplications.id })
      .from(vetApplications)
      .where(and(eq(vetApplications.vetProfileId, input.targetProfileId), eq(vetApplications.kind, 'CLAIM'), inArray(vetApplications.status, ['SUBMITTED', 'NEEDS_CORRECTION'])))
      .limit(1);
    if (otherCase || otherApplication) throw conflict('درخواست Claim دیگری برای این پروفایل در حال بررسی است.');
  }
}

async function storeDocuments(tx: DbClient, storageRoot: string, actor: Actor, caseId: string, version: number, documents: readonly DoctorDocumentInput[]): Promise<void> {
  for (const document of documents) {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'VET_PROFESSIONAL_DOCUMENT',
      bytes: document.bytes,
      originalName: document.originalName ?? null,
    });
    await tx.insert(vetProfessionalDocuments).values({ caseId, submissionVersion: version, kind: document.kind as DoctorDocumentKind, fileId: stored.id });
  }
}

async function assertCity(tx: DbClient, cityId: string | null): Promise<void> {
  if (cityId === null) return;
  const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId)).limit(1);
  if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
}

const payloadOf = (fields: DoctorFields, claimSlug: string | null, documents: number) => ({
  source: 'DOCTOR_APPLICATION',
  ...fields,
  declaredLicence: false,
  claimSlug,
  documents,
});

// ── Applicant ──────────────────────────────────────────────────────────────

export async function submitDoctorApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: DoctorApplicationInput,
  now: Date = new Date(),
): Promise<DoctorCaseRow> {
  assertApplicant(actor);
  const fields = validFields(input);
  validDocuments(input.documents, true);
  const claimSlug = clean(input.claimSlug);
  try {
    return await database.transaction(async (tx) => {
      await lockAccount(tx, actor.accountId);
      const target = claimSlug !== null ? await claimTarget(tx, claimSlug) : null;
      if (target?.councilCode && target.councilCode !== fields.councilCode) {
        throw validation('کد نظام واردشده با کد ثبت‌شده برای این پروفایل نمی‌خواند.');
      }
      await assertCity(tx, fields.cityId);
      await assertMayApplyAsDoctor(tx, { accountId: actor.accountId, councilCode: fields.councilCode, targetProfileId: target?.id ?? null, exceptCaseId: null });
      const [row] = await tx
        .insert(vetProfessionalCases)
        .values({ accountId: actor.accountId, caseType: 'COUNCIL', status: 'SUBMITTED', currentSubmissionVersion: 1, vetProfileId: target?.id ?? null, createdAt: now, updatedAt: now })
        .returning();
      await tx.insert(vetProfessionalSubmissions).values({
        caseId: row!.id,
        version: 1,
        submittedByAccountId: actor.accountId,
        submittedAt: now,
        payload: payloadOf(fields, target?.publicSlug ?? null, input.documents.length),
      });
      await storeDocuments(tx, storageRoot, actor, row!.id, 1, input.documents);
      await recordAudit(tx, actor, {
        action: 'VET_DOCTOR_CASE_SUBMITTED',
        targetType: CASE_TARGET,
        targetId: row!.id,
        targetVersion: row!.version,
        after: { status: row!.status, submissionVersion: 1, claimProfileId: target?.id ?? null, councilCode: fields.councilCode, practiceScope: fields.practiceScope },
      });
      return row!;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

/** The answer to a correction: a new version of the evidence; the one reviewed before stays. */
export async function resubmitDoctorApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: DoctorFieldsInput & { caseId: string; expectedVersion: number; documents: readonly DoctorDocumentInput[] },
  now: Date = new Date(),
): Promise<DoctorCaseRow> {
  assertApplicant(actor);
  const fields = validFields(input);
  validDocuments(input.documents, false);
  if (!UUID.test(input.caseId)) throw notFound('پرونده پیدا نشد.');
  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
      if (!current || current.accountId !== actor.accountId || current.caseType !== 'COUNCIL' || current.legacyApplicationId !== null) {
        throw notFound('پرونده پیدا نشد.');
      }
      if (current.version !== input.expectedVersion) throw conflict(STALE);
      if (current.status !== 'NEEDS_CORRECTION' || !vetCaseMove(current.status, 'SUBMITTED', 'APPLICANT')) {
        throw conflict('فقط پرونده‌ای که اصلاحش خواسته شده دوباره ارسال می‌شود.');
      }
      await lockAccount(tx, actor.accountId);
      let claimSlug: string | null = null;
      if (current.vetProfileId !== null) {
        const [target] = await tx.select().from(vetProfiles).where(eq(vetProfiles.id, current.vetProfileId)).limit(1);
        if (!target || target.accountId !== null) throw conflict('این پروفایل دیگر بدون مالک نیست.');
        if (target.councilCode && target.councilCode !== fields.councilCode) throw validation('کد نظام واردشده با کد ثبت‌شده برای این پروفایل نمی‌خواند.');
        claimSlug = target.publicSlug;
      }
      await assertCity(tx, fields.cityId);
      await assertMayApplyAsDoctor(tx, { accountId: actor.accountId, councilCode: fields.councilCode, targetProfileId: current.vetProfileId, exceptCaseId: current.id });
      const version = current.currentSubmissionVersion + 1;
      const [row] = await tx
        .update(vetProfessionalCases)
        .set({ status: 'SUBMITTED', currentSubmissionVersion: version, version: current.version + 1, updatedAt: now })
        .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      await tx.insert(vetProfessionalSubmissions).values({
        caseId: row.id,
        version,
        submittedByAccountId: actor.accountId,
        submittedAt: now,
        payload: payloadOf(fields, claimSlug, input.documents.length),
      });
      await storeDocuments(tx, storageRoot, actor, row.id, version, input.documents);
      await recordAudit(tx, actor, {
        action: 'VET_DOCTOR_CASE_RESUBMITTED',
        targetType: CASE_TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status, submissionVersion: current.currentSubmissionVersion },
        after: { status: row.status, submissionVersion: version, councilCode: fields.councilCode, practiceScope: fields.practiceScope },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

/** The account's newest doctor case of this path (not a mirrored Phase 2 application), with its history. */
export async function myDoctorCase(database: DbClient, actor: Actor) {
  const [row] = await database
    .select()
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, actor.accountId), eq(vetProfessionalCases.caseType, 'COUNCIL'), isNull(vetProfessionalCases.legacyApplicationId)))
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
    claimProfileId: row.vetProfileId,
    fields: (submissions.at(-1)?.payload ?? null) as (DoctorFields & { claimSlug?: string | null }) | null,
    documents: documents.map((document) => ({ id: document.id, fileId: document.fileId, kind: document.kind, submissionVersion: document.submissionVersion })),
    history: history[row.id] ?? [],
  };
}

// ── Reviewer ───────────────────────────────────────────────────────────────

const QUEUE: Record<'OPEN' | 'CORRECTION' | 'DECIDED', readonly VetCaseStatus[]> = {
  OPEN: ['SUBMITTED', 'UNDER_REVIEW'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['VERIFIED_NO_LICENSE', 'REJECTED'],
};

/** Cases of this path only: a mirrored Phase 2 application finishes where it started (DEC-0191). */
const thisPath = and(eq(vetProfessionalCases.caseType, 'COUNCIL'), isNull(vetProfessionalCases.legacyApplicationId));

export async function doctorCaseQueue(
  database: DbClient,
  actor: Actor,
  query: { view: 'OPEN' | 'CORRECTION' | 'DECIDED'; page: number; pageSize?: number },
) {
  assertReviewer(actor);
  const request = { page: query.page, pageSize: boundedRows(query.pageSize, 20) };
  const where = and(thisPath, inArray(vetProfessionalCases.status, [...QUEUE[query.view]]));
  const [[total], rows] = await Promise.all([
    database.select({ value: count() }).from(vetProfessionalCases).where(where),
    database
      .select({ row: vetProfessionalCases, payload: vetProfessionalSubmissions.payload })
      .from(vetProfessionalCases)
      .leftJoin(
        vetProfessionalSubmissions,
        and(eq(vetProfessionalSubmissions.caseId, vetProfessionalCases.id), eq(vetProfessionalSubmissions.version, vetProfessionalCases.currentSubmissionVersion)),
      )
      .where(where)
      .orderBy(query.view === 'DECIDED' ? desc(vetProfessionalCases.updatedAt) : asc(vetProfessionalCases.updatedAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);
  const items = rows.map(({ row, payload }) => {
    const fields = (payload ?? {}) as Partial<DoctorFields>;
    return {
      id: row.id,
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      submissionVersion: row.currentSubmissionVersion,
      claim: row.vetProfileId !== null,
      displayNameFa: fields.displayNameFa ?? null,
      councilCode: fields.councilCode ?? null,
      practiceScope: (fields.practiceScope ?? null) as VetPracticeScope | null,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
  return pageOf(items, total?.value ?? 0, request);
}

export async function doctorCaseForReview(database: DbClient, actor: Actor, caseId: string) {
  assertReviewer(actor);
  if (!UUID.test(caseId)) return null;
  const [row] = await database.select().from(vetProfessionalCases).where(and(eq(vetProfessionalCases.id, caseId), thisPath)).limit(1);
  if (!row) return null;
  const [submissions, documents, [identity], history, [target]] = await Promise.all([
    database.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id)).orderBy(asc(vetProfessionalSubmissions.version)),
    database
      .select({ id: vetProfessionalDocuments.id, fileId: vetProfessionalDocuments.fileId, kind: vetProfessionalDocuments.kind, submissionVersion: vetProfessionalDocuments.submissionVersion, mime: storedFiles.mime, originalName: storedFiles.originalName })
      .from(vetProfessionalDocuments)
      .innerJoin(storedFiles, eq(storedFiles.id, vetProfessionalDocuments.fileId))
      .where(eq(vetProfessionalDocuments.caseId, row.id))
      .orderBy(asc(vetProfessionalDocuments.submissionVersion)),
    database.select({ firstName: profiles.firstName, lastName: profiles.lastName, nationalId: profiles.nationalId }).from(profiles).where(eq(profiles.accountId, row.accountId)).limit(1),
    professionalCaseHistory(database, [row.id]),
    row.vetProfileId
      ? database
          .select({ id: vetProfiles.id, displayNameFa: vetProfiles.displayNameFa, publicSlug: vetProfiles.publicSlug, accountId: vetProfiles.accountId, councilCode: vetProfiles.councilCode, cityNameFa: cities.nameFa })
          .from(vetProfiles)
          .leftJoin(cities, eq(cities.id, vetProfiles.listedCityId))
          .where(eq(vetProfiles.id, row.vetProfileId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const latest = submissions.at(-1)?.payload as DoctorFields | undefined;
  const councilCode = latest?.councilCode ?? null;
  const [profilesWithCode, casesWithCode] = councilCode
    ? await Promise.all([
        database
          .select({ id: vetProfiles.id, accountId: vetProfiles.accountId, displayNameFa: vetProfiles.displayNameFa, publicSlug: vetProfiles.publicSlug })
          .from(vetProfiles)
          .where(and(eq(vetProfiles.councilCode, councilCode), row.vetProfileId ? ne(vetProfiles.id, row.vetProfileId) : undefined))
          .limit(20),
        database
          .selectDistinct({ caseId: vetProfessionalCases.id, accountId: vetProfessionalCases.accountId, status: vetProfessionalCases.status })
          .from(vetProfessionalSubmissions)
          .innerJoin(vetProfessionalCases, eq(vetProfessionalCases.id, vetProfessionalSubmissions.caseId))
          .where(
            and(
              eq(vetProfessionalCases.caseType, 'COUNCIL'),
              ne(vetProfessionalCases.accountId, row.accountId),
              sql`${vetProfessionalSubmissions.payload} ->> 'councilCode' = ${councilCode}`,
            ),
          )
          .limit(20),
      ])
    : [[], []];
  return {
    case: { ...row, statusFa: CASE_STATUS_FA[row.status as VetCaseStatus] },
    applicantNameFa: identity ? identity.firstName + ' ' + identity.lastName : null,
    applicantNationalId: identity?.nationalId ?? null,
    claimTarget: target ?? null,
    submissions: submissions.map((submission) => ({ version: submission.version, submittedAt: submission.submittedAt, fields: submission.payload as DoctorFields & { claimSlug?: string | null } })),
    documents,
    history: history[row.id] ?? [],
    duplicates: { profiles: profilesWithCode, cases: casesWithCode },
  };
}

function decisionTitle(status: VetCaseStatus): string {
  if (status === 'VERIFIED_NO_LICENSE') return 'کد نظام دامپزشکی شما تأیید شد';
  if (status === 'NEEDS_CORRECTION') return 'درخواست دامپزشک شما نیازمند اصلاح است';
  return 'درخواست دامپزشک شما رد شد';
}

export async function decideDoctorCase(
  database: Database,
  actor: Actor,
  input: { caseId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<DoctorCaseRow> {
  assertReviewer(actor);
  if (!isDoctorDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const reasonFa = (input.reasonFa ?? '').trim();
  if (reasonFa === '') throw validation('دلیل تصمیم را بنویسید؛ برای متقاضی نمایش داده می‌شود.');
  if (reasonFa.length > 1000) throw validation('دلیل تصمیم حداکثر ۱۰۰۰ نویسه است.');
  if (!UUID.test(input.caseId)) throw notFound('پرونده پیدا نشد.');
  const outcome = DOCTOR_DECISION_OUTCOME[input.decision];

  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(vetProfessionalCases).where(and(eq(vetProfessionalCases.id, input.caseId), thisPath)).limit(1);
      if (!current) throw notFound('پرونده پیدا نشد.');
      if (current.accountId === actor.accountId) throw forbidden('پرونده خودتان را نمی‌توانید بررسی کنید.');
      if (current.version !== input.expectedVersion) throw conflict(STALE);
      const reviewable =
        (current.status === 'UNDER_REVIEW' || (current.status === 'SUBMITTED' && vetCaseMove('SUBMITTED', 'UNDER_REVIEW', 'REVIEWER'))) &&
        vetCaseMove('UNDER_REVIEW', outcome, 'REVIEWER');
      if (!reviewable) throw conflict('این پرونده در انتظار بررسی نیست.');
      await assertDecisionAllowed(tx, current, actor, outcome);

      let vetProfileId = current.vetProfileId;
      let scope: VetPracticeScope | null = null;
      if (outcome === 'VERIFIED_NO_LICENSE') {
        const [latest] = await tx
          .select()
          .from(vetProfessionalSubmissions)
          .where(and(eq(vetProfessionalSubmissions.caseId, current.id), eq(vetProfessionalSubmissions.version, current.currentSubmissionVersion)))
          .limit(1);
        const fields = latest!.payload as DoctorFields;
        scope = fields.practiceScope as VetPracticeScope;
        // Checked again at the moment of verification, not trusted from the submission.
        await lockAccount(tx, current.accountId);
        await assertMayApplyAsDoctor(tx, { accountId: current.accountId, councilCode: fields.councilCode, targetProfileId: current.vetProfileId, exceptCaseId: current.id });
        const verified = {
          councilCode: fields.councilCode,
          councilVerifiedAt: now,
          councilVerifiedByAccountId: actor.accountId,
          applicantType: 'DOCTOR' as const,
          practiceScope: scope,
          // Declared by the path itself: this applicant said there is no licence. Nothing about one is inferred.
          hasLicence: false,
          updatedAt: now,
        };
        if (current.vetProfileId !== null) {
          const [before] = await tx.select().from(vetProfiles).where(eq(vetProfiles.id, current.vetProfileId)).limit(1);
          // Only while still unowned: an owned record is never taken over, whoever approved what.
          const [claimed] = await tx
            .update(vetProfiles)
            .set({ ...verified, accountId: current.accountId, claimedAt: now, phone: before?.phone ?? fields.phone, version: (before?.version ?? 0) + 1 })
            .where(and(eq(vetProfiles.id, current.vetProfileId), isNull(vetProfiles.accountId), isNull(vetProfiles.mergedIntoProfileId)))
            .returning();
          if (!claimed) throw conflict('این پروفایل پیش‌تر به حساب دیگری منتقل شده است.');
          await recordAudit(tx, actor, {
            action: 'VET_PROFILE_CLAIMED',
            targetType: 'VET_PROFILE',
            targetId: claimed.id,
            targetVersion: claimed.version,
            before: { accountId: null, councilCode: before?.councilCode ?? null, councilVerifiedAt: before?.councilVerifiedAt ?? null },
            after: { accountId: claimed.accountId, councilCode: claimed.councilCode, practiceScope: scope, hasLicence: false },
            reason: reasonFa,
            metadata: { caseId: current.id },
          });
        } else {
          const [created] = await tx
            .insert(vetProfiles)
            .values({ ...verified, accountId: current.accountId, displayNameFa: fields.displayNameFa, phone: fields.phone, listedCityId: fields.cityId })
            .returning();
          vetProfileId = created!.id;
          await recordAudit(tx, actor, {
            action: 'VET_PROFILE_CREATED',
            targetType: 'VET_PROFILE',
            targetId: created!.id,
            targetVersion: created!.version,
            after: { accountId: created!.accountId, councilCode: created!.councilCode, practiceScope: scope, hasLicence: false },
            reason: reasonFa,
            metadata: { caseId: current.id },
          });
        }
      }

      const [row] = await tx
        .update(vetProfessionalCases)
        .set({ status: outcome, reviewNoteFa: reasonFa, reviewedByAccountId: actor.accountId, reviewedAt: now, vetProfileId, claimedByAccountId: null, claimedAt: null, version: current.version + 1, updatedAt: now })
        .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);

      if (outcome === 'VERIFIED_NO_LICENSE') {
        // Exactly the unlicensed doctor tag with the declared scope; never a licensed or trusted one.
        await replaceVetTag(tx, actor, { accountId: current.accountId, tag: 'UNLICENSED', practiceScope: scope, reasonFa, source: { type: 'VET_COUNCIL_CASE', id: current.id } }, now);
      }
      await recordAudit(tx, actor, {
        action: 'VET_DOCTOR_CASE_DECIDED',
        targetType: CASE_TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status },
        after: { status: row.status, decision: input.decision, submissionVersion: row.currentSubmissionVersion },
        reason: reasonFa,
      });
      await createNotification(tx, {
        recipientAccountId: current.accountId,
        kind: 'VET_DOCTOR_CASE_DECIDED',
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

/** Whether this account already follows a claim of that page, or another case. For the claim page. */
export async function openProfessionalCaseOf(database: DbClient, actor: Actor) {
  const [row] = await database
    .select({ id: vetProfessionalCases.id, caseType: vetProfessionalCases.caseType, vetProfileId: vetProfessionalCases.vetProfileId })
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, actor.accountId), inArray(vetProfessionalCases.status, [...OPEN_CASE_STATUSES])))
    .limit(1);
  return row ?? null;
}
