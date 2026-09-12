/**
 * Veterinarian applications, review and claims — Requirements-Phase-2 §8, §10,
 * §20, §22 (PROMPT-007).
 *
 * An account asks for a directory profile (PROFILE) or to take over an unowned
 * one a reviewer published (CLAIM), with its council code and documents. The
 * review operator approves, asks for a correction or rejects, always with a
 * reason; a rejection may be appealed once. Approval creates or transfers the
 * same `vet_profile` row and records Professional Verification. It never grants
 * TRUSTED_VET (DEC-0145) and a claim transfers future control, not the history
 * the audit trail already holds (§10).
 */
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { storedFiles } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { vetApplicationDocuments, vetApplications, vetProfiles } from '../db/schema/vets.ts';
import { putPrivateFile } from '../files/storage.ts';
import { recordAudit } from '../audit/service.ts';
import { boundedRows } from '../privacy/limits.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page } from '../domain/pagination.ts';
import { normalizeForSearch, unifyPersianLetters } from '../breeds/model.ts';
import { newPublicSlug } from './directory.ts';
import {
  APPLICATION_STATUS_FA,
  MAX_DOCUMENTS,
  canAppeal,
  canResubmit,
  canWithdraw,
  councilCodeProblem,
  decisionOutcome,
  isApplicationKind,
  isDocumentKind,
  isOpenApplication,
  isReviewDecision,
  normalizeCouncilCode,
  type VetApplicationKind,
  type VetApplicationStatus,
  type VetDocumentKind,
} from './onboarding-model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

export type VetApplicationRow = typeof vetApplications.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = 'این درخواست هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const APPLICANT_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
const REVIEWER_CONTEXTS: readonly ActorContextName[] = ['REVIEW_OPERATOR', 'SUPERADMIN'];

function assertApplicant(actor: Actor): void {
  if (!APPLICANT_CONTEXTS.includes(actor.context)) {
    throw forbidden('درخواست دامپزشک از حساب کاربری خودتان ثبت می‌شود، نه از محیط عملیاتی.');
  }
}

function assertReviewer(actor: Actor): void {
  if (!REVIEWER_CONTEXTS.includes(actor.context)) {
    throw forbidden('بررسی درخواست‌ها و پروفایل‌های بدون مالک فقط در محیط اپراتور بررسی ممکن است.');
  }
}

const text = (value: string | null | undefined): string | null => {
  const out = unifyPersianLetters((value ?? '').trim()).replace(/[ \t]+/g, ' ');
  return out === '' ? null : out;
};

function bounded(value: string | null | undefined, max: number, labelFa: string): string | null {
  const out = text(value);
  if (out !== null && out.length > max) throw validation(labelFa + ' حداکثر ' + max.toLocaleString('fa-IR') + ' نویسه است.');
  return out;
}

function required(value: string | null | undefined, max: number, labelFa: string): string {
  const out = bounded(value, max, labelFa);
  if (out === null) throw validation(labelFa + ' را بنویسید.');
  return out;
}

/** A unique index is the last word on duplicates; its violation is a conflict, not a crash. */
function uniqueAsConflict(error: unknown): unknown {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === '23505' ? conflict('درخواست یا پروفایل دیگری با همین مشخصات هم‌زمان ثبت شد؛ صفحه را دوباره باز کنید.') : error;
}

// ── Applicant ────────────────────────────────────────────────────────────

export interface ApplicationDocumentInput {
  readonly kind: string;
  readonly bytes: Uint8Array;
  readonly originalName?: string | null;
}

export interface VetApplicationFields {
  readonly displayNameFa: string;
  readonly councilCode: string;
  readonly phone?: string | null;
  readonly cityId?: string | null;
  readonly statementFa?: string | null;
}

export interface VetApplicationInput extends VetApplicationFields {
  readonly kind: string;
  /** CLAIM only: the public address of the unowned profile. */
  readonly claimSlug?: string | null;
  readonly documents: readonly ApplicationDocumentInput[];
}

