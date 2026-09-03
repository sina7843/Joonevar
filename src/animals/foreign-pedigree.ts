/**
 * Foreign pedigree review — §9.4, §21.2, D14.
 *
 * The document is uploaded as two independent files, front and back, and the
 * association reviews it against its own registry of approved issuers. There is
 * no promised turnaround, no extra superadmin step and no invented translation
 * requirement. A correction keeps the valid data and both uploaded files.
 *
 * The generation that an approval writes comes from the reviewed document and
 * is read-only afterwards, exactly like a computed generation.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals, foreignPedigreeCases } from '../db/schema/animals.ts';
import { pedigreeIssuers } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { putPrivateFile } from '../files/storage.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page, type PageRequest } from '../domain/pagination.ts';
import type { Actor } from '../authz/actor.ts';
import { requireOwnedAnimal } from './service.ts';

export type ForeignPedigreeStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';
export type ForeignPedigreeCase = typeof foreignPedigreeCases.$inferSelect;
export type ForeignSide = 'FRONT' | 'BACK';

/** Persian labels, so no enum name reaches a user or operator screen (§24.3). */
export const FOREIGN_STATUS_FA: Record<ForeignPedigreeStatus, string> = {
  DRAFT: 'تکمیل مدارک',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تأیید شده',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  REJECTED: 'رد شده',
};

const EDITABLE: readonly ForeignPedigreeStatus[] = ['DRAFT', 'NEEDS_CORRECTION'];

export async function getOrCreateForeignCase(
  database: Database,
  actor: Actor,
  animalId: string,
): Promise<ForeignPedigreeCase> {
  await requireOwnedAnimal(database, actor, animalId);
  const [existing] = await database
    .select()
    .from(foreignPedigreeCases)
    .where(eq(foreignPedigreeCases.animalId, animalId))
    .limit(1);
  if (existing) return existing;
  const [created] = await database.insert(foreignPedigreeCases).values({ animalId, status: 'DRAFT' }).returning();
  return created!;
}

export async function findForeignCase(
  database: DbClient,
  animalId: string,
): Promise<ForeignPedigreeCase | null> {
  const [row] = await database
    .select()
    .from(foreignPedigreeCases)
    .where(eq(foreignPedigreeCases.animalId, animalId))
    .limit(1);
  return row ?? null;
}

/**
 * Upload one side of the document.
 *
 * Front and back live in separate columns, so replacing one never disturbs the
 * other — which is what keeps a correction from asking for both again.
 */
