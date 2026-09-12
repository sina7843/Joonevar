/**
 * Centre claims — Requirements-Phase-2 §9, §10, §20, §22 (PROMPT-009).
 *
 * A representative of a centre asks for its management with documents that show
 * they may speak for it. A reviewer approves, asks for a correction or rejects,
 * always with a reason; a rejection may be appealed once. Approval moves who
 * may edit the centre from now on — it never rewrites the history the audit
 * trail already holds (§10, DEC-0166, DEC-0169).
 */
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { profiles } from '../db/schema/identity.ts';
import { storedFiles } from '../db/schema/core.ts';
import { cities } from '../db/schema/geography.ts';
import { centreClaimDocuments, centreClaims, centres } from '../db/schema/vets.ts';
import { putPrivateFile } from '../files/storage.ts';
import { recordAudit } from '../audit/service.ts';
import { boundedRows } from '../privacy/limits.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf } from '../domain/pagination.ts';
import { unifyPersianLetters } from '../breeds/model.ts';
import { canAppeal, decisionOutcome, isReviewDecision, type VetApplicationStatus } from '../vets/onboarding-model.ts';
import { claimProblem, isClaimDocumentKind, MAX_CLAIM_DOCUMENTS, type ClaimDocumentKind } from '../suggestions/model.ts';
import type { Actor, ActorContextName } from '../authz/actor.ts';

export type CentreClaimRow = typeof centreClaims.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^centre-[0-9a-f]{10}$/;
const STALE = 'این درخواست هم‌زمان تغییر کرده است؛ صفحه را دوباره باز کنید.';
const CLAIMANT_CONTEXTS: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];
const REVIEWER_CONTEXTS: readonly ActorContextName[] = ['REVIEW_OPERATOR', 'SUPERADMIN'];
const OPEN: readonly VetApplicationStatus[] = ['SUBMITTED', 'NEEDS_CORRECTION'];

function assertClaimant(actor: Actor): void {
  if (!CLAIMANT_CONTEXTS.includes(actor.context)) {
    throw forbidden('درخواست مدیریت مرکز از حساب کاربری خودتان ثبت می‌شود، نه از محیط عملیاتی.');
  }
}

function assertReviewer(actor: Actor): void {
  if (!REVIEWER_CONTEXTS.includes(actor.context)) {
    throw forbidden('بررسی درخواست‌های مدیریت مرکز فقط در محیط اپراتور بررسی ممکن است.');
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

function reasonOf(reason: string | null | undefined): string {
  const out = bounded(reason, 1000, 'دلیل');
  if (out === null) throw validation('دلیل این تصمیم را بنویسید.');
  return out;
}

function uniqueAsConflict(error: unknown): unknown {
  const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === '23505'
    ? conflict('درخواست دیگری برای این مرکز یا از این حساب هم‌زمان ثبت شد؛ صفحه را دوباره باز کنید.')
    : error;
}

export interface ClaimDocumentInput {
  readonly kind: string;
  readonly bytes: Uint8Array;
  readonly originalName?: string | null;
}

export interface CentreClaimInput {
  readonly claimSlug: string;
  readonly claimantNameFa: string;
  readonly roleFa: string;
  readonly phone?: string | null;
  readonly statementFa?: string | null;
  readonly documents: readonly ClaimDocumentInput[];
}

/** The unowned, published centre a claim page is about, or null. */
export async function claimableCentre(database: DbClient, slug: string) {
  if (!SLUG.test(slug)) return null;
  const [row] = await database
    .select({ id: centres.id, slug: centres.publicSlug, displayNameFa: centres.displayNameFa, cityNameFa: cities.nameFa })
    .from(centres)
    .leftJoin(cities, eq(cities.id, centres.listedCityId))
    .where(and(eq(centres.publicSlug, slug), isNull(centres.ownerAccountId), eq(centres.publicStatus, 'PUBLISHED')))
    .limit(1);
  return row ?? null;
}

function validFields(input: { claimantNameFa: string; roleFa: string; phone?: string | null; statementFa?: string | null }, documents: number) {
  const fields = {
    claimantNameFa: bounded(input.claimantNameFa, 120, 'نام نماینده'),
    roleFa: bounded(input.roleFa, 120, 'سمت'),
    phone: bounded(input.phone, 20, 'تلفن'),
    statementFa: bounded(input.statementFa, 2000, 'توضیح'),
  };
  const problem = claimProblem({ claimantNameFa: fields.claimantNameFa, roleFa: fields.roleFa, documents });
  if (problem) throw validation(problem);
  return { claimantNameFa: fields.claimantNameFa!, roleFa: fields.roleFa!, phone: fields.phone, statementFa: fields.statementFa };
}

async function attachDocuments(
  tx: DbClient,
  storageRoot: string,
  actor: Actor,
  claimId: string,
  documents: readonly ClaimDocumentInput[],
): Promise<void> {
  for (const document of documents) {
    if (!isClaimDocumentKind(document.kind)) throw validation('نوع مدرک معتبر نیست.');
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'CENTRE_CLAIM_DOCUMENT',
      bytes: document.bytes,
      originalName: document.originalName ?? null,
    });
    await tx.insert(centreClaimDocuments).values({ claimId, fileId: stored.id, kind: document.kind as ClaimDocumentKind });
  }
}

