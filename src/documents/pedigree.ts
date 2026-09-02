/**
 * Pedigree issuance — §14.1 step 8, §14.2, §22, D16.
 *
 * The document needs two independent things to be true at once: a complete
 * Parentage Result and a verified Hamzist issuance payment. Neither one implies
 * the other — a receipt approved by the genetics centre is not this payment —
 * and whichever arrives second is the one that finishes the join.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { paymentBatches, paymentItems } from '../db/schema/billing.ts';
import { registrationSheets } from '../db/schema/documents.ts';
import { parentageResults } from '../db/schema/genetics.ts';
import { pedigreeIssuanceItems, pedigrees } from '../db/schema/pedigree.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, type BatchRecord } from '../billing/payments.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { humanCode } from '../domain/ids.ts';
import type { Actor } from '../authz/actor.ts';

export const PEDIGREE_FEE_KEY = 'fee.pedigree_toman';

export type PedigreeItemRecord = typeof pedigreeIssuanceItems.$inferSelect;
export type PedigreeRecord = typeof pedigrees.$inferSelect;

/**
 * The pedigree code — §23.2.
 *
 * The source names the identifier without giving a format, so this is the
 * minimal readable one, in the same alphabet as every other code people read
 * aloud. It implies no external registry.
 */
export const newPedigreeCode = (): string => 'PD-' + humanCode(8);

export interface PedigreeReadiness {
  readonly animalId: string;
  readonly name: string | null;
  readonly ready: boolean;
  readonly resultId: string | null;
  readonly resultVersion: number | null;
  readonly reasonFa: string | null;
}

/**
 * The result half of the join.
 *
 * A result that is still waiting for a parent is not a complete result, so it
 * does not open issuance — but it also never hides itself: the animal's page
 * keeps showing it either way (§14.2, §14.3).
 */
export async function pedigreeReadiness(
  database: DbClient,
  ownerAccountId: string,
  animalId: string,
): Promise<PedigreeReadiness> {
  const [animal] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  if (!animal || animal.ownerAccountId !== ownerAccountId) throw notFound('پرونده حیوان پیدا نشد.');
  const base = { animalId, name: animal.name, resultId: null, resultVersion: null } as const;

  const [existing] = await database
    .select({ id: pedigrees.id })
    .from(pedigrees)
    .where(eq(pedigrees.animalId, animalId))
    .limit(1);
  if (existing) return { ...base, ready: false, reasonFa: 'برای این حیوان شجره‌نامه صادر شده است.' };

  const [sheet] = await database
    .select({ id: registrationSheets.id })
    .from(registrationSheets)
    .where(eq(registrationSheets.animalId, animalId))
    .limit(1);
  if (!sheet) return { ...base, ready: false, reasonFa: 'این حیوان هنوز برگه ثبتی ندارد.' };

  const [result] = await database
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.animalId, animalId))
    .orderBy(desc(parentageResults.resultVersion))
    .limit(1);
  if (!result) return { ...base, ready: false, reasonFa: 'نتیجه Parentage این حیوان هنوز ثبت نشده است.' };
  if (result.status !== 'FINAL') {
    return {
      ...base,
      resultId: result.id,
      resultVersion: result.resultVersion,
      ready: false,
      reasonFa: 'نتیجه این حیوان هنوز نهایی نیست؛ نتیجه در پرونده دیده می‌شود ولی صدور سند باز نمی‌شود.',
    };
  }

  return {
    animalId,
    name: animal.name,
    ready: true,
    resultId: result.id,
    resultVersion: result.resultVersion,
    reasonFa: null,
  };
}

export async function selectableForIssuance(
  database: DbClient,
  actor: Actor,
): Promise<readonly PedigreeReadiness[]> {
  const rows = await database
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'REGISTERED')));
  const readiness = await Promise.all(rows.map((row) => pedigreeReadiness(database, actor.accountId, row.id)));

  const pending = await database
    .select({ animalId: pedigreeIssuanceItems.animalId })
    .from(pedigreeIssuanceItems)
    .where(
      and(
        eq(pedigreeIssuanceItems.ownerAccountId, actor.accountId),
        inArray(pedigreeIssuanceItems.state, ['AWAITING_PAYMENT', 'AWAITING_ISSUANCE']),
      ),
    );
  const busy = new Set(pending.map((p) => p.animalId));
  return readiness.filter((row) => !busy.has(row.animalId));
}