export async function attachForeignSide(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: { animalId: string; side: ForeignSide; bytes: Uint8Array; originalName?: string | null },
): Promise<ForeignPedigreeCase> {
  const current = await getOrCreateForeignCase(database, actor, input.animalId);
  if (!EDITABLE.includes(current.status as ForeignPedigreeStatus)) {
    throw conflict('در وضعیت فعلی، امکان تغییر مدرک وجود ندارد.');
  }

  return database.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose: input.side === 'FRONT' ? 'FOREIGN_PEDIGREE_FRONT' : 'FOREIGN_PEDIGREE_BACK',
      bytes: input.bytes,
      originalName: input.originalName ?? null,
    });

    const [updated] = await tx
      .update(foreignPedigreeCases)
      .set({
        frontFileId: input.side === 'FRONT' ? stored.id : current.frontFileId,
        backFileId: input.side === 'BACK' ? stored.id : current.backFileId,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(foreignPedigreeCases.id, current.id))
      .returning();

    await recordAudit(tx, actor, {
      action: 'FOREIGN_PEDIGREE_SIDE_ATTACHED',
      targetType: 'FOREIGN_PEDIGREE_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { frontFileId: current.frontFileId, backFileId: current.backFileId },
      after: { side: input.side, fileId: stored.id, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return updated!;
  });
}

export async function setForeignDetails(
  database: Database,
  actor: Actor,
  input: { animalId: string; issuerId: string | null; documentCode: string | null },
): Promise<ForeignPedigreeCase> {
  const current = await getOrCreateForeignCase(database, actor, input.animalId);
  if (!EDITABLE.includes(current.status as ForeignPedigreeStatus)) {
    throw conflict('در وضعیت فعلی، امکان تغییر اطلاعات وجود ندارد.');
  }

  // The issuer must exist in the association registry; free text is refused so
  // an unapproved issuer can never be presented as an approved one (D14).
  if (input.issuerId !== null) {
    const [issuer] = await database
      .select({ id: pedigreeIssuers.id, isActive: pedigreeIssuers.isActive })
      .from(pedigreeIssuers)
      .where(eq(pedigreeIssuers.id, input.issuerId))
      .limit(1);
    if (!issuer || !issuer.isActive) throw validation('صادرکننده انتخاب‌شده در فهرست موردتأیید انجمن نیست.');
  }

  const [updated] = await database
    .update(foreignPedigreeCases)
    .set({
      issuerId: input.issuerId,
      documentCode: input.documentCode?.trim() || null,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(foreignPedigreeCases.id, current.id))
    .returning();
  return updated!;
}

/** Submit for association review. Both sides are required (§9.4). */
export async function submitForeignCase(
  database: Database,
  actor: Actor,
  animalId: string,
  now: Date = new Date(),
): Promise<ForeignPedigreeCase> {
  const current = await getOrCreateForeignCase(database, actor, animalId);
  if (!EDITABLE.includes(current.status as ForeignPedigreeStatus)) {
    throw conflict('این پرونده در وضعیت فعلی قابل ارسال دوباره نیست.');
  }
  if (current.frontFileId === null || current.backFileId === null) {
    throw validation('تصویر روی برگه و پشت برگه، هر دو لازم است.');
  }
  if (current.issuerId === null) throw validation('صادرکننده مدرک را از فهرست انتخاب کنید.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(foreignPedigreeCases)
      .set({
        status: 'UNDER_REVIEW',
        submittedAt: now,
        reasonFa: null,
        reviewedAt: null,
        reviewedByAccountId: null,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(foreignPedigreeCases.id, current.id), eq(foreignPedigreeCases.version, current.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'FOREIGN_PEDIGREE_SUBMITTED',
      targetType: 'FOREIGN_PEDIGREE_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: 'UNDER_REVIEW', issuerId: current.issuerId },
    });
    return updated;
  });
}

export type ForeignDecision = 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';

const TITLE_FA: Record<ForeignDecision, string> = {
  APPROVED: 'Export Pedigree شما تأیید شد',
  NEEDS_CORRECTION: 'Export Pedigree شما نیازمند اصلاح است',
  REJECTED: 'Export Pedigree شما رد شد',
};

const BODY_FA: Record<ForeignDecision, string> = {
  APPROVED: 'نسل حیوان از مدرک بررسی‌شده استخراج شد و در پرونده ثبت است.',
  NEEDS_CORRECTION: 'اطلاعات و فایل‌های معتبر قبلی شما حفظ شده است؛ همان پرونده را اصلاح و دوباره ارسال کنید.',
  REJECTED: 'دلیل رد در پرونده حیوان شما ثبت شده است.',
};

/**
 * Record the association decision.
 *
 * An approval writes the generation read from the document onto the animal and
 * marks its origin as a foreign pedigree; from then on the generation is
 * read-only, exactly like a computed one. A correction or a rejection always
 * carries a reason (§21.5).
 */
export async function reviewForeignCase(
  database: Database,
  actor: Actor,
  input: {
    caseId: string;
    decision: ForeignDecision;
    reasonFa?: string;
    extractedGeneration?: number;
    expectedVersion?: number;
  },
  now: Date = new Date(),
): Promise<ForeignPedigreeCase> {
  if (actor.context !== 'ASSOCIATION_OPERATOR') {
    throw forbidden('بررسی Export Pedigree فقط از محیط عملیاتی انجمن انجام می‌شود.');
  }
  const reason = input.reasonFa?.trim() ?? '';
  if (input.decision !== 'APPROVED' && reason.length < 3) {
    throw validation('برای اصلاح یا رد، ثبت دلیل الزامی است.');
  }
  if (input.decision === 'APPROVED') {
    if (input.extractedGeneration === undefined || !Number.isInteger(input.extractedGeneration)) {
      throw validation('نسل استخراج‌شده از مدرک را وارد کنید.');
    }
    if (input.extractedGeneration < 0 || input.extractedGeneration > 50) {
      throw validation('نسل استخراج‌شده معتبر نیست.');
    }
  }

  const [current] = await database
    .select()
    .from(foreignPedigreeCases)
    .where(eq(foreignPedigreeCases.id, input.caseId))
    .limit(1);
  if (!current) throw notFound('پرونده Export Pedigree پیدا نشد.');
  if (current.status !== 'UNDER_REVIEW') throw conflict('این پرونده در انتظار بررسی نیست.');
  if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
    throw conflict('پرونده هم‌زمان تغییر کرده است.');
  }

  const [animal] = await database.select().from(animals).where(eq(animals.id, current.animalId)).limit(1);
  if (!animal) throw notFound('حیوان این پرونده پیدا نشد.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(foreignPedigreeCases)
      .set({
        status: input.decision,
        reasonFa: input.decision === 'APPROVED' ? null : reason,
        extractedGeneration: input.decision === 'APPROVED' ? input.extractedGeneration! : current.extractedGeneration,
        reviewedAt: now,
        reviewedByAccountId: actor.accountId,
        version: current.version + 1,
        updatedAt: now,
      })
      .where(and(eq(foreignPedigreeCases.id, current.id), eq(foreignPedigreeCases.version, current.version)))
      .returning();
    if (!updated) throw conflict('پرونده هم‌زمان تغییر کرده است.');

    if (input.decision === 'APPROVED') {
      await tx
        .update(animals)
        .set({
          generation: input.extractedGeneration!,
          origin: 'FOREIGN_PEDIGREE',
          version: animal.version + 1,
          updatedAt: now,
        })
        .where(eq(animals.id, animal.id));

      await recordAudit(tx, actor, {
        action: 'ANIMAL_GENERATION_FROM_FOREIGN_PEDIGREE',
        targetType: 'ANIMAL',
        targetId: animal.id,
        targetVersion: animal.version + 1,
        before: { generation: animal.generation, origin: animal.origin },
        after: { generation: input.extractedGeneration, origin: 'FOREIGN_PEDIGREE', caseId: current.id },
      });
    }

    await recordAudit(tx, actor, {
      action: 'FOREIGN_PEDIGREE_REVIEWED',
      targetType: 'FOREIGN_PEDIGREE_CASE',
      targetId: current.id,
      targetVersion: current.version + 1,
      before: { status: current.status },
      after: { status: input.decision, extractedGeneration: updated.extractedGeneration },
      reason: input.decision === 'APPROVED' ? null : reason,
    });

    await createNotification(tx, {
      recipientAccountId: animal.ownerAccountId,
      kind: 'FOREIGN_PEDIGREE_' + input.decision,
      titleFa: TITLE_FA[input.decision],
      bodyFa: BODY_FA[input.decision],
      resume: {
        entity: { type: 'FOREIGN_PEDIGREE_CASE', id: current.id },
        step: input.decision === 'NEEDS_CORRECTION' ? 'CORRECT_DOCUMENT' : 'VIEW_RESULT',
        originRoute: '/animals/' + animal.id + '/foreign-pedigree',
      },
    });

    return updated;
  });
}

