/**
 * The veterinary student path — Phase 2.5 PROMPT-004.
 *
 * A signed-in account, still an ordinary account, asks to be verified as a
 * veterinary student with its student number and university, and may attach a
 * private student card. The association admin (the association operator,
 * DEC-0190) verifies it by hand, asks for a correction or rejects it, always
 * with a reason; each answer to a correction is a new, immutable submission.
 *
 * Verification writes the student record onto the account's canonical
 * `vet_profile` and gives the one student tag, in the same transaction. It opens
 * nothing a doctor has: no role, no directory page, no place of practice, no
 * advertising, no doctor tag (see the guards in directory, advertising and
 * professional-tags).
 */
import { and, asc, desc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, auditEvents, storedFiles } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { vetApplications, vetProfessionalCases, vetProfessionalDocuments, vetProfessionalSubmissions, vetProfiles } from '../db/schema/vets.ts';
import { putPrivateFile } from '../files/storage.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { boundedRows } from '../privacy/limits.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';
import { vetCaseMove, type VetCaseStatus } from './professional-model.ts';
import {
  CASE_STATUS_FA,
  OPEN_CASE_STATUSES,
  STUDENT_DECISION_OUTCOME,
  isStudentDecision,
  normalizeStudentNumber,
  studentFieldProblems,
  type StudentFields,
} from './professional-profile-model.ts';
import { currentVetTag, replaceVetTag } from './professional-tags.ts';

export const CASE_TARGET = 'VET_PROFESSIONAL_CASE';
/** Applying is done from the account itself, never from an operational environment. */
const APPLICANT_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER'];
export const STUDENT_REVIEWER_CONTEXTS: readonly ActorContextName[] = ['ASSOCIATION_OPERATOR', 'SUPERADMIN'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این پرونده هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';

export type StudentCaseRow = typeof vetProfessionalCases.$inferSelect;

export interface StudentDocumentInput {
  readonly bytes: Uint8Array;
  readonly originalName?: string | null;
}

export interface StudentApplicationInput {
  readonly displayNameFa: string;
  readonly studentNumber: string;
  readonly universityFa: string;
  /** Optional: a student card or enrolment letter, private to the applicant and the reviewers. */
  readonly document?: StudentDocumentInput | null;
}

function assertApplicant(actor: Actor): void {
  if (!APPLICANT_CONTEXTS.includes(actor.context)) throw forbidden('درخواست دانشجویی از حساب کاربری خودتان ثبت می‌شود.');
}

function assertReviewer(actor: Actor): void {
  if (!STUDENT_REVIEWER_CONTEXTS.includes(actor.context)) throw forbidden('بررسی پرونده دانشجویی فقط در محیط انجمن ممکن است.');
}

function validFields(input: StudentApplicationInput): StudentFields {
  const fields = {
    displayNameFa: (input.displayNameFa ?? '').trim().replace(/\s+/g, ' '),
    studentNumber: normalizeStudentNumber(input.studentNumber),
    universityFa: (input.universityFa ?? '').trim().replace(/\s+/g, ' '),
  };
  const problems = studentFieldProblems(fields);
  if (problems.length > 0) throw validation(problems.join(' '), { problems });
  return fields;
}

const uniqueAsConflict = (error: unknown): unknown =>
  ((error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code) === '23505'
    ? conflict('پرونده حرفه‌ای دیگری از شما هم‌زمان ثبت شد؛ صفحه را دوباره باز کنید.')
    : error;

async function lockAccount(tx: DbClient, accountId: string): Promise<void> {
  await tx.execute(sql`select id from account where id = ${accountId} for update`);
}

/**
 * The states in which an account cannot be a student applicant: another open
 * professional case or Phase 2 application, a professional profile or tag it
 * already holds, or the trusted veterinarian role.
 */
async function assertMayApplyAsStudent(tx: DbClient, accountId: string, exceptCaseId: string | null): Promise<void> {
  const open = await tx
    .select({ id: vetProfessionalCases.id })
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, accountId), inArray(vetProfessionalCases.status, [...OPEN_CASE_STATUSES])));
  if (open.some((row) => row.id !== exceptCaseId)) throw conflict('پرونده حرفه‌ای دیگری از شما باز است؛ همان را پیگیری کنید.');

  const [application] = await tx
    .select({ id: vetApplications.id })
    .from(vetApplications)
    .where(and(eq(vetApplications.accountId, accountId), inArray(vetApplications.status, ['SUBMITTED', 'NEEDS_CORRECTION'])))
    .limit(1);
  if (application) throw conflict('درخواست دامپزشک شما در حال بررسی است؛ درخواست دانشجویی هم‌زمان ثبت نمی‌شود.');

  const [profile] = await tx.select({ applicantType: vetProfiles.applicantType }).from(vetProfiles).where(eq(vetProfiles.accountId, accountId)).limit(1);
  if (profile?.applicantType === 'STUDENT') throw conflict('دانشجویی شما پیش‌تر تأیید شده است.');
  if (profile) throw conflict('این حساب پروفایل دکتر دامپزشک دارد و مسیر دانشجویی ندارد.');

  if (await currentVetTag(tx, accountId)) throw conflict('این حساب Tag حرفه‌ای دارد و مسیر دانشجویی ندارد.');

  const [role] = await tx
    .select({ id: accountRoles.id })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.role, 'TRUSTED_VET'), eq(accountRoles.status, 'ACTIVE')))
    .limit(1);
  if (role) throw conflict('دامپزشک معتمد مسیر دانشجویی ندارد.');
}

