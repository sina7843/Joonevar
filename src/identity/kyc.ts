/**
 * KYC — §6.3, §21.2, §21.5.
 *
 * Flow: تکمیل اطلاعات → آماده ارسال → در حال بررسی → تأیید / نیازمند اصلاح / رد با دلیل.
 *
 * A correction keeps the valid data and the previously uploaded file, so a
 * person is never asked to re-supply something that was already accepted.
 *
 * Reviewing is an association operator action. §21.2 puts the reviews connected
 * to a user in the association queue and the source names no other reviewer, so
 * the existing scoped ASSOCIATION_OPERATOR permission is reused rather than a
 * new role or a new product gate being invented (DEC-0027).
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { kycCases } from '../db/schema/identity.ts';
import { accounts, storedFiles } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { putPrivateFile } from '../files/storage.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page, type PageRequest } from '../domain/pagination.ts';
import type { Actor } from '../authz/actor.ts';
import { findProfile } from './account.ts';

export type KycStatus = 'DRAFT' | 'READY' | 'UNDER_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';

export interface KycCaseRecord {
  readonly id: string;
  readonly accountId: string;
  readonly status: KycStatus;
  readonly reasonFa: string | null;
  readonly documentFileId: string | null;
  readonly submittedAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly version: number;
}

/**
 * Persian labels for every status. Technical enum names never appear in user or
 * operator text (§24.3), so both surfaces read from this one map.
 */
export const KYC_STATUS_FA: Record<KycStatus, string> = {
  DRAFT: 'تکمیل اطلاعات',
  READY: 'آماده ارسال',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأیید شده',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  REJECTED: 'رد شده',
};

/** Statuses in which the applicant may still change the case. */
const EDITABLE: readonly KycStatus[] = ['DRAFT', 'NEEDS_CORRECTION'];

export async function getOrCreateCase(database: Database, accountId: string): Promise<KycCaseRecord> {
  const [existing] = await database.select().from(kycCases).where(eq(kycCases.accountId, accountId)).limit(1);
  if (existing) return existing as KycCaseRecord;
  const [created] = await database.insert(kycCases).values({ accountId, status: 'DRAFT' }).returning();
  return created as KycCaseRecord;
}

export async function findCase(database: DbClient, accountId: string): Promise<KycCaseRecord | null> {
  const [row] = await database.select().from(kycCases).where(eq(kycCases.accountId, accountId)).limit(1);
  return row ? (row as KycCaseRecord) : null;
}

/**
 * Attach the national card document.
 *
 * The accepted types and the 10 MB ceiling are enforced by the storage layer on
 * the real bytes, not on the declared name. Replacing a document supersedes the
 * previous one; the old row stays for the audit trail.
 */
export async function attachKycDocument(
  database: Database,
  storageRoot: string,
  actor: Actor,
  file: { bytes: Uint8Array; originalName?: string | null },
): Promise<KycCaseRecord> {
  const current = await getOrCreateCase(database, actor.accountId);
  if (!EDITABLE.includes(current.status)) {
    throw conflict('در وضعیت فعلی، امکان تغییر مدرک وجود ندارد.');
  }

  return database.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: 'KYC_NATIONAL_ID',
      bytes: file.bytes,
      originalName: file.originalName ?? null,
    });
    const [updated] = await tx
      .update(kycCases)
      .set({ documentFileId: stored.id, version: current.version + 1, updatedAt: new Date() })
      .where(eq(kycCases.id, current.id))
      .returning();
    await recordAudit(tx, actor, {
      action: 'KYC_DOCUMENT_ATTACHED',
      targetType: 'KYC_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { documentFileId: current.documentFileId },
      after: { documentFileId: stored.id, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return updated as KycCaseRecord;
  });
}

/** Submit for review. Requires the identity group and the document. */
export async function submitKyc(database: Database, actor: Actor, now: Date = new Date()): Promise<KycCaseRecord> {
  const profile = await findProfile(database, actor.accountId);
  if (profile === null) throw validation('ابتدا اطلاعات هویتی خود را تکمیل کنید.');

  const current = await getOrCreateCase(database, actor.accountId);
  if (!EDITABLE.includes(current.status)) {
    throw conflict('این پرونده در وضعیت فعلی قابل ارسال دوباره نیست.');
  }
  if (current.documentFileId === null) throw validation('تصویر کارت ملی را بارگذاری کنید.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(kycCases)
      .set({
        status: 'UNDER_REVIEW',
        submittedAt: now,
        // The previous reason is cleared on resubmission but stays in the audit trail.
        reasonFa: null,
        reviewedAt: null,
        reviewedByAccountId: null,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(kycCases.id, current.id), eq(kycCases.version, current.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'KYC_SUBMITTED',
      targetType: 'KYC_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: 'UNDER_REVIEW' },
    });
    return updated as KycCaseRecord;
  });
}

export type KycDecision = 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';

const DECISION_TITLE_FA: Record<KycDecision, string> = {
  APPROVED: 'احراز هویت شما تأیید شد',
  NEEDS_CORRECTION: 'احراز هویت شما نیازمند اصلاح است',
  REJECTED: 'احراز هویت شما رد شد',
};

