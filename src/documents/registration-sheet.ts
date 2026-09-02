/**
 * Registration sheets — §13, §22, §26, D16.
 *
 * Payment comes after the microchip and the mandatory sample, never before, and
 * the veterinarian's own fee is a different transaction that this checkout does
 * not touch. Every animal in a batch keeps its own state: one blocked animal
 * cannot hide the others or stop an eligible, paid one from being issued.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips, samples } from '../db/schema/clinical.ts';
import { paymentBatches, paymentItems } from '../db/schema/billing.ts';
import { registrationSheetItems, registrationSheets } from '../db/schema/documents.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, type BatchRecord } from '../billing/payments.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { newPetId, newRegistrationSheetNo } from '../domain/ids.ts';
import { isUnusable } from '../domain/microchip.ts';
import type { Actor } from '../authz/actor.ts';

export const REGISTRATION_SHEET_FEE_KEY = 'fee.registration_sheet_toman';

/** Exactly the sentence §13 prescribes for an issued sheet. */
export const SAMPLE_TAKEN_NOTE_FA = 'نمونه خون دریافت شده؛ آزمایش Parentage هنوز انجام نشده است.';

export type SheetItemRecord = typeof registrationSheetItems.$inferSelect;
export type SheetRecord = typeof registrationSheets.$inferSelect;

export interface AnimalReadiness {
  readonly animalId: string;
  readonly name: string | null;
  readonly ready: boolean;
  readonly microchipNumber: string | null;
  readonly sampleTrackingCode: string | null;
  readonly reasonFa: string | null;
}

/**
 * What §13 steps 1–5 have to have produced before the money step opens.
 *
 * The order of the reasons matches the order of the steps, so the message names
 * the nearest missing thing rather than the last one checked.
 */
export async function readinessOf(
  database: DbClient,
  ownerAccountId: string,
  animalId: string,
): Promise<AnimalReadiness> {
  const [animal] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  if (!animal || animal.ownerAccountId !== ownerAccountId) throw notFound('پرونده حیوان پیدا نشد.');

  const base = { animalId, name: animal.name } as const;
  if (animal.status !== 'REGISTERED') {
    return { ...base, ready: false, microchipNumber: null, sampleTrackingCode: null, reasonFa: 'ثبت اولیه این حیوان کامل نیست.' };
  }

  const [existing] = await database
    .select({ id: registrationSheets.id })
    .from(registrationSheets)
    .where(eq(registrationSheets.animalId, animalId))
    .limit(1);
  if (existing) {
    return { ...base, ready: false, microchipNumber: null, sampleTrackingCode: null, reasonFa: 'برای این حیوان برگه ثبتی صادر شده است.' };
  }

  const [chip] = await database.select().from(microchips).where(eq(microchips.animalId, animalId)).limit(1);
  if (!chip) {
    return { ...base, ready: false, microchipNumber: null, sampleTrackingCode: null, reasonFa: 'میکروچیپ این حیوان هنوز ثبت نشده است.' };
  }

  const collected = await database
    .select()
    .from(samples)
    .where(eq(samples.animalId, animalId))
    .orderBy(desc(samples.collectedAt));
  const usable = collected.find((row) => !isUnusable(row.status)) ?? null;
  if (!usable) {
    return {
      ...base,
      ready: false,
      microchipNumber: chip.number,
      sampleTrackingCode: null,
      reasonFa: collected.length === 0 ? 'نمونه خون این حیوان هنوز ثبت نشده است.' : 'نمونه این حیوان قابل استفاده نیست؛ نمونه‌گیری مجدد لازم است.',
    };
  }

  return {
    ...base,
    ready: true,
    microchipNumber: chip.number,
    sampleTrackingCode: usable.trackingCode,
    reasonFa: null,
  };
}

/** The animals a person may put in a registration-sheet checkout right now. */
export async function selectableAnimals(
  database: DbClient,
  actor: Actor,
): Promise<readonly AnimalReadiness[]> {
  const rows = await database
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'REGISTERED')));

  const readiness = await Promise.all(rows.map((row) => readinessOf(database, actor.accountId, row.id)));
  // An animal already sitting in an unpaid batch is not offered twice.
  const pending = await database
    .select({ animalId: registrationSheetItems.animalId })
    .from(registrationSheetItems)
    .where(
      and(
        eq(registrationSheetItems.ownerAccountId, actor.accountId),
        inArray(registrationSheetItems.state, ['AWAITING_PAYMENT', 'AWAITING_ISSUANCE']),
      ),
    );
  const busy = new Set(pending.map((p) => p.animalId));
  return readiness.filter((row) => !busy.has(row.animalId));
}

export interface CreatedRequest {
  readonly batch: BatchRecord;
  readonly items: readonly SheetItemRecord[];
}

/**
 * Builds one batch with one line per animal (§13 step 6).
 *
 * The price comes from the current database tariff at this moment and is frozen
 * on the item; a tariff that has never been entered stops the checkout with a
 * named reason instead of assuming a number.
 */