export interface ForeignQueueItem {
  readonly id: string;
  readonly animalId: string;
  readonly animalName: string;
  readonly status: ForeignPedigreeStatus;
  readonly issuerName: string | null;
  readonly documentCode: string | null;
  readonly submittedAt: Date | null;
  readonly version: number;
}

/** Association queue (§21.2, §21.5). */
export async function foreignQueue(
  database: DbClient,
  actor: Actor,
  request: PageRequest,
  statuses: readonly ForeignPedigreeStatus[] = ['UNDER_REVIEW'],
): Promise<Page<ForeignQueueItem>> {
  if (actor.context !== 'ASSOCIATION_OPERATOR') throw forbidden('این صف فقط برای اپراتور انجمن است.');
  const where = inArray(foreignPedigreeCases.status, statuses as ForeignPedigreeStatus[]);

  const rows = await database
    .select({
      id: foreignPedigreeCases.id,
      animalId: foreignPedigreeCases.animalId,
      status: foreignPedigreeCases.status,
      documentCode: foreignPedigreeCases.documentCode,
      submittedAt: foreignPedigreeCases.submittedAt,
      version: foreignPedigreeCases.version,
      animalName: animals.name,
      issuerName: pedigreeIssuers.name,
    })
    .from(foreignPedigreeCases)
    .innerJoin(animals, eq(animals.id, foreignPedigreeCases.animalId))
    .leftJoin(pedigreeIssuers, eq(pedigreeIssuers.id, foreignPedigreeCases.issuerId))
    .where(where)
    .orderBy(desc(foreignPedigreeCases.submittedAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));

  const [counted] = await database
    .select({ total: sql<string>`count(*)` })
    .from(foreignPedigreeCases)
    .where(where);

  return pageOf(
    rows.map((row) => ({
      id: row.id,
      animalId: row.animalId,
      animalName: row.animalName ?? 'بدون نام',
      status: row.status as ForeignPedigreeStatus,
      issuerName: row.issuerName,
      documentCode: row.documentCode,
      submittedAt: row.submittedAt,
      version: row.version,
    })),
    Number(counted?.total ?? 0),
    request,
  );
}