function validFields(input: VetApplicationFields) {
  const councilCode = normalizeCouncilCode(input.councilCode ?? '');
  const problem = councilCodeProblem(councilCode);
  if (problem) throw validation(problem);
  const cityId = text(input.cityId);
  if (cityId !== null && !UUID.test(cityId)) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
  return {
    displayNameFa: required(input.displayNameFa, 120, 'نام و نام خانوادگی دامپزشک'),
    councilCode,
    phone: bounded(input.phone, 20, 'تلفن'),
    cityId,
    statementFa: bounded(input.statementFa, 2000, 'توضیح'),
  };
}

function validDocuments(documents: readonly ApplicationDocumentInput[], alreadyAttached: readonly VetDocumentKind[]): void {
  if (alreadyAttached.length + documents.length > MAX_DOCUMENTS) {
    throw validation('حداکثر ' + MAX_DOCUMENTS.toLocaleString('fa-IR') + ' مدرک پیوست می‌شود.');
  }
  for (const document of documents) if (!isDocumentKind(document.kind)) throw validation('نوع مدرک معتبر نیست.');
  const kinds = [...alreadyAttached, ...documents.map((d) => d.kind)];
  if (!kinds.includes('COUNCIL_CARD')) throw validation('تصویر کارت نظام دامپزشکی را پیوست کنید.');
}

async function assertCity(tx: DbClient, cityId: string | null): Promise<void> {
  if (cityId === null) return;
  const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId)).limit(1);
  if (!city) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');
}

/** A published, unowned profile — the only kind a claim may target. */
async function claimTarget(tx: DbClient, slug: string | null | undefined) {
  const [target] = /^vet-[0-9a-f]{10}$/.test(slug ?? '')
    ? await tx
        .select()
        .from(vetProfiles)
        .where(and(eq(vetProfiles.publicSlug, slug!), isNull(vetProfiles.accountId), eq(vetProfiles.publicStatus, 'PUBLISHED')))
        .limit(1)
    : [];
  if (!target) throw notFound('پروفایل بدون مالکی با این نشانی پیدا نشد.');
  return target;
}

/**
 * The duplicate states of §22: an open application, a profile the account
 * already owns, a council code another profile holds, a claim already in review.
 */
async function assertNotDuplicate(
  tx: DbClient,
  input: { accountId: string; kind: VetApplicationKind; councilCode: string; targetProfileId: string | null; applicationId?: string },
): Promise<void> {
  const open = await tx
    .select({ id: vetApplications.id, kind: vetApplications.kind, accountId: vetApplications.accountId, vetProfileId: vetApplications.vetProfileId })
    .from(vetApplications)
    .where(inArray(vetApplications.status, ['SUBMITTED', 'NEEDS_CORRECTION']));
  if (open.some((row) => row.accountId === input.accountId && row.id !== input.applicationId)) {
    throw conflict('درخواست دیگری از شما در حال بررسی است؛ همان را پیگیری یا اصلاح کنید.');
  }
  if (
    input.kind === 'CLAIM' &&
    open.some((row) => row.kind === 'CLAIM' && row.vetProfileId === input.targetProfileId && row.id !== input.applicationId)
  ) {
    throw conflict('درخواست Claim دیگری برای این پروفایل در حال بررسی است.');
  }

  const [owned] = await tx.select({ id: vetProfiles.id }).from(vetProfiles).where(eq(vetProfiles.accountId, input.accountId)).limit(1);
  if (owned) throw conflict('این حساب همین حالا پروفایل دامپزشک دارد.');

  const [holder] = await tx
    .select({ id: vetProfiles.id, accountId: vetProfiles.accountId, publicSlug: vetProfiles.publicSlug, publicStatus: vetProfiles.publicStatus })
    .from(vetProfiles)
    .where(eq(vetProfiles.councilCode, input.councilCode))
    .limit(1);
  if (holder && holder.id !== input.targetProfileId) {
    if (holder.accountId === null && holder.publicStatus === 'PUBLISHED') {
      throw conflict('این کد نظام متعلق به یک پروفایل بدون مالک است؛ به‌جای ساخت پروفایل تازه، همان را Claim کنید.', {
        claimSlug: holder.publicSlug,
      });
    }
    throw conflict('این کد نظام دامپزشکی قبلاً برای پروفایل دیگری ثبت شده است.');
  }
}