export async function submitCentreClaim(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: CentreClaimInput,
  now: Date = new Date(),
): Promise<CentreClaimRow> {
  assertClaimant(actor);
  const fields = validFields(input, input.documents.length);

  try {
    return await database.transaction(async (tx) => {
      const centre = await claimableCentre(tx, input.claimSlug ?? '');
      if (!centre) throw notFound('مرکز بدون مالکی با این نشانی پیدا نشد.');
      const openClaims = await tx
        .select({ id: centreClaims.id, centreId: centreClaims.centreId, accountId: centreClaims.accountId })
        .from(centreClaims)
        .where(inArray(centreClaims.status, [...OPEN]));
      if (openClaims.some((row) => row.accountId === actor.accountId)) {
        throw conflict('درخواست دیگری از شما در حال بررسی است؛ همان را پیگیری یا اصلاح کنید.');
      }
      if (openClaims.some((row) => row.centreId === centre.id)) {
        throw conflict('درخواست مدیریت دیگری برای این مرکز در حال بررسی است.');
      }

      const [row] = await tx
        .insert(centreClaims)
        .values({ centreId: centre.id, accountId: actor.accountId, ...fields, submittedAt: now })
        .returning();
      await attachDocuments(tx, storageRoot, actor, row!.id, input.documents);
      await recordAudit(tx, actor, {
        action: 'CENTRE_CLAIM_SUBMITTED',
        targetType: 'CENTRE_CLAIM',
        targetId: row!.id,
        targetVersion: row!.version,
        after: { centreId: centre.id, roleFa: fields.roleFa, documents: input.documents.length },
      });
      return row!;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

async function ownClaim(tx: DbClient, actor: Actor, claimId: string, expectedVersion: number): Promise<CentreClaimRow> {
  const [row] = UUID.test(claimId) ? await tx.select().from(centreClaims).where(eq(centreClaims.id, claimId)).limit(1) : [];
  if (!row || row.accountId !== actor.accountId) throw notFound('درخواست پیدا نشد.');
  if (row.version !== expectedVersion) throw conflict(STALE);
  return row;
}

export async function resubmitCentreClaim(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: { claimId: string; expectedVersion: number; claimantNameFa: string; roleFa: string; phone?: string | null; statementFa?: string | null; documents: readonly ClaimDocumentInput[] },
  now: Date = new Date(),
): Promise<CentreClaimRow> {
  assertClaimant(actor);

  try {
    return await database.transaction(async (tx) => {
      const current = await ownClaim(tx, actor, input.claimId, input.expectedVersion);
      if (current.status !== 'NEEDS_CORRECTION') throw conflict('فقط درخواستی که اصلاحش خواسته شده دوباره ارسال می‌شود.');
      const [attached] = await tx
        .select({ value: count() })
        .from(centreClaimDocuments)
        .where(eq(centreClaimDocuments.claimId, current.id));
      const already = Number(attached?.value ?? 0);
      const fields = validFields(input, already + input.documents.length);
      if (already + input.documents.length > MAX_CLAIM_DOCUMENTS) {
        throw validation('حداکثر ' + MAX_CLAIM_DOCUMENTS.toLocaleString('fa-IR') + ' مدرک پیوست می‌شود.');
      }
      const [centre] = await tx.select().from(centres).where(eq(centres.id, current.centreId)).limit(1);
      if (!centre || centre.ownerAccountId !== null) throw conflict('این مرکز دیگر بدون مالک نیست.');

      const [row] = await tx
        .update(centreClaims)
        .set({ ...fields, status: 'SUBMITTED', submittedAt: now, version: current.version + 1, updatedAt: now })
        .where(and(eq(centreClaims.id, current.id), eq(centreClaims.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      await attachDocuments(tx, storageRoot, actor, row.id, input.documents);
      await recordAudit(tx, actor, {
        action: 'CENTRE_CLAIM_RESUBMITTED',
        targetType: 'CENTRE_CLAIM',
        targetId: row.id,
        targetVersion: row.version,
        before: { claimantNameFa: current.claimantNameFa, roleFa: current.roleFa, status: current.status },
        after: { claimantNameFa: row.claimantNameFa, roleFa: row.roleFa, status: row.status, documentsAdded: input.documents.length },
      });
      return row;
    });
  } catch (error) {
    throw uniqueAsConflict(error);
  }
}

export async function withdrawCentreClaim(
  database: Database,
  actor: Actor,
  input: { claimId: string; expectedVersion: number },
): Promise<CentreClaimRow> {
  assertClaimant(actor);
  return database.transaction(async (tx) => {
    const current = await ownClaim(tx, actor, input.claimId, input.expectedVersion);
    if (!OPEN.includes(current.status)) throw conflict('این درخواست دیگر باز نیست.');
    const [row] = await tx
      .update(centreClaims)
      .set({ status: 'WITHDRAWN', version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(centreClaims.id, current.id), eq(centreClaims.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CENTRE_CLAIM_WITHDRAWN',
      targetType: 'CENTRE_CLAIM',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status },
    });
    return row;
  });
}

/** One appeal after a rejection, with the claimant's own reason (§8 pattern). */
export async function appealCentreClaim(
  database: Database,
  actor: Actor,
  input: { claimId: string; expectedVersion: number; appealFa: string },
  now: Date = new Date(),
): Promise<CentreClaimRow> {
  assertClaimant(actor);
  const appealFa = bounded(input.appealFa, 2000, 'دلیل تجدیدنظر');
  if (appealFa === null) throw validation('دلیل تجدیدنظر را بنویسید.');

  try {
    return await database.transaction(async (tx) => {
      const current = await ownClaim(tx, actor, input.claimId, input.expectedVersion);
      if (!canAppeal(current)) {
        throw conflict(current.appealedAt ? 'برای هر درخواست فقط یک‌بار تجدیدنظر ممکن است.' : 'فقط درخواست ردشده تجدیدنظر دارد.');
      }
      const [centre] = await tx.select().from(centres).where(eq(centres.id, current.centreId)).limit(1);
      if (!centre || centre.ownerAccountId !== null) throw conflict('این مرکز دیگر بدون مالک نیست.');
      const [row] = await tx
        .update(centreClaims)
        .set({ status: 'SUBMITTED', appealFa, appealedAt: now, submittedAt: now, version: current.version + 1, updatedAt: now })
        .where(and(eq(centreClaims.id, current.id), eq(centreClaims.version, current.version)))
        .returning();
      if (!row) throw conflict(STALE);
      await recordAudit(tx, actor, {
        action: 'CENTRE_CLAIM_APPEALED',
        targetType: 'CENTRE_CLAIM',
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

export async function myCentreClaims(database: DbClient, actor: Actor) {
  const rows = await database
    .select({ claim: centreClaims, centreNameFa: centres.displayNameFa, centreSlug: centres.publicSlug })
    .from(centreClaims)
    .innerJoin(centres, eq(centres.id, centreClaims.centreId))
    .where(eq(centreClaims.accountId, actor.accountId))
    .orderBy(desc(centreClaims.createdAt));
  const documents = rows.length
    ? await database
        .select({ claimId: centreClaimDocuments.claimId, fileId: centreClaimDocuments.fileId, kind: centreClaimDocuments.kind })
        .from(centreClaimDocuments)
        .where(inArray(centreClaimDocuments.claimId, rows.map((row) => row.claim.id)))
    : [];
  return rows.map((row) => ({
    ...row.claim,
    centreNameFa: row.centreNameFa,
    centreSlug: row.centreSlug,
    documents: documents.filter((document) => document.claimId === row.claim.id),
  }));
}

// ── Reviewer ─────────────────────────────────────────────────────────────

const QUEUE_STATUSES: Record<'OPEN' | 'CORRECTION' | 'DECIDED', readonly VetApplicationStatus[]> = {
  OPEN: ['SUBMITTED'],
  CORRECTION: ['NEEDS_CORRECTION'],
  DECIDED: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
};

export async function centreClaimQueue(
  database: DbClient,
  actor: Actor,
  query: { view: 'OPEN' | 'CORRECTION' | 'DECIDED'; page: number; pageSize?: number },
) {
  assertReviewer(actor);
  // §20: one answer never returns a whole table, however large a page is asked for.
  const request = { page: query.page, pageSize: boundedRows(query.pageSize, 20) };
  const where = inArray(centreClaims.status, [...QUEUE_STATUSES[query.view]]);
  const [[total], rows] = await Promise.all([
    database.select({ value: count() }).from(centreClaims).where(where),
    database
      .select({ claim: centreClaims, centreNameFa: centres.displayNameFa })
      .from(centreClaims)
      .innerJoin(centres, eq(centres.id, centreClaims.centreId))
      .where(where)
      .orderBy(query.view === 'DECIDED' ? desc(centreClaims.updatedAt) : asc(centreClaims.submittedAt))
      .limit(request.pageSize)
      .offset(offsetOf(request)),
  ]);
  return pageOf(
    rows.map((row) => ({ ...row.claim, centreNameFa: row.centreNameFa })),
    total?.value ?? 0,
    request,
  );
}

export async function centreClaimForReview(database: DbClient, actor: Actor, claimId: string) {
  assertReviewer(actor);
  if (!UUID.test(claimId)) return null;
  const [row] = await database
    .select({
      claim: centreClaims,
      centreNameFa: centres.displayNameFa,
      centreSlug: centres.publicSlug,
      centreOwner: centres.ownerAccountId,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
    })
    .from(centreClaims)
    .innerJoin(centres, eq(centres.id, centreClaims.centreId))
    .leftJoin(profiles, eq(profiles.accountId, centreClaims.accountId))
    .where(eq(centreClaims.id, claimId))
    .limit(1);
  if (!row) return null;
  const documents = await database
    .select({
      id: centreClaimDocuments.id,
      fileId: centreClaimDocuments.fileId,
      kind: centreClaimDocuments.kind,
      mime: storedFiles.mime,
      originalName: storedFiles.originalName,
    })
    .from(centreClaimDocuments)
    .innerJoin(storedFiles, eq(storedFiles.id, centreClaimDocuments.fileId))
    .where(eq(centreClaimDocuments.claimId, row.claim.id))
    .orderBy(asc(centreClaimDocuments.createdAt));
  return {
    claim: row.claim,
    centreNameFa: row.centreNameFa,
    centreSlug: row.centreSlug,
    centreOwned: row.centreOwner !== null,
    // The account's own identity record, so the reviewer can compare it with the documents.
    accountNameFa: row.firstName ? row.firstName + ' ' + (row.lastName ?? '') : null,
    documents,
  };
}

/**
 * Approval hands the centre's future editing to the claimant. It is written
 * only while the centre is still unowned, so two approvals cannot both win, and
 * nothing already recorded about the centre changes.
 */
export async function decideCentreClaim(
  database: Database,
  actor: Actor,
  input: { claimId: string; expectedVersion: number; decision: string; reasonFa: string },
  now: Date = new Date(),
): Promise<CentreClaimRow> {
  assertReviewer(actor);
  if (!isReviewDecision(input.decision)) throw validation('تصمیم انتخاب‌شده معتبر نیست.');
  const decision = input.decision;
  const reasonFa = reasonOf(input.reasonFa);
  if (!UUID.test(input.claimId)) throw notFound('درخواست پیدا نشد.');

  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(centreClaims).where(eq(centreClaims.id, input.claimId)).limit(1);
    if (!current) throw notFound('درخواست پیدا نشد.');
    if (current.accountId === actor.accountId) throw forbidden('درخواست خودتان را نمی‌توانید بررسی کنید.');
    if (current.version !== input.expectedVersion) throw conflict(STALE);
    const outcome = decisionOutcome(current.status, decision);
    if (outcome === null) throw conflict('این درخواست دیگر در انتظار بررسی نیست.');

    if (decision === 'APPROVE') {
      const [before] = await tx.select().from(centres).where(eq(centres.id, current.centreId)).limit(1);
      if (!before) throw notFound('مرکز پیدا نشد.');
      const [claimed] = await tx
        .update(centres)
        .set({ ownerAccountId: current.accountId, claimedAt: now, version: before.version + 1, updatedAt: now })
        .where(and(eq(centres.id, current.centreId), isNull(centres.ownerAccountId)))
        .returning();
      if (!claimed) throw conflict('این مرکز پیش‌تر به حساب دیگری سپرده شده است.');
      await recordAudit(tx, actor, {
        action: 'CENTRE_CLAIMED',
        targetType: 'CENTRE',
        targetId: claimed.id,
        targetVersion: claimed.version,
        before: { ownerAccountId: null, claimedAt: null },
        after: { ownerAccountId: claimed.ownerAccountId, claimedAt: now.toISOString() },
        reason: reasonFa,
        metadata: { claimId: current.id },
      });
    }

    const [row] = await tx
      .update(centreClaims)
      .set({
        status: outcome,
        reviewNoteFa: reasonFa,
        reviewedByAccountId: actor.accountId,
        reviewedAt: now,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(centreClaims.id, current.id), eq(centreClaims.version, current.version)))
      .returning();
    if (!row) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'CENTRE_CLAIM_DECIDED',
      targetType: 'CENTRE_CLAIM',
      targetId: row.id,
      targetVersion: row.version,
      before: { status: current.status },
      after: { status: row.status, decision },
      reason: reasonFa,
    });
    const [centre] = await tx.select({ nameFa: centres.displayNameFa }).from(centres).where(eq(centres.id, current.centreId)).limit(1);
    await createNotification(tx, {
      recipientAccountId: current.accountId,
      kind: 'CENTRE_CLAIM_DECIDED',
      titleFa:
        row.status === 'APPROVED'
          ? 'مدیریت مرکز ' + (centre?.nameFa ?? '') + ' به شما سپرده شد'
          : row.status === 'NEEDS_CORRECTION'
            ? 'درخواست مدیریت مرکز نیازمند اصلاح است'
            : 'درخواست مدیریت مرکز پذیرفته نشد',
      bodyFa: reasonFa,
      resume: {
        entity: { type: 'CENTRE_CLAIM', id: row.id },
        step: row.status === 'NEEDS_CORRECTION' ? 'CORRECTION' : 'RESULT',
        originRoute: row.status === 'APPROVED' ? '/account/centres' : '/account/centres/claims',
      },
    });
    return row;
  });
}