export async function foreignCaseById(database: DbClient, caseId: string) {
  const [row] = await database
    .select()
    .from(foreignPedigreeCases)
    .where(eq(foreignPedigreeCases.id, caseId))
    .limit(1);
  return row ?? null;
}

/**
 * Approved issuer registry — association-managed data (D14).
 *
 * The registry starts empty and stays empty until the association enters real
 * names; nothing here invents one.
 */
export async function listIssuers(database: DbClient, onlyActive = false) {
  const rows = onlyActive
    ? await database.select().from(pedigreeIssuers).where(eq(pedigreeIssuers.isActive, true))
    : await database.select().from(pedigreeIssuers);
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

export async function addIssuer(
  database: Database,
  actor: Actor,
  input: { name: string; country?: string | null; noteFa?: string | null },
) {
  if (actor.context !== 'ASSOCIATION_OPERATOR') {
    throw forbidden('مدیریت فهرست صادرکنندگان فقط از محیط عملیاتی انجمن انجام می‌شود.');
  }
  const name = input.name.trim();
  if (name.length < 2) throw validation('نام صادرکننده معتبر نیست.');

  return database.transaction(async (tx) => {
    const [created] = await tx
      .insert(pedigreeIssuers)
      .values({
        name,
        country: input.country?.trim() || null,
        noteFa: input.noteFa?.trim() || null,
        approvedAt: new Date(),
      })
      .onConflictDoNothing({ target: pedigreeIssuers.name })
      .returning();
    if (!created) throw conflict('این صادرکننده قبلاً ثبت شده است.');

    await recordAudit(tx, actor, {
      action: 'PEDIGREE_ISSUER_ADDED',
      targetType: 'PEDIGREE_ISSUER',
      targetId: created.id,
      after: { name: created.name, country: created.country, isActive: created.isActive },
    });
    return created;
  });
}

export async function setIssuerActive(
  database: Database,
  actor: Actor,
  input: { issuerId: string; isActive: boolean; reasonFa: string },
) {
  if (actor.context !== 'ASSOCIATION_OPERATOR') {
    throw forbidden('مدیریت فهرست صادرکنندگان فقط از محیط عملیاتی انجمن انجام می‌شود.');
  }
  const reason = input.reasonFa.trim();
  if (reason.length < 3) throw validation('ثبت دلیل الزامی است.');

  const [current] = await database
    .select()
    .from(pedigreeIssuers)
    .where(eq(pedigreeIssuers.id, input.issuerId))
    .limit(1);
  if (!current) throw notFound('صادرکننده پیدا نشد.');

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(pedigreeIssuers)
      .set({ isActive: input.isActive, updatedAt: new Date() })
      .where(eq(pedigreeIssuers.id, input.issuerId))
      .returning();
    await recordAudit(tx, actor, {
      action: input.isActive ? 'PEDIGREE_ISSUER_ACTIVATED' : 'PEDIGREE_ISSUER_DEACTIVATED',
      targetType: 'PEDIGREE_ISSUER',
      targetId: input.issuerId,
      before: { isActive: current.isActive },
      after: { isActive: input.isActive },
      reason,
    });
    return updated!;
  });
}