export interface CreatedIssuance {
  readonly batch: BatchRecord;
  readonly items: readonly PedigreeItemRecord[];
}

/**
 * Starts the issuance checkout.
 *
 * The price comes from the current tariff and is frozen per animal, so a later
 * change never rewrites what was charged. A tariff nobody has entered stops the
 * checkout with a named reason instead of assuming a number.
 */
export async function createIssuanceRequest(
  database: Database,
  actor: Actor,
  animalIds: readonly string[],
): Promise<CreatedIssuance> {
  await assertEligible(database, actor.accountId, 'PEDIGREE');
  const unique = [...new Set(animalIds)];
  if (unique.length === 0) throw validation('حداقل یک حیوان انتخاب کنید.');

  for (const animalId of unique) {
    const readiness = await pedigreeReadiness(database, actor.accountId, animalId);
    if (!readiness.ready) throw conflict(readiness.reasonFa ?? 'این حیوان واجد شرایط صدور نیست.');
  }

  const batch = await createBatch(database, actor, {
    service: 'PEDIGREE',
    items: unique.map((animalId) => ({
      targetType: 'ANIMAL',
      targetId: animalId,
      settingKey: PEDIGREE_FEE_KEY,
    })),
    resume: {
      entity: { type: 'ANIMAL', id: unique[0]! },
      step: 'PEDIGREE_ISSUANCE_PAYMENT',
      originRoute: '/pedigree/issue',
    },
  });

  const lines = await database.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));

  return database.transaction(async (tx) => {
    const items: PedigreeItemRecord[] = [];
    for (const animalId of unique) {
      const line = lines.find((l) => l.targetId === animalId)!;
      const [row] = await tx
        .insert(pedigreeIssuanceItems)
        .values({
          batchId: batch.id,
          paymentItemId: line.id,
          animalId,
          ownerAccountId: actor.accountId,
        })
        .returning();
      if (!row) throw conflict('ساخت قلم درخواست انجام نشد.');
      items.push(row);
    }
    await recordAudit(tx, actor, {
      action: 'PEDIGREE_ISSUANCE_REQUESTED',
      targetType: 'PAYMENT_BATCH',
      targetId: batch.id,
      after: { animals: unique },
    });
    return { batch, items };
  });
}

export async function markBatchPaid(tx: DbClient, batchId: string): Promise<void> {
  await tx
    .update(pedigreeIssuanceItems)
    .set({ state: 'AWAITING_ISSUANCE', updatedAt: new Date() })
    .where(
      and(eq(pedigreeIssuanceItems.batchId, batchId), eq(pedigreeIssuanceItems.state, 'AWAITING_PAYMENT')),
    );
}

/**
 * Issues the pedigrees of one paid batch.
 *
 * It runs inside the verifying transaction and is written to be repeatable:
 * the unique index on the animal is what makes a repeated callback or a retried
 * issuance produce one document. An animal whose result is not final is blocked
 * with its reason while the others proceed.
 */