export async function createSheetRequest(
  database: Database,
  actor: Actor,
  animalIds: readonly string[],
): Promise<CreatedRequest> {
  await assertEligible(database, actor.accountId, 'REGISTRATION_SHEET');
  const unique = [...new Set(animalIds)];
  if (unique.length === 0) throw validation('حداقل یک حیوان انتخاب کنید.');

  for (const animalId of unique) {
    const readiness = await readinessOf(database, actor.accountId, animalId);
    // §13: the money step never runs ahead of the microchip and the sample.
    if (!readiness.ready) throw conflict(readiness.reasonFa ?? 'این حیوان هنوز واجد شرایط صدور نیست.');
  }

  const batch = await createBatch(database, actor, {
    service: 'REGISTRATION_SHEET',
    items: unique.map((animalId) => ({
      targetType: 'ANIMAL',
      targetId: animalId,
      settingKey: REGISTRATION_SHEET_FEE_KEY,
    })),
    resume: {
      entity: { type: 'ANIMAL', id: unique[0]! },
      step: 'REGISTRATION_SHEET_PAYMENT',
      originRoute: '/registration/batch',
    },
  });

  const lines = await database.select().from(paymentItems).where(eq(paymentItems.batchId, batch.id));

  return database.transaction(async (tx) => {
    const items: SheetItemRecord[] = [];
    for (const animalId of unique) {
      const line = lines.find((l) => l.targetId === animalId)!;
      const [row] = await tx
        .insert(registrationSheetItems)
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
      action: 'REGISTRATION_SHEET_REQUESTED',
      targetType: 'PAYMENT_BATCH',
      targetId: batch.id,
      after: { animals: unique, itemCount: items.length },
    });
    // Resume context lives on the batch; the request itself is the batch.
    return { batch, items };
  });
}

/**
 * Issues the sheets of one paid batch — §13 step 7.
 *
 * It runs inside the verifying transaction and is written to be repeatable: the
 * unique index on the animal is what makes a retried callback or a retried
 * issuance produce one document rather than two. Prerequisites are checked
 * again here, because time passed since the batch was created, and an animal
 * that no longer qualifies is blocked with a reason while the others proceed.
 */