async function storeStudentCard(tx: DbClient, storageRoot: string, actor: Actor, caseId: string, version: number, document: StudentDocumentInput): Promise<void> {
  const stored = await putPrivateFile(tx, storageRoot, actor, {
    ownerAccountId: actor.accountId,
    purpose: 'VET_PROFESSIONAL_DOCUMENT',
    bytes: document.bytes,
    originalName: document.originalName ?? null,
  });
  await tx.insert(vetProfessionalDocuments).values({ caseId, submissionVersion: version, kind: 'STUDENT_CARD', fileId: stored.id });
}

const payloadOf = (fields: StudentFields, hasDocument: boolean) => ({ source: 'STUDENT_APPLICATION', ...fields, hasDocument });

// ── Applicant ──────────────────────────────────────────────────────────────

export async function submitStudentApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: StudentApplicationInput,
  now: Date = new Date(),
): Promise<StudentCaseRow> {
  assertApplicant(actor);
  const fields = validFields(input);
  if (!vetCaseMove('DRAFT', 'SUBMITTED', 'APPLICANT')) throw conflict('ارسال پرونده ممکن نیست.');
  try {
    return await database.transaction(async (tx) => {
      await lockAccount(tx, actor.accountId);
      await assertMayApplyAsStudent(tx, actor.accountId, null);
      const [row] = await tx
        .insert(vetProfessionalCases)
        .values({ accountId: actor.accountId, caseType: 'STUDENT', status: 'SUBMITTED', currentSubmissionVersion: 1, createdAt: now, updatedAt: now })
        .returning();
      await tx.insert(vetProfessionalSubmissions).values({
        caseId: row!.id,
        version: 1,
        submittedByAccountId: actor.accountId,
        submittedAt: now,
        payload: payloadOf(fields, Boolean(input.document)),
      });
      if (input.document) await storeStudentCard(tx, storageRoot, actor, row!.id, 1, input.document);
      await recordAudit(tx, actor, {
        action: 'VET_STUDENT_CASE_SUBMITTED',
        targetType: CASE_TARGET,
        targetId: row!.id,
        targetVersion: row!.version,
        after: { status: row!.status, submissionVersion: 1, hasDocument: Boolean(input.document) },
      });
      return row!;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

/** The answer to a correction: a new submission version, with the earlier one kept as it was. */
export async function resubmitStudentApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: StudentApplicationInput & { caseId: string; expectedVersion: number },
  now: Date = new Date(),
): Promise<StudentCaseRow> {
  assertApplicant(actor);
  const fields = validFields(input);
  if (!UUID.test(input.caseId)) throw notFound('پرونده پیدا نشد.');
  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
      // Someone else's case is not found rather than forbidden: its existence is not disclosed.
      if (!current || current.accountId !== actor.accountId || current.caseType !== 'STUDENT') throw notFound('پرونده پیدا نشد.');
      if (current.version !== input.expectedVersion) throw conflict(STALE);
      if (current.status !== 'NEEDS_CORRECTION' || !vetCaseMove(current.status, 'SUBMITTED', 'APPLICANT')) {
        throw conflict('فقط پرونده‌ای که اصلاحش خواسته شده دوباره ارسال می‌شود.');
      }
      await lockAccount(tx, actor.accountId);
      await assertMayApplyAsStudent(tx, actor.accountId, current.id);
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
        payload: payloadOf(fields, Boolean(input.document)),
      });
      if (input.document) await storeStudentCard(tx, storageRoot, actor, row.id, version, input.document);
      await recordAudit(tx, actor, {
        action: 'VET_STUDENT_CASE_RESUBMITTED',
        targetType: CASE_TARGET,
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status, submissionVersion: current.currentSubmissionVersion },
        after: { status: row.status, submissionVersion: version, hasDocument: Boolean(input.document) },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

// ── History ────────────────────────────────────────────────────────────────

export interface CaseHistoryEvent {
  readonly at: string;
  readonly action: string;
  readonly fromStatus: VetCaseStatus | null;
  readonly toStatus: VetCaseStatus | null;
  readonly toStatusFa: string | null;
  readonly reasonFa: string | null;
  readonly submissionVersion: number | null;
}

const statusIn = (value: unknown): VetCaseStatus | null => {
  const status = (value as { status?: unknown } | null)?.status;
  return typeof status === 'string' && status in CASE_STATUS_FA ? (status as VetCaseStatus) : null;
};

/**
 * What happened to each case, oldest first, from its audit events. Who acted is
 * deliberately left out: the applicant reads this, and a reviewer's identity is
 * not theirs to see.
 */
export async function professionalCaseHistory(database: DbClient, caseIds: readonly string[]): Promise<Record<string, CaseHistoryEvent[]>> {
  const out: Record<string, CaseHistoryEvent[]> = Object.fromEntries(caseIds.map((id) => [id, []]));
  if (caseIds.length === 0) return out;
  const rows = await database
    .select({ targetId: auditEvents.targetId, occurredAt: auditEvents.occurredAt, action: auditEvents.action, before: auditEvents.before, after: auditEvents.after, reason: auditEvents.reason })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetType, CASE_TARGET), inArray(auditEvents.targetId, [...caseIds])))
    .orderBy(asc(auditEvents.occurredAt))
    .limit(50 * caseIds.length);
  for (const row of rows) {
    const toStatus = statusIn(row.after);
    const version = (row.after as { submissionVersion?: unknown } | null)?.submissionVersion;
    out[row.targetId]?.push({
      at: row.occurredAt.toISOString(),
      action: row.action,
      fromStatus: statusIn(row.before),
      toStatus,
      toStatusFa: toStatus ? CASE_STATUS_FA[toStatus] : null,
      reasonFa: row.reason,
      submissionVersion: typeof version === 'number' ? version : null,
    });
  }
  return out;
}