export async function issueForBatch(tx: DbClient, batch: BatchRecord): Promise<void> {
  const items = await tx
    .select()
    .from(pedigreeIssuanceItems)
    .where(eq(pedigreeIssuanceItems.batchId, batch.id));

  for (const item of items) {
    if (item.state === 'ISSUED') continue;

    const [already] = await tx
      .select()
      .from(pedigrees)
      .where(eq(pedigrees.animalId, item.animalId))
      .limit(1);
    if (already) {
      await tx
        .update(pedigreeIssuanceItems)
        .set({ state: 'ISSUED', version: item.version + 1, updatedAt: new Date() })
        .where(eq(pedigreeIssuanceItems.id, item.id));
      continue;
    }

    const readiness = await pedigreeReadiness(tx, item.ownerAccountId, item.animalId);
    if (!readiness.ready || !readiness.resultId) {
      await tx
        .update(pedigreeIssuanceItems)
        .set({
          state: 'BLOCKED',
          blockedReasonFa: readiness.reasonFa ?? 'شرایط صدور کامل نیست.',
          version: item.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(pedigreeIssuanceItems.id, item.id));
      await recordAudit(tx, null, {
        action: 'PEDIGREE_ISSUANCE_BLOCKED',
        targetType: 'ANIMAL',
        targetId: item.animalId,
        reason: readiness.reasonFa,
        after: { batchId: batch.id },
      });
      await createNotification(tx, {
        recipientAccountId: item.ownerAccountId,
        kind: 'PEDIGREE_BLOCKED',
        titleFa: 'صدور شجره‌نامه این حیوان انجام نشد',
        bodyFa:
          (readiness.reasonFa ?? 'شرایط صدور کامل نیست.') +
          ' پرداخت این قلم محفوظ است و پس از آماده‌شدن نتیجه، صدور انجام می‌شود.',
        resume: {
          entity: { type: 'ANIMAL', id: item.animalId },
          step: 'PEDIGREE',
          originRoute: '/pedigree/batch/' + batch.id,
        },
      });
      continue;
    }

    const [animal] = await tx.select().from(animals).where(eq(animals.id, item.animalId)).limit(1);
    const code = newPedigreeCode();
    const [document] = await tx
      .insert(pedigrees)
      .values({
        animalId: item.animalId,
        ownerAccountId: item.ownerAccountId,
        itemId: item.id,
        batchId: batch.id,
        pedigreeCode: code,
        issuedFromResultId: readiness.resultId,
        issuedFromResultVersion: readiness.resultVersion ?? 1,
        sireAnimalId: animal?.sireAnimalId ?? null,
        damAnimalId: animal?.damAnimalId ?? null,
        generationAtIssue: animal?.generation ?? 0,
      })
      .returning();
    if (!document) throw conflict('صدور شجره‌نامه انجام نشد.');

    await tx
      .update(animals)
      .set({ pedigreeCode: code, updatedAt: new Date() })
      .where(eq(animals.id, item.animalId));
    await tx
      .update(pedigreeIssuanceItems)
      .set({ state: 'ISSUED', blockedReasonFa: null, version: item.version + 1, updatedAt: new Date() })
      .where(eq(pedigreeIssuanceItems.id, item.id));

    await recordAudit(tx, null, {
      action: 'PEDIGREE_ISSUED',
      targetType: 'ANIMAL',
      targetId: item.animalId,
      after: {
        pedigreeId: document.id,
        pedigreeCode: code,
        resultId: readiness.resultId,
        resultVersion: readiness.resultVersion,
      },
    });
    await createNotification(tx, {
      recipientAccountId: item.ownerAccountId,
      kind: 'PEDIGREE_ISSUED',
      titleFa: 'شجره‌نامه این حیوان صادر شد',
      bodyFa: 'سند بر اساس نتیجه Parentage نهایی همین حیوان صادر شد و در پرونده قابل مشاهده است.',
      resume: {
        entity: { type: 'ANIMAL', id: item.animalId },
        step: 'PEDIGREE',
        originRoute: '/documents/pedigree/' + document.id,
      },
    });
  }
}

/** A second attempt at a blocked item once its result became final. No money moves. */
export async function retryIssuance(
  database: Database,
  actor: Actor,
  batchId: string,
): Promise<readonly PedigreeItemRecord[]> {
  const [batch] = await database.select().from(paymentBatches).where(eq(paymentBatches.id, batchId)).limit(1);
  if (!batch || batch.accountId !== actor.accountId) throw notFound('درخواست صدور شجره‌نامه پیدا نشد.');
  if (batch.status !== 'PAID') throw conflict('این درخواست هنوز پرداخت تأییدشده ندارد.');

  await database.transaction(async (tx) => {
    await issueForBatch(tx, {
      id: batch.id,
      accountId: batch.accountId,
      service: 'PEDIGREE',
      status: 'PAID',
      resumeContext: batch.resumeContext as never,
      version: batch.version,
    });
    await recordAudit(tx, actor, {
      action: 'PEDIGREE_ISSUANCE_RETRIED',
      targetType: 'PAYMENT_BATCH',
      targetId: batch.id,
    });
  });

  return itemsOfBatch(database, batchId);
}

export async function itemsOfBatch(
  database: DbClient,
  batchId: string,
): Promise<readonly PedigreeItemRecord[]> {
  return database
    .select()
    .from(pedigreeIssuanceItems)
    .where(eq(pedigreeIssuanceItems.batchId, batchId))
    .orderBy(pedigreeIssuanceItems.createdAt);
}

export async function pedigreeOfAnimal(database: DbClient, animalId: string): Promise<PedigreeRecord | null> {
  const [row] = await database.select().from(pedigrees).where(eq(pedigrees.animalId, animalId)).limit(1);
  return row ?? null;
}

/** Secure retrieval: the document is readable by its owner and nobody else. */
export async function pedigreeForOwner(
  database: DbClient,
  actor: Actor,
  id: string,
): Promise<PedigreeRecord> {
  const [row] = await database.select().from(pedigrees).where(eq(pedigrees.id, id)).limit(1);
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('شجره‌نامه پیدا نشد.');
  return row;
}

export async function pedigreesOfOwner(database: DbClient, actor: Actor): Promise<readonly PedigreeRecord[]> {
  return database
    .select()
    .from(pedigrees)
    .where(eq(pedigrees.ownerAccountId, actor.accountId))
    .orderBy(desc(pedigrees.issuedAt));
}

export async function countPedigreesOfOwner(database: DbClient, accountId: string): Promise<number> {
  const rows = await database
    .select({ id: pedigrees.id })
    .from(pedigrees)
    .where(eq(pedigrees.ownerAccountId, accountId));
  return rows.length;
}

export async function issuanceBatchesOfOwner(database: DbClient, actor: Actor) {
  return database
    .select()
    .from(paymentBatches)
    .where(and(eq(paymentBatches.accountId, actor.accountId), eq(paymentBatches.service, 'PEDIGREE')))
    .orderBy(desc(paymentBatches.createdAt));
}

/**
 * A corrected result arrived after a document was issued — §14.5, §19.
 *
 * The conservative handling: the issued document is left exactly as it was,
 * with its own provenance, and a notice is attached beside it. Nothing is
 * rewritten, nothing is revoked, and no permit is touched.
 */
export async function noticeCorrectedResult(
  tx: DbClient,
  animalId: string,
  correctedVersion: number,
): Promise<void> {
  const [document] = await tx.select().from(pedigrees).where(eq(pedigrees.animalId, animalId)).limit(1);
  if (!document) return;

  const noticeFa =
    'نتیجه اصلاحی نسخه ' +
    correctedVersion +
    ' برای این حیوان ثبت شده است. این سند بر اساس نسخه ' +
    document.issuedFromResultVersion +
    ' صادر شده و بدون تغییر باقی می‌ماند.';

  await tx
    .update(pedigrees)
    .set({ correctionNoticeFa: noticeFa, noticedAt: new Date() })
    .where(eq(pedigrees.id, document.id));
  await recordAudit(tx, null, {
    action: 'PEDIGREE_CORRECTION_NOTICED',
    targetType: 'ANIMAL',
    targetId: animalId,
    after: {
      pedigreeId: document.id,
      issuedFromResultVersion: document.issuedFromResultVersion,
      correctedVersion,
    },
  });
  await createNotification(tx, {
    recipientAccountId: document.ownerAccountId,
    kind: 'PEDIGREE_CORRECTION_NOTICED',
    titleFa: 'نتیجه اصلاحی برای حیوان دارای شجره‌نامه ثبت شد',
    bodyFa: noticeFa,
    resume: {
      entity: { type: 'ANIMAL', id: animalId },
      step: 'PEDIGREE',
      originRoute: '/documents/pedigree/' + document.id,
    },
  });
}