const DECISION_BODY_FA: Record<KycDecision, string> = {
  APPROVED: 'اکنون می‌توانید حیوان خود را در هم‌زیست ثبت کنید.',
  NEEDS_CORRECTION: 'اطلاعات و فایل معتبر قبلی شما حفظ شده است؛ همان پرونده را اصلاح و دوباره ارسال کنید.',
  REJECTED: 'دلیل رد در پرونده شما ثبت شده است.',
};

/**
 * Record the review outcome.
 *
 * Rejection and correction both require a reason (§21.5). The decision is
 * version-guarded so a stale queue view cannot overwrite a newer state, and the
 * notification points back at the applicant's own case.
 */
export async function reviewKyc(
  database: Database,
  actor: Actor,
  input: { caseId: string; decision: KycDecision; reasonFa?: string; expectedVersion?: number },
  now: Date = new Date(),
): Promise<KycCaseRecord> {
  if (actor.context !== 'ASSOCIATION_OPERATOR') {
    throw forbidden('بررسی احراز هویت فقط از محیط عملیاتی انجمن انجام می‌شود.');
  }
  const reason = input.reasonFa?.trim() ?? '';
  if (input.decision !== 'APPROVED' && reason.length < 3) {
    throw validation('برای اصلاح یا رد، ثبت دلیل الزامی است.');
  }

  const [current] = await database.select().from(kycCases).where(eq(kycCases.id, input.caseId)).limit(1);
  if (!current) throw notFound('پرونده احراز هویت پیدا نشد.');
  if (current.status !== 'UNDER_REVIEW') throw conflict('این پرونده در انتظار بررسی نیست.');
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw conflict('پرونده هم‌زمان تغییر کرده است.');
  }

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(kycCases)
      .set({
        status: input.decision,
        reasonFa: input.decision === 'APPROVED' ? null : reason,
        reviewedAt: now,
        reviewedByAccountId: actor.accountId,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(kycCases.id, current.id), eq(kycCases.version, current.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'KYC_REVIEWED',
      targetType: 'KYC_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: input.decision },
      reason: input.decision === 'APPROVED' ? null : reason,
    });

    await createNotification(tx, {
      recipientAccountId: current.accountId,
      kind: 'KYC_' + input.decision,
      titleFa: DECISION_TITLE_FA[input.decision],
      bodyFa: DECISION_BODY_FA[input.decision],
      resume: {
        entity: { type: 'KYC_CASE', id: current.id },
        step: input.decision === 'NEEDS_CORRECTION' ? 'CORRECT_DOCUMENT' : 'VIEW_RESULT',
        originRoute: '/account/kyc',
      },
    });

    return updated as KycCaseRecord;
  });
}

export interface KycQueueItem {
  readonly id: string;
  readonly accountId: string;
  readonly status: KycStatus;
  readonly submittedAt: Date | null;
  readonly version: number;
  readonly applicantName: string;
  readonly documentFileId: string | null;
}

/** Association review queue (§21.5): list → detail → action → reason → notification. */
export async function kycQueue(
  database: DbClient,
  actor: Actor,
  request: PageRequest,
  statuses: readonly KycStatus[] = ['UNDER_REVIEW'],
): Promise<Page<KycQueueItem>> {
  if (actor.context !== 'ASSOCIATION_OPERATOR') throw forbidden('این صف فقط برای اپراتور انجمن است.');
  const where = inArray(kycCases.status, statuses as KycStatus[]);
  const rows = await database
    .select({
      id: kycCases.id,
      accountId: kycCases.accountId,
      status: kycCases.status,
      submittedAt: kycCases.submittedAt,
      version: kycCases.version,
      documentFileId: kycCases.documentFileId,
      mobile: accounts.mobile,
    })
    .from(kycCases)
    .innerJoin(accounts, eq(accounts.id, kycCases.accountId))
    .where(where)
    .orderBy(desc(kycCases.submittedAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));

  const [counted] = await database.select({ total: sql<string>`count(*)` }).from(kycCases).where(where);

  const items: KycQueueItem[] = [];
  for (const row of rows) {
    const profile = await findProfile(database, row.accountId);
    items.push({
      id: row.id,
      accountId: row.accountId,
      status: row.status as KycStatus,
      submittedAt: row.submittedAt,
      version: row.version,
      documentFileId: row.documentFileId,
      applicantName: profile ? profile.firstName + ' ' + profile.lastName : 'بدون اطلاعات هویتی',
    });
  }
  return pageOf(items, Number(counted?.total ?? 0), request);
}

/**
 * Animal registration unlocks on approved KYC and does not depend on membership
 * (§5, §9.1, acceptance A-001).
 */
export async function canRegisterAnimal(database: DbClient, accountId: string): Promise<boolean> {
  const record = await findCase(database, accountId);
  return record?.status === 'APPROVED';
}

/** The document is readable through the private-file route only; this is just the reference. */
export async function kycDocumentRef(database: DbClient, caseId: string) {
  const [row] = await database
    .select({ fileId: kycCases.documentFileId })
    .from(kycCases)
    .where(eq(kycCases.id, caseId))
    .limit(1);
  if (!row?.fileId) return null;
  const [file] = await database
    .select({ id: storedFiles.id, mime: storedFiles.mime, sizeBytes: storedFiles.sizeBytes })
    .from(storedFiles)
    .where(eq(storedFiles.id, row.fileId))
    .limit(1);
  return file ?? null;
}