async function attachDocuments(
  tx: DbClient,
  storageRoot: string,
  actor: Actor,
  applicationId: string,
  documents: readonly ApplicationDocumentInput[],
): Promise<void> {
  for (const document of documents) {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'VET_APPLICATION_DOCUMENT',
      bytes: document.bytes,
      originalName: document.originalName ?? null,
    });
    await tx.insert(vetApplicationDocuments).values({ applicationId, fileId: stored.id, kind: document.kind as VetDocumentKind });
  }
}

export async function submitVetApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: VetApplicationInput,
  now: Date = new Date(),
): Promise<VetApplicationRow> {
  assertApplicant(actor);
  if (!isApplicationKind(input.kind)) throw validation('نوع درخواست معتبر نیست.');
  const kind = input.kind;
  const fields = validFields(input);
  validDocuments(input.documents, []);

  try {
    return await database.transaction(async (tx) => {
      const target = kind === 'CLAIM' ? await claimTarget(tx, input.claimSlug) : null;
      if (target?.councilCode && target.councilCode !== fields.councilCode) {
        throw validation('کد نظام واردشده با کد ثبت‌شده برای این پروفایل نمی‌خواند.');
      }
      await assertCity(tx, fields.cityId);
      await assertNotDuplicate(tx, { accountId: actor.accountId, kind, councilCode: fields.councilCode, targetProfileId: target?.id ?? null });

      const [row] = await tx
        .insert(vetApplications)
        .values({ accountId: actor.accountId, kind, vetProfileId: target?.id ?? null, ...fields, submittedAt: now })
        .returning();
      await attachDocuments(tx, storageRoot, actor, row!.id, input.documents);
      await recordAudit(tx, actor, {
        action: 'VET_APPLICATION_SUBMITTED',
        targetType: 'VET_APPLICATION',
        targetId: row!.id,
        targetVersion: row!.version,
        after: { kind, vetProfileId: row!.vetProfileId, councilCode: row!.councilCode, documents: input.documents.length },
      });
      return row!;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

async function ownApplication(tx: DbClient, actor: Actor, applicationId: string, expectedVersion: number) {
  const [row] = UUID.test(applicationId)
    ? await tx.select().from(vetApplications).where(eq(vetApplications.id, applicationId)).limit(1)
    : [];
  // Someone else's application is not found, not forbidden: its existence is not disclosed.
  if (!row || row.accountId !== actor.accountId) throw notFound('درخواست پیدا نشد.');
  if (row.version !== expectedVersion) throw conflict(STALE);
  return row;
}

async function kindsAttached(tx: DbClient, applicationId: string): Promise<VetDocumentKind[]> {
  const rows = await tx
    .select({ kind: vetApplicationDocuments.kind })
    .from(vetApplicationDocuments)
    .where(eq(vetApplicationDocuments.applicationId, applicationId));
  return rows.map((row) => row.kind);
}

function changed(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

/** Answers a correction request: the fields may change, documents may be added, and it goes back to review. */
export async function resubmitVetApplication(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: VetApplicationFields & { applicationId: string; expectedVersion: number; documents: readonly ApplicationDocumentInput[] },
  now: Date = new Date(),
): Promise<VetApplicationRow> {
  assertApplicant(actor);
  const fields = validFields(input);
  try {
    return await database.transaction(async (tx) => {
      const current = await ownApplication(tx, actor, input.applicationId, input.expectedVersion);
      if (!canResubmit(current.status)) throw conflict('فقط درخواستی که اصلاحش خواسته شده دوباره ارسال می‌شود.');
      validDocuments(input.documents, await kindsAttached(tx, current.id));
      if (current.kind === 'CLAIM') {
        const [target] = await tx.select().from(vetProfiles).where(eq(vetProfiles.id, current.vetProfileId!)).limit(1);
        if (!target || target.accountId !== null) throw conflict('این پروفایل دیگر بدون مالک نیست.');
        if (target.councilCode && target.councilCode !== fields.councilCode) {
          throw validation('کد نظام واردشده با کد ثبت‌شده برای این پروفایل نمی‌خواند.');
        }
      }
      await assertCity(tx, fields.cityId);
      await assertNotDuplicate(tx, {
        accountId: actor.accountId,
        kind: current.kind,
        councilCode: fields.councilCode,
        targetProfileId: current.kind === 'CLAIM' ? current.vetProfileId : null,
        applicationId: current.id,
      });

      const [row] = await tx
        .update(vetApplications)
        .set({ ...fields, status: 'SUBMITTED', submittedAt: now, version: current.version + 1, updatedAt: now })
        .where(and(eq(vetApplications.id, current.id), eq(vetApplications.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      await attachDocuments(tx, storageRoot, actor, row.id, input.documents);
      const diff = changed(
        { ...pick(current), status: current.status },
        { ...pick(row), status: row.status },
      );
      await recordAudit(tx, actor, {
        action: 'VET_APPLICATION_RESUBMITTED',
        targetType: 'VET_APPLICATION',
        targetId: row.id,
        targetVersion: row.version,
        before: diff.before,
        after: { ...diff.after, documentsAdded: input.documents.length },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

const pick = (row: VetApplicationRow) => ({
  displayNameFa: row.displayNameFa,
  councilCode: row.councilCode,
  phone: row.phone,
  cityId: row.cityId,
  statementFa: row.statementFa,
});

/** An open application the applicant no longer wants: kept, archived as withdrawn. */
export async function withdrawVetApplication(
  database: Database,
  actor: Actor,
  input: { applicationId: string; expectedVersion: number },
): Promise<VetApplicationRow> {
  assertApplicant(actor);
  return database.transaction(async (tx) => {
    const current = await ownApplication(tx, actor, input.applicationId, input.expectedVersion);
    if (!canWithdraw(current.status)) throw conflict('این درخواست دیگر باز نیست.');
    const [row] = await tx
      .update(vetApplications)
      .set({ status: 'WITHDRAWN', version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(vetApplications.id, current.id), eq(vetApplications.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'VET_APPLICATION_WITHDRAWN',
      targetType: 'VET_APPLICATION',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status },
    });
    return row;
  });
}

/** One appeal after a rejection: the same application goes back to review with the applicant's reason (§8). */
export async function appealVetApplication(
  database: Database,
  actor: Actor,
  input: { applicationId: string; expectedVersion: number; appealFa: string },
  now: Date = new Date(),
): Promise<VetApplicationRow> {
  assertApplicant(actor);
  const appealFa = required(input.appealFa, 2000, 'دلیل تجدیدنظر');
  try {
    return await database.transaction(async (tx) => {
      const current = await ownApplication(tx, actor, input.applicationId, input.expectedVersion);
      if (!canAppeal(current)) {
        throw conflict(current.appealedAt ? 'برای هر درخواست فقط یک‌بار تجدیدنظر ممکن است.' : 'فقط درخواست ردشده تجدیدنظر دارد.');
      }
      if (current.kind === 'CLAIM') {
        const [target] = await tx.select().from(vetProfiles).where(eq(vetProfiles.id, current.vetProfileId!)).limit(1);
        if (!target || target.accountId !== null) throw conflict('این پروفایل دیگر بدون مالک نیست.');
      }
      await assertNotDuplicate(tx, {
        accountId: actor.accountId,
        kind: current.kind,
        councilCode: current.councilCode,
        targetProfileId: current.kind === 'CLAIM' ? current.vetProfileId : null,
        applicationId: current.id,
      });
      const [row] = await tx
        .update(vetApplications)
        .set({ status: 'SUBMITTED', appealFa, appealedAt: now, submittedAt: now, version: current.version + 1, updatedAt: now })
        .where(and(eq(vetApplications.id, current.id), eq(vetApplications.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      await recordAudit(tx, actor, {
        action: 'VET_APPLICATION_APPEALED',
        targetType: 'VET_APPLICATION',
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status },
        after: { status: row.status },
        reason: appealFa,
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

export async function myVetApplications(database: DbClient, actor: Actor) {
  const rows = await database
    .select({ application: vetApplications, cityNameFa: cities.nameFa })
    .from(vetApplications)
    .leftJoin(cities, eq(cities.id, vetApplications.cityId))
    .where(eq(vetApplications.accountId, actor.accountId))
    .orderBy(desc(vetApplications.createdAt));
  const documents = rows.length
    ? await database
        .select({ applicationId: vetApplicationDocuments.applicationId, fileId: vetApplicationDocuments.fileId, kind: vetApplicationDocuments.kind, originalName: storedFiles.originalName })
        .from(vetApplicationDocuments)
        .innerJoin(storedFiles, eq(storedFiles.id, vetApplicationDocuments.fileId))
        .where(inArray(vetApplicationDocuments.applicationId, rows.map((r) => r.application.id)))
    : [];
  return rows.map((row) => ({
    ...row.application,
    cityNameFa: row.cityNameFa,
    documents: documents.filter((d) => d.applicationId === row.application.id),
  }));
}

/** The unowned profile a claim page is about, or null when the address is not claimable. */
export async function claimableProfile(database: DbClient, slug: string) {
  if (!/^vet-[0-9a-f]{10}$/.test(slug)) return null;
  const [row] = await database
    .select({ id: vetProfiles.id, slug: vetProfiles.publicSlug, displayNameFa: vetProfiles.displayNameFa, councilCode: vetProfiles.councilCode, cityNameFa: cities.nameFa })
    .from(vetProfiles)
    .leftJoin(cities, eq(cities.id, vetProfiles.listedCityId))
    .where(and(eq(vetProfiles.publicSlug, slug), isNull(vetProfiles.accountId), eq(vetProfiles.publicStatus, 'PUBLISHED')))
    .limit(1);
  return row ?? null;
}

// ── Reviewer ─────────────────────────────────────────────────────────────

const QUEUE_STATUSES: Record<'OPEN' | 'CORRECTION' | 'DECIDED', readonly VetApplicationStatus[]> = {
  OPEN: ['SUBMITTED'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
};

export async function vetApplicationQueue(
  database: DbClient,
  actor: Actor,
  query: { view: 'OPEN' | 'CORRECTION' | 'DECIDED'; page: number; pageSize?: number },
) {
  assertReviewer(actor);
  const statuses = [...QUEUE_STATUSES[query.view]];
  // §20: one answer never returns a whole table, however large a page is asked for.
  const request = { page: query.page, pageSize: boundedRows(query.pageSize, 20) };
  const where = inArray(vetApplications.status, statuses);
  const [[total], rows] = await Promise.all([
    database.select({ value: count() }).from(vetApplications).where(where),
    database
      .select({ application: vetApplications, cityNameFa: cities.nameFa, targetNameFa: vetProfiles.displayNameFa })
      .from(vetApplications)
      .leftJoin(cities, eq(cities.id, vetApplications.cityId))
      .leftJoin(vetProfiles, eq(vetProfiles.id, vetApplications.vetProfileId))
      .where(where)
      // The oldest waiting application first; decided ones newest first.
      .orderBy(query.view === 'DECIDED' ? desc(vetApplications.updatedAt) : asc(vetApplications.submittedAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);
  const items = rows.map((row) => ({ ...row.application, cityNameFa: row.cityNameFa, targetNameFa: row.targetNameFa }));
  return pageOf(items, total?.value ?? 0, request);
}

export async function vetApplicationForReview(database: DbClient, actor: Actor, applicationId: string) {
  assertReviewer(actor);
  if (!UUID.test(applicationId)) return null;
  const [row] = await database
    .select({ application: vetApplications, cityNameFa: cities.nameFa, provinceNameFa: provinces.nameFa, firstName: profiles.firstName, lastName: profiles.lastName })
    .from(vetApplications)
    .leftJoin(cities, eq(cities.id, vetApplications.cityId))
    .leftJoin(provinces, eq(provinces.code, cities.provinceCode))
    .leftJoin(profiles, eq(profiles.accountId, vetApplications.accountId))
    .where(eq(vetApplications.id, applicationId))
    .limit(1);
  if (!row) return null;
  const application = row.application;

  const [documents, allProfiles] = await Promise.all([
    database
      .select({ id: vetApplicationDocuments.id, fileId: vetApplicationDocuments.fileId, kind: vetApplicationDocuments.kind, mime: storedFiles.mime, sizeBytes: storedFiles.sizeBytes, originalName: storedFiles.originalName, createdAt: vetApplicationDocuments.createdAt })
      .from(vetApplicationDocuments)
      .innerJoin(storedFiles, eq(storedFiles.id, vetApplicationDocuments.fileId))
      .where(eq(vetApplicationDocuments.applicationId, application.id))
      .orderBy(asc(vetApplicationDocuments.createdAt)),
    database
      .select({ id: vetProfiles.id, accountId: vetProfiles.accountId, displayNameFa: vetProfiles.displayNameFa, councilCode: vetProfiles.councilCode, publicSlug: vetProfiles.publicSlug, publicStatus: vetProfiles.publicStatus })
      .from(vetProfiles),
  ]);

  const name = normalizeForSearch(application.displayNameFa);
  const target = allProfiles.find((p) => p.id === application.vetProfileId) ?? null;
  // ponytail: similar-name scan over every profile; PROMPT-012 search replaces it with an indexed query.
  const candidates = allProfiles.filter(
    (p) => p.id !== application.vetProfileId && (p.councilCode === application.councilCode || normalizeForSearch(p.displayNameFa) === name),
  );
  return {
    application,
    applicantNameFa: row.firstName ? row.firstName + ' ' + (row.lastName ?? '') : null,
    cityNameFa: row.cityNameFa,
    provinceNameFa: row.provinceNameFa,
    documents,
    target: target && application.kind === 'CLAIM' ? target : null,
    candidates,
  };
}

function decisionMessage(status: VetApplicationStatus): string {
  if (status === 'APPROVED') return 'درخواست دامپزشک شما تأیید شد';
  if (status === 'NEEDS_CORRECTION') return 'درخواست دامپزشک شما نیازمند اصلاح است';
  return 'درخواست دامپزشک شما ' + APPLICATION_STATUS_FA[status];
}

export async function decideVetApplication(
  database: Database,
  actor: Actor,
  input: { applicationId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<VetApplicationRow> {
  assertReviewer(actor);
  if (!isReviewDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const decision = input.decision;
  const reasonFa = required(input.reasonFa, 1000, 'دلیل تصمیم');
  if (!UUID.test(input.applicationId)) throw notFound('درخواست پیدا نشد.');

  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx.select().from(vetApplications).where(eq(vetApplications.id, input.applicationId)).limit(1);
      if (!current) throw notFound('درخواست پیدا نشد.');
      if (current.accountId === actor.accountId) throw forbidden('درخواست خودتان را نمی‌توانید بررسی کنید.');
      if (current.version !== input.expectedVersion) throw conflict(STALE);
      const outcome = decisionOutcome(current.status, decision);
      if (outcome === null) throw conflict('این درخواست دیگر در انتظار بررسی نیست.');

      let profileId = current.vetProfileId;
      if (decision === 'APPROVE') {
        // Everything is checked again at the moment of approval, not trusted from submission.
        const [owned] = await tx.select({ id: vetProfiles.id }).from(vetProfiles).where(eq(vetProfiles.accountId, current.accountId)).limit(1);
        if (owned) throw conflict('این حساب در این فاصله پروفایل دامپزشک گرفته است.');
        const [holder] = await tx.select({ id: vetProfiles.id }).from(vetProfiles).where(eq(vetProfiles.councilCode, current.councilCode)).limit(1);

        if (current.kind === 'PROFILE') {
          if (holder) throw conflict('این کد نظام دامپزشکی در این فاصله برای پروفایل دیگری ثبت شده است.');
          const [created] = await tx
            .insert(vetProfiles)
            .values({
              accountId: current.accountId,
              displayNameFa: current.displayNameFa,
              councilCode: current.councilCode,
              councilVerifiedAt: now,
              phone: current.phone,
              listedCityId: current.cityId,
            })
            .returning();
          profileId = created!.id;
          await recordAudit(tx, actor, {
            action: 'VET_PROFILE_CREATED',
            targetType: 'VET_PROFILE',
            targetId: created!.id,
            targetVersion: created!.version,
            after: { accountId: created!.accountId, councilCode: created!.councilCode, councilVerifiedAt: now.toISOString() },
            reason: reasonFa,
            metadata: { applicationId: current.id },
          });
        } else {
          if (holder && holder.id !== current.vetProfileId) throw conflict('این کد نظام دامپزشکی برای پروفایل دیگری ثبت شده است.');
          const [before] = await tx.select().from(vetProfiles).where(eq(vetProfiles.id, current.vetProfileId!)).limit(1);
          // Only while still unowned: two approvals of competing claims cannot both win.
          const [claimed] = await tx
            .update(vetProfiles)
            .set({
              accountId: current.accountId,
              councilCode: current.councilCode,
              councilVerifiedAt: now,
              claimedAt: now,
              phone: before?.phone ?? current.phone,
              version: (before?.version ?? 0) + 1,
              updatedAt: now,
            })
            .where(and(eq(vetProfiles.id, current.vetProfileId!), isNull(vetProfiles.accountId)))
            .returning();
          if (!claimed) throw conflict('این پروفایل پیش‌تر به حساب دیگری منتقل شده است.');
          await recordAudit(tx, actor, {
            action: 'VET_PROFILE_CLAIMED',
            targetType: 'VET_PROFILE',
            targetId: claimed.id,
            targetVersion: claimed.version,
            before: { accountId: null, councilCode: before?.councilCode ?? null, councilVerifiedAt: before?.councilVerifiedAt ?? null },
            after: { accountId: claimed.accountId, councilCode: claimed.councilCode, councilVerifiedAt: now.toISOString() },
            reason: reasonFa,
            metadata: { applicationId: current.id },
          });
        }
      }

      const [row] = await tx
        .update(vetApplications)
        .set({
          status: outcome,
          reviewNoteFa: reasonFa,
          reviewedByAccountId: actor.accountId,
          reviewedAt: now,
          vetProfileId: profileId,
          version: current.version + 1,
          updatedAt: now,
        })
        .where(and(eq(vetApplications.id, current.id), eq(vetApplications.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      await recordAudit(tx, actor, {
        action: 'VET_APPLICATION_DECIDED',
        targetType: 'VET_APPLICATION',
        targetId: row.id,
        targetVersion: row.version,
        before: { status: current.status },
        after: { status: row.status, decision },
        reason: reasonFa,
      });
      await createNotification(tx, {
        recipientAccountId: current.accountId,
        kind: 'VET_APPLICATION_DECIDED',
        titleFa: decisionMessage(row.status),
        bodyFa: reasonFa,
        resume: {
          entity: { type: 'VET_APPLICATION', id: row.id },
          step: row.status === 'NEEDS_CORRECTION' ? 'CORRECTION' : 'RESULT',
          originRoute: '/account/vet-profile',
        },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

export interface UnownedVetInput {
  readonly displayNameFa: string;
  readonly cityId: string;
  readonly contactFa?: string | null;
  readonly sourceFa: string;
  readonly councilCode?: string | null;
  readonly reason: string;
  /** The reviewer has seen the similar profiles and this is a different veterinarian. */
  readonly confirmedNotDuplicate?: boolean;
}

/**
 * A reviewed suggestion published with the «بدون مالک» label (§10, P2-D06).
 * It has no account, no verification and no locations until a claim is approved.
 */
export async function createUnownedVetProfile(database: Database, actor: Actor, input: UnownedVetInput, now: Date = new Date()) {
  assertReviewer(actor);
  const displayNameFa = required(input.displayNameFa, 120, 'نام دامپزشک');
  const sourceFa = required(input.sourceFa, 300, 'منبع اطلاعات');
  const listedContactFa = bounded(input.contactFa, 300, 'تماس یا نشانی عمومی');
  const reason = required(input.reason, 500, 'دلیل');
  const rawCode = normalizeCouncilCode(input.councilCode ?? '');
  const councilCode = rawCode === '' ? null : rawCode;
  if (councilCode !== null) {
    const problem = councilCodeProblem(councilCode);
    if (problem) throw validation(problem);
  }
  const cityId = text(input.cityId);
  if (cityId === null) throw validation('شهر را انتخاب کنید.');
  if (!UUID.test(cityId)) throw validation('شهر انتخاب‌شده در فهرست شهرها نیست.');

  try {
    return await database.transaction(async (tx) => {
      await assertCity(tx, cityId);
      if (councilCode !== null) {
        const [holder] = await tx.select({ id: vetProfiles.id }).from(vetProfiles).where(eq(vetProfiles.councilCode, councilCode)).limit(1);
        if (holder) throw conflict('این کد نظام دامپزشکی قبلاً برای پروفایل دیگری ثبت شده است.');
      }
      const name = normalizeForSearch(displayNameFa);
      const similar = (await tx.select({ displayNameFa: vetProfiles.displayNameFa }).from(vetProfiles)).filter(
        (row) => normalizeForSearch(row.displayNameFa) === name,
      );
      if (similar.length > 0 && input.confirmedNotDuplicate !== true) {
        throw conflict('پروفایل مشابهی با همین نام وجود دارد؛ اگر دامپزشک دیگری است، تأیید «تکراری نیست» را بزنید.', {
          similar: similar.length,
        });
      }
      const [row] = await tx
        .insert(vetProfiles)
        .values({
          accountId: null,
          displayNameFa,
          councilCode,
          listedCityId: cityId,
          listedContactFa,
          sourceFa,
          publicStatus: 'PUBLISHED',
          publicSlug: newPublicSlug(),
          publicPublishedAt: now,
        })
        .returning();
      await recordAudit(tx, actor, {
        action: 'VET_PROFILE_UNOWNED_PUBLISHED',
        targetType: 'VET_PROFILE',
        targetId: row!.id,
        targetVersion: row!.version,
        after: { displayNameFa, listedCityId: cityId, councilCode, sourceFa, publicSlug: row!.publicSlug },
        reason,
      });
      return row!;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

export async function unownedVetProfiles(database: DbClient, actor: Actor) {
  assertReviewer(actor);
  const [rows, openClaims] = await Promise.all([
    database
      .select({ profile: vetProfiles, cityNameFa: cities.nameFa })
      .from(vetProfiles)
      .leftJoin(cities, eq(cities.id, vetProfiles.listedCityId))
      .where(isNull(vetProfiles.accountId))
      .orderBy(desc(vetProfiles.createdAt)),
    database
      .select({ vetProfileId: vetApplications.vetProfileId })
      .from(vetApplications)
      .where(and(eq(vetApplications.kind, 'CLAIM'), inArray(vetApplications.status, ['SUBMITTED', 'NEEDS_CORRECTION']))),
  ]);
  const claimed = new Set(openClaims.map((row) => row.vetProfileId));
  return rows.map((row) => ({ ...row.profile, cityNameFa: row.cityNameFa, claimInReview: claimed.has(row.profile.id) }));
}

export { isOpenApplication };