export async function issueForBatch(tx: DbClient, batch: BatchRecord): Promise<void> {
  const items = await tx
    .select()
    .from(registrationSheetItems)
    .where(eq(registrationSheetItems.batchId, batch.id));

  for (const item of items) {
    if (item.state === 'ISSUED') continue;

    const [already] = await tx
      .select()
      .from(registrationSheets)
      .where(eq(registrationSheets.animalId, item.animalId))
      .limit(1);
    if (already) {
      // Someone else's batch, or an earlier retry, already issued it.
      await tx
        .update(registrationSheetItems)
        .set({ state: 'ISSUED', version: item.version + 1, updatedAt: new Date() })
        .where(eq(registrationSheetItems.id, item.id));
      continue;
    }

    const readiness = await readinessOf(tx, item.ownerAccountId, item.animalId);
    if (!readiness.ready || !readiness.microchipNumber || !readiness.sampleTrackingCode) {
      await tx
        .update(registrationSheetItems)
        .set({
          state: 'BLOCKED',
          blockedReasonFa: readiness.reasonFa ?? 'شرایط صدور برای این حیوان کامل نیست.',
          version: item.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(registrationSheetItems.id, item.id));
      await recordAudit(tx, null, {
        action: 'REGISTRATION_SHEET_BLOCKED',
        targetType: 'ANIMAL',
        targetId: item.animalId,
        reason: readiness.reasonFa,
        after: { batchId: batch.id, itemId: item.id },
      });
      await createNotification(tx, {
        recipientAccountId: item.ownerAccountId,
        kind: 'REGISTRATION_SHEET_BLOCKED',
        titleFa: 'صدور برگه ثبتی این حیوان انجام نشد',
        bodyFa:
          (readiness.reasonFa ?? 'شرایط صدور کامل نیست.') +
          ' پرداخت این قلم محفوظ است و پس از رفع مشکل صدور انجام می‌شود.',
        resume: {
          entity: { type: 'ANIMAL', id: item.animalId },
          step: 'REGISTRATION_SHEET',
          originRoute: '/registration/' + batch.id,
        },
      });
      continue;
    }

    const petId = newPetId();
    const [sheet] = await tx
      .insert(registrationSheets)
      .values({
        animalId: item.animalId,
        ownerAccountId: item.ownerAccountId,
        itemId: item.id,
        batchId: batch.id,
        sheetNo: newRegistrationSheetNo(),
        petId,
        microchipNumber: readiness.microchipNumber,
        sampleTrackingCode: readiness.sampleTrackingCode,
      })
      .returning();
    if (!sheet) throw conflict('صدور برگه ثبتی انجام نشد.');

    // The animal carries its official identifier from here on.
    await tx.update(animals).set({ petId, updatedAt: new Date() }).where(eq(animals.id, item.animalId));
    await tx
      .update(registrationSheetItems)
      .set({ state: 'ISSUED', blockedReasonFa: null, version: item.version + 1, updatedAt: new Date() })
      .where(eq(registrationSheetItems.id, item.id));

    await recordAudit(tx, null, {
      action: 'REGISTRATION_SHEET_ISSUED',
      targetType: 'ANIMAL',
      targetId: item.animalId,
      after: { sheetId: sheet.id, sheetNo: sheet.sheetNo, batchId: batch.id },
    });
    await createNotification(tx, {
      recipientAccountId: item.ownerAccountId,
      kind: 'REGISTRATION_SHEET_ISSUED',
      titleFa: 'برگه ثبتی این حیوان صادر شد',
      bodyFa: SAMPLE_TAKEN_NOTE_FA + ' برگه ثبتی به معنی نتیجه ژنتیک یا شجره‌نامه نیست.',
      resume: {
        entity: { type: 'ANIMAL', id: item.animalId },
        step: 'REGISTRATION_SHEET',
        originRoute: '/documents/' + sheet.id,
      },
    });
  }
}

/**
 * A second attempt at a blocked item, with no new money — §13.
 *
 * The source gives no refund or extra-charge policy, so none is invented: the
 * paid snapshot stays exactly as it was and the only permitted edit after
 * payment is trying the issuance again once the missing prerequisite exists.
 */
export async function retryIssuance(
  database: Database,
  actor: Actor,
  batchId: string,
): Promise<readonly SheetItemRecord[]> {
  const [batch] = await database.select().from(paymentBatches).where(eq(paymentBatches.id, batchId)).limit(1);
  if (!batch || batch.accountId !== actor.accountId) throw notFound('درخواست برگه ثبتی پیدا نشد.');
  if (batch.status !== 'PAID') throw conflict('این درخواست هنوز پرداخت تأییدشده ندارد.');

  await database.transaction(async (tx) => {
    await issueForBatch(tx, {
      id: batch.id,
      accountId: batch.accountId,
      service: 'REGISTRATION_SHEET',
      status: 'PAID',
      resumeContext: batch.resumeContext as never,
      version: batch.version,
    });
    await recordAudit(tx, actor, {
      action: 'REGISTRATION_SHEET_ISSUANCE_RETRIED',
      targetType: 'PAYMENT_BATCH',
      targetId: batch.id,
    });
  });

  return itemsOfBatch(database, batchId);
}

export async function itemsOfBatch(
  database: DbClient,
  batchId: string,
): Promise<readonly SheetItemRecord[]> {
  return database
    .select()
    .from(registrationSheetItems)
    .where(eq(registrationSheetItems.batchId, batchId))
    .orderBy(registrationSheetItems.createdAt);
}

/** Marks the items of a batch as awaiting issuance once the money is verified. */
export async function markBatchPaid(tx: DbClient, batchId: string): Promise<void> {
  await tx
    .update(registrationSheetItems)
    .set({ state: 'AWAITING_ISSUANCE', updatedAt: new Date() })
    .where(
      and(eq(registrationSheetItems.batchId, batchId), eq(registrationSheetItems.state, 'AWAITING_PAYMENT')),
    );
}

export async function sheetOfAnimal(database: DbClient, animalId: string): Promise<SheetRecord | null> {
  const [row] = await database
    .select()
    .from(registrationSheets)
    .where(eq(registrationSheets.animalId, animalId))
    .limit(1);
  return row ?? null;
}

/** Secure retrieval: the document is readable by its owner and nobody else. */
export async function sheetForOwner(
  database: DbClient,
  actor: Actor,
  sheetId: string,
): Promise<SheetRecord> {
  const [row] = await database.select().from(registrationSheets).where(eq(registrationSheets.id, sheetId)).limit(1);
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('برگه ثبتی پیدا نشد.');
  return row;
}

export async function sheetsOfOwner(database: DbClient, actor: Actor): Promise<readonly SheetRecord[]> {
  return database
    .select()
    .from(registrationSheets)
    .where(eq(registrationSheets.ownerAccountId, actor.accountId))
    .orderBy(desc(registrationSheets.issuedAt));
}

export async function countSheetsOfOwner(database: DbClient, accountId: string): Promise<number> {
  const rows = await database
    .select({ id: registrationSheets.id })
    .from(registrationSheets)
    .where(eq(registrationSheets.ownerAccountId, accountId));
  return rows.length;
}

/** Batches this person has open or paid, newest first (§8). */
export async function sheetBatchesOfOwner(database: DbClient, actor: Actor) {
  return database
    .select()
    .from(paymentBatches)
    .where(
      and(eq(paymentBatches.accountId, actor.accountId), eq(paymentBatches.service, 'REGISTRATION_SHEET')),
    )
    .orderBy(desc(paymentBatches.createdAt));
}