// ── Reviewer ───────────────────────────────────────────────────────────────

const QUEUE: Record<'OPEN' | 'CORRECTION' | 'DECIDED', readonly VetCaseStatus[]> = {
  OPEN: ['SUBMITTED', 'UNDER_REVIEW'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['VERIFIED_STUDENT', 'REJECTED'],
};

export async function studentCaseQueue(
  database: DbClient,
  actor: Actor,
  query: { view: 'OPEN' | 'CORRECTION' | 'DECIDED'; page: number; pageSize?: number },
) {
  assertReviewer(actor);
  const request = { page: query.page, pageSize: boundedRows(query.pageSize, 20) };
  const where = and(eq(vetProfessionalCases.caseType, 'STUDENT'), inArray(vetProfessionalCases.status, [...QUEUE[query.view]]));
  const [[total], rows] = await Promise.all([
    database.select({ value: count() }).from(vetProfessionalCases).where(where),
    database
      .select({ row: vetProfessionalCases, payload: vetProfessionalSubmissions.payload, firstName: profiles.firstName, lastName: profiles.lastName })
      .from(vetProfessionalCases)
      .leftJoin(
        vetProfessionalSubmissions,
        and(eq(vetProfessionalSubmissions.caseId, vetProfessionalCases.id), eq(vetProfessionalSubmissions.version, vetProfessionalCases.currentSubmissionVersion)),
      )
      .leftJoin(profiles, eq(profiles.accountId, vetProfessionalCases.accountId))
      .where(where)
      // The longest-waiting case first; decided ones newest first.
      .orderBy(query.view === 'DECIDED' ? desc(vetProfessionalCases.updatedAt) : asc(vetProfessionalCases.updatedAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);
  const items = rows.map(({ row, payload, firstName, lastName }) => {
    const fields = (payload ?? {}) as Partial<StudentFields>;
    return {
      id: row.id,
      version: row.version,
      status: row.status as VetCaseStatus,
      statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
      submissionVersion: row.currentSubmissionVersion,
      displayNameFa: fields.displayNameFa ?? null,
      studentNumber: fields.studentNumber ?? null,
      universityFa: fields.universityFa ?? null,
      applicantNameFa: firstName ? firstName + ' ' + (lastName ?? '') : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
  return pageOf(items, total?.value ?? 0, request);
}

export async function studentCaseForReview(database: DbClient, actor: Actor, caseId: string) {
  assertReviewer(actor);
  if (!UUID.test(caseId)) return null;
  const [row] = await database.select().from(vetProfessionalCases).where(and(eq(vetProfessionalCases.id, caseId), eq(vetProfessionalCases.caseType, 'STUDENT'))).limit(1);
  if (!row) return null;
  const [submissions, documents, [identity], history] = await Promise.all([
    database.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id)).orderBy(asc(vetProfessionalSubmissions.version)),
    database
      .select({ id: vetProfessionalDocuments.id, fileId: vetProfessionalDocuments.fileId, kind: vetProfessionalDocuments.kind, submissionVersion: vetProfessionalDocuments.submissionVersion, mime: storedFiles.mime, originalName: storedFiles.originalName })
      .from(vetProfessionalDocuments)
      .innerJoin(storedFiles, eq(storedFiles.id, vetProfessionalDocuments.fileId))
      .where(eq(vetProfessionalDocuments.caseId, row.id))
      .orderBy(asc(vetProfessionalDocuments.submissionVersion)),
    database.select({ firstName: profiles.firstName, lastName: profiles.lastName, nationalId: profiles.nationalId }).from(profiles).where(eq(profiles.accountId, row.accountId)).limit(1),
    professionalCaseHistory(database, [row.id]),
  ]);
  const latest = submissions.at(-1);
  const studentNumber = (latest?.payload as Partial<StudentFields> | undefined)?.studentNumber ?? null;
  // The same student number on another account is the first thing a reviewer must see.
  const [profilesWithNumber, casesWithNumber] = studentNumber
    ? await Promise.all([
        database
          .select({ accountId: vetProfiles.accountId, displayNameFa: vetProfiles.displayNameFa, universityFa: vetProfiles.universityFa })
          .from(vetProfiles)
          .where(and(eq(vetProfiles.studentNumber, studentNumber), ne(vetProfiles.accountId, row.accountId)))
          .limit(20),
        database
          .selectDistinct({ caseId: vetProfessionalCases.id, accountId: vetProfessionalCases.accountId, status: vetProfessionalCases.status })
          .from(vetProfessionalSubmissions)
          .innerJoin(vetProfessionalCases, eq(vetProfessionalCases.id, vetProfessionalSubmissions.caseId))
          .where(
            and(
              eq(vetProfessionalCases.caseType, 'STUDENT'),
              ne(vetProfessionalCases.accountId, row.accountId),
              sql`${vetProfessionalSubmissions.payload} ->> 'studentNumber' = ${studentNumber}`,
            ),
          )
          .limit(20),
      ])
    : [[], []];
  return {
    case: { ...row, statusFa: CASE_STATUS_FA[row.status as VetCaseStatus] },
    applicantNameFa: identity ? identity.firstName + ' ' + identity.lastName : null,
    applicantNationalId: identity?.nationalId ?? null,
    submissions: submissions.map((submission) => ({ version: submission.version, submittedAt: submission.submittedAt, fields: submission.payload as StudentFields & { hasDocument?: boolean } })),
    documents,
    history: history[row.id] ?? [],
    duplicates: { profiles: profilesWithNumber, cases: casesWithNumber },
  };
}

function decisionTitle(status: VetCaseStatus): string {
  if (status === 'VERIFIED_STUDENT') return 'دانشجویی دامپزشکی شما تأیید شد';
  if (status === 'NEEDS_CORRECTION') return 'پرونده دانشجویی شما نیازمند اصلاح است';
  return 'پرونده دانشجویی شما رد شد';
}

export async function decideStudentCase(
  database: Database,
  actor: Actor,
  input: { caseId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<StudentCaseRow> {
  assertReviewer(actor);
  if (!isStudentDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const reasonFa = (input.reasonFa ?? '').trim();
  if (reasonFa === '') throw validation('دلیل تصمیم را بنویسید؛ برای متقاضی نمایش داده می‌شود.');
  if (reasonFa.length > 1000) throw validation('دلیل تصمیم حداکثر ۱۰۰۰ نویسه است.');
  if (!UUID.test(input.caseId)) throw notFound('پرونده پیدا نشد.');
  const outcome = STUDENT_DECISION_OUTCOME[input.decision];

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(vetProfessionalCases).where(eq(vetProfessionalCases.id, input.caseId)).limit(1);
    if (!current || current.caseType !== 'STUDENT') throw notFound('پرونده پیدا نشد.');
    if (current.accountId === actor.accountId) throw forbidden('پرونده خودتان را نمی‌توانید بررسی کنید.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    // Deciding a submitted case starts its review and ends it in one step; both moves must be legal.
    const reviewable =
      (current.status === 'UNDER_REVIEW' || (current.status === 'SUBMITTED' && vetCaseMove('SUBMITTED', 'UNDER_REVIEW', 'REVIEWER'))) &&
      vetCaseMove('UNDER_REVIEW', outcome, 'REVIEWER');
    if (!reviewable) throw conflict('این پرونده در انتظار بررسی نیست.');

    let vetProfileId = current.vetProfileId;
    if (outcome === 'VERIFIED_STUDENT') {
      const [latest] = await tx
        .select()
        .from(vetProfessionalSubmissions)
        .where(and(eq(vetProfessionalSubmissions.caseId, current.id), eq(vetProfessionalSubmissions.version, current.currentSubmissionVersion)))
        .limit(1);
      const fields = latest!.payload as StudentFields;
      // Checked again at the moment of verification, not trusted from the submission.
      await lockAccount(tx, current.accountId);
      await assertMayApplyAsStudent(tx, current.accountId, current.id);
      const [profile] = await tx
        .insert(vetProfiles)
        .values({ accountId: current.accountId, displayNameFa: fields.displayNameFa, applicantType: 'STUDENT', studentNumber: fields.studentNumber, universityFa: fields.universityFa })
        .returning();
      vetProfileId = profile!.id;
      await recordAudit(tx, actor, {
        action: 'VET_PROFILE_STUDENT_VERIFIED',
        targetType: 'VET_PROFILE',
        targetId: profile!.id,
        targetVersion: profile!.version,
        after: { accountId: current.accountId, applicantType: 'STUDENT', studentNumber: fields.studentNumber, universityFa: fields.universityFa },
        reason: reasonFa,
        metadata: { caseId: current.id, submissionVersion: current.currentSubmissionVersion },
      });
    }

    const [row] = await tx
      .update(vetProfessionalCases)
      .set({ status: outcome, reviewNoteFa: reasonFa, reviewedByAccountId: actor.accountId, reviewedAt: now, vetProfileId, version: current.version + 1, updatedAt: now })
      .where(and(eq(vetProfessionalCases.id, current.id), eq(vetProfessionalCases.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);

    if (outcome === 'VERIFIED_STUDENT') {
      // After the case is verified, so the tag rule can see the verified case it follows from.
      await replaceVetTag(tx, actor, { accountId: current.accountId, tag: 'STUDENT', practiceScope: null, reasonFa, source: { type: 'VET_STUDENT_CASE', id: current.id } }, now);
    }
    await recordAudit(tx, actor, {
      action: 'VET_STUDENT_CASE_DECIDED',
      targetType: CASE_TARGET,
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status, decision: input.decision, submissionVersion: row.currentSubmissionVersion },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: current.accountId,
      kind: 'VET_STUDENT_CASE_DECIDED',
      titleFa: decisionTitle(row.status as VetCaseStatus),
      bodyFa: reasonFa,
      resume: { entity: { type: CASE_TARGET, id: row.id }, step: row.status === 'NEEDS_CORRECTION' ? 'CORRECTION' : 'RESULT', originRoute: '/account/vet-profile' },
    });
    return row;
  });
}

/** The student case the account is following, newest first, with its submissions and history. */
export async function myStudentCase(database: DbClient, actor: Actor) {
  const [row] = await database
    .select()
    .from(vetProfessionalCases)
    .where(and(eq(vetProfessionalCases.accountId, actor.accountId), eq(vetProfessionalCases.caseType, 'STUDENT')))
    .orderBy(desc(vetProfessionalCases.createdAt))
    .limit(1);
  if (!row) return null;
  const [submissions, documents, history] = await Promise.all([
    database.select().from(vetProfessionalSubmissions).where(eq(vetProfessionalSubmissions.caseId, row.id)).orderBy(asc(vetProfessionalSubmissions.version)),
    database.select().from(vetProfessionalDocuments).where(eq(vetProfessionalDocuments.caseId, row.id)).orderBy(asc(vetProfessionalDocuments.submissionVersion)),
    professionalCaseHistory(database, [row.id]),
  ]);
  const latest = submissions.at(-1);
  return {
    id: row.id,
    version: row.version,
    status: row.status as VetCaseStatus,
    statusFa: CASE_STATUS_FA[row.status as VetCaseStatus],
    reviewNoteFa: row.reviewNoteFa,
    fields: (latest?.payload ?? null) as (StudentFields & { hasDocument?: boolean }) | null,
    documents: documents.map((document) => ({ id: document.id, fileId: document.fileId, submissionVersion: document.submissionVersion })),
    history: history[row.id] ?? [],
  };
}
