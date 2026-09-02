/**
 * Genetics centre workflow — §14, D07, D09, D16.
 *
 * The centre never takes a sample. It reviews the receipt, records that the
 * sample arrived, judges whether it can be used, processes it and records the
 * Parentage Result. Everything else — ownership, microchip, permits — is
 * outside its authority and no function here gives it one.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { sampleEvents as sampleEventsTable, samples } from '../db/schema/clinical.ts';
import { registrationSheets } from '../db/schema/documents.ts';
import { geneticsReceiptItems, geneticsReceipts, parentageResults } from '../db/schema/genetics.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { putPrivateFile } from '../files/storage.ts';
import { readSetting } from '../settings/service.ts';
import { assertEligible } from '../domain/eligibility/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { isUnusable } from '../domain/microchip.ts';
import type { Actor } from '../authz/actor.ts';

export type ReceiptRecord = typeof geneticsReceipts.$inferSelect;
export type ReceiptItemRecord = typeof geneticsReceiptItems.$inferSelect;
export type ResultRecord = typeof parentageResults.$inferSelect;

export const RECEIPT_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  UNDER_REVIEW: 'در حال بررسی مرکز',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
};

export const RESULT_STATUS_FA: Record<string, string> = {
  WAITING_PARENT_RESULTS: 'در انتظار تکمیل نتایج والدین',
  TECHNICAL_REVIEW: 'در مرحله تأیید فنی',
  FINAL: 'نتیجه نهایی',
};

/** The one fixed centre (D07). There is no selector and never more than one. */
export interface CentreDetails {
  readonly nameFa: string | null;
  readonly phone: string | null;
  readonly addressFa: string | null;
  readonly paymentAccount: string | null;
  readonly paymentCard: string | null;
  readonly configured: boolean;
}

export async function centreDetails(database: DbClient): Promise<CentreDetails> {
  const read = async (key: string): Promise<string | null> => {
    const row = await readSetting(database, key);
    return row.value === null ? null : String(row.value);
  };
  const [nameFa, phone, addressFa, paymentAccount, paymentCard] = await Promise.all([
    read('genetics_centre.name'),
    read('genetics_centre.contact_phone'),
    read('genetics_centre.address'),
    read('genetics_centre.payment_account'),
    read('genetics_centre.payment_card'),
  ]);
  return {
    nameFa,
    phone,
    addressFa,
    paymentAccount,
    paymentCard,
    // The transfer information is only usable when the centre is named and at
    // least one destination for the payment is actually on record.
    configured: nameFa !== null && (paymentAccount !== null || paymentCard !== null),
  };
}

export interface PedigreeReadiness {
  readonly animalId: string;
  readonly name: string | null;
  readonly ready: boolean;
  readonly sampleId: string | null;
  readonly sampleTrackingCode: string | null;
  readonly custodyAccountId: string | null;
  readonly reasonFa: string | null;
}

/**
 * §14.1: the ordinary pedigree route reuses what already exists.
 *
 * A registration sheet, a usable sample and a known custodian are the entry
 * conditions, and none of them is asked for again: no veterinarian is chosen
 * here and no new collection happens.
 */
export async function pedigreeReadiness(
  database: DbClient,
  ownerAccountId: string,
  animalId: string,
): Promise<PedigreeReadiness> {
  const [animal] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  if (!animal || animal.ownerAccountId !== ownerAccountId) throw notFound('پرونده حیوان پیدا نشد.');
  const base = { animalId, name: animal.name, sampleId: null, sampleTrackingCode: null, custodyAccountId: null };

  const [sheet] = await database
    .select({ id: registrationSheets.id })
    .from(registrationSheets)
    .where(eq(registrationSheets.animalId, animalId))
    .limit(1);
  if (!sheet) return { ...base, ready: false, reasonFa: 'این حیوان هنوز برگه ثبتی ندارد.' };

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
      reasonFa: collected.length === 0 ? 'نمونه این حیوان ثبت نشده است.' : 'نمونه این حیوان قابل استفاده نیست؛ نمونه‌گیری مجدد لازم است.',
    };
  }

  const [existing] = await database
    .select({ id: geneticsReceiptItems.id, status: geneticsReceipts.status })
    .from(geneticsReceiptItems)
    .innerJoin(geneticsReceipts, eq(geneticsReceipts.id, geneticsReceiptItems.receiptId))
    .where(
      and(
        eq(geneticsReceiptItems.sampleId, usable.id),
        inArray(geneticsReceipts.status, ['DRAFT', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED']),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ...base,
      ready: false,
      sampleId: usable.id,
      sampleTrackingCode: usable.trackingCode,
      custodyAccountId: usable.custodyAccountId,
      reasonFa: 'برای نمونه این حیوان فیشی ثبت شده است.',
    };
  }

  return {
    ...base,
    ready: true,
    sampleId: usable.id,
    sampleTrackingCode: usable.trackingCode,
    custodyAccountId: usable.custodyAccountId,
    reasonFa: null,
  };
}

export async function selectableForPedigree(
  database: DbClient,
  actor: Actor,
): Promise<readonly PedigreeReadiness[]> {
  const rows = await database
    .select({ id: animals.id })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'REGISTERED')));
  return Promise.all(rows.map((row) => pedigreeReadiness(database, actor.accountId, row.id)));
}

// ── Receipt, owner side ───────────────────────────────────────────────────

/**
 * Creates the receipt record for a direct payment to the centre.
 *
 * The receipt is mapped to the exact sample codes of the chosen animals, so
 * what the centre reviews and what arrives in the post are the same
 * identifiers (§14.1 step 3).
 */
export async function createReceipt(
  database: Database,
  actor: Actor,
  animalIds: readonly string[],
): Promise<ReceiptRecord> {
  await assertEligible(database, actor.accountId, 'PEDIGREE');
  const unique = [...new Set(animalIds)];
  if (unique.length === 0) throw validation('حداقل یک حیوان انتخاب کنید.');

  const centre = await centreDetails(database);
  if (!centre.configured) {
    throw validation('اطلاعات پرداخت مرکز ژنتیک هنوز ثبت نشده است؛ تا ورود داده واقعی، ثبت فیش ممکن نیست.');
  }

  const ready = await Promise.all(unique.map((id) => pedigreeReadiness(database, actor.accountId, id)));
  for (const row of ready) {
    if (!row.ready) throw conflict(row.reasonFa ?? 'این حیوان واجد شرایط این مسیر نیست.');
  }

  return database.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(geneticsReceipts)
      .values({ ownerAccountId: actor.accountId })
      .returning();
    if (!receipt) throw conflict('ثبت فیش انجام نشد.');

    for (const row of ready) {
      await tx.insert(geneticsReceiptItems).values({
        receiptId: receipt.id,
        animalId: row.animalId,
        sampleId: row.sampleId!,
      });
    }
    await recordAudit(tx, actor, {
      action: 'GENETICS_RECEIPT_CREATED',
      targetType: 'GENETICS_RECEIPT',
      targetId: receipt.id,
      after: { animals: unique, samples: ready.map((r) => r.sampleId) },
    });
    return receipt;
  });
}

export async function findReceipt(database: DbClient, id: string): Promise<ReceiptRecord | null> {
  const [row] = await database.select().from(geneticsReceipts).where(eq(geneticsReceipts.id, id)).limit(1);
  return row ?? null;
}

export async function ownerReceipt(
  database: DbClient,
  actor: Actor,
  id: string,
): Promise<ReceiptRecord> {
  const row = await findReceipt(database, id);
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('فیش پیدا نشد.');
  return row;
}

export async function receiptItems(
  database: DbClient,
  receiptId: string,
): Promise<readonly ReceiptItemRecord[]> {
  return database.select().from(geneticsReceiptItems).where(eq(geneticsReceiptItems.receiptId, receiptId));
}

export async function receiptsOfOwner(database: DbClient, actor: Actor): Promise<readonly ReceiptRecord[]> {
  return database
    .select()
    .from(geneticsReceipts)
    .where(eq(geneticsReceipts.ownerAccountId, actor.accountId))
    .orderBy(desc(geneticsReceipts.createdAt));
}

/** Uploading again replaces the image but keeps the same receipt and history. */
export async function attachReceiptFile(
  database: Database,
  storageRoot: string,
  actor: Actor,
  receiptId: string,
  file: { bytes: Uint8Array; originalName?: string },
): Promise<ReceiptRecord> {
  const receipt = await ownerReceipt(database, actor, receiptId);
  if (receipt.status === 'APPROVED') throw conflict('این فیش تأیید شده است و تغییر نمی‌کند.');

  const stored = await putPrivateFile(database, storageRoot, actor, {
    ownerAccountId: actor.accountId,
    purpose: 'GENETICS_RECEIPT',
    bytes: file.bytes,
    originalName: file.originalName ?? null,
  });

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(geneticsReceipts)
      .set({ fileId: stored.id, version: receipt.version + 1, updatedAt: new Date() })
      .where(and(eq(geneticsReceipts.id, receiptId), eq(geneticsReceipts.version, receipt.version)))
      .returning();
    if (!row) throw conflict('این فیش هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'GENETICS_RECEIPT_FILE_ATTACHED',
      targetType: 'GENETICS_RECEIPT',
      targetId: receiptId,
      targetVersion: row.version,
    });
    return row;
  });
}

export async function submitReceipt(
  database: Database,
  actor: Actor,
  receiptId: string,
  payerNoteFa?: string | null,
): Promise<ReceiptRecord> {
  const receipt = await ownerReceipt(database, actor, receiptId);
  if (receipt.status === 'APPROVED') throw conflict('این فیش تأیید شده است.');
  if (receipt.status === 'UNDER_REVIEW') throw conflict('این فیش در صف بررسی مرکز است.');
  if (!receipt.fileId) throw validation('ابتدا تصویر فیش را بارگذاری کنید.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(geneticsReceipts)
      .set({
        status: 'UNDER_REVIEW',
        payerNoteFa: payerNoteFa?.trim() || receipt.payerNoteFa,
        submittedAt: new Date(),
        version: receipt.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(geneticsReceipts.id, receiptId), eq(geneticsReceipts.version, receipt.version)))
      .returning();
    if (!row) throw conflict('این فیش هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'GENETICS_RECEIPT_SUBMITTED',
      targetType: 'GENETICS_RECEIPT',
      targetId: receiptId,
      targetVersion: row.version,
      before: { status: receipt.status },
      after: { status: 'UNDER_REVIEW' },
    });
    return row;
  });
}

// ── Receipt, centre side ──────────────────────────────────────────────────

function assertCentre(actor: Actor): void {
  if (actor.context !== 'GENETICS_OPERATOR') throw forbidden('این عملیات فقط در محیط مرکز ژنتیک انجام می‌شود.');
}

export async function receiptQueue(database: DbClient, actor: Actor): Promise<readonly ReceiptRecord[]> {
  assertCentre(actor);
  return database
    .select()
    .from(geneticsReceipts)
    .where(inArray(geneticsReceipts.status, ['UNDER_REVIEW', 'NEEDS_CORRECTION']))
    .orderBy(geneticsReceipts.submittedAt);
}

export interface ReceiptDecision {
  readonly receiptId: string;
  readonly decision: 'APPROVED' | 'NEEDS_CORRECTION' | 'REJECTED';
  readonly reasonFa?: string | null;
  readonly expectedVersion?: number;
}

/**
 * The centre's decision on a receipt — §14.1 steps 4 and 5.
 *
 * Approving it tells the payer and the veterinarian who is actually holding
 * each sample that it should be sent. Approving a receipt is not a Hamzist
 * payment and unlocks no document by itself (§14.2, §22).
 */
export async function reviewReceipt(
  database: Database,
  actor: Actor,
  input: ReceiptDecision,
): Promise<ReceiptRecord> {
  assertCentre(actor);
  const receipt = await findReceipt(database, input.receiptId);
  if (!receipt) throw notFound('فیش پیدا نشد.');
  if (receipt.status !== 'UNDER_REVIEW') throw conflict('این فیش در انتظار بررسی نیست.');
  if (input.expectedVersion !== undefined && input.expectedVersion !== receipt.version) {
    throw versionStale(input.expectedVersion, receipt.version);
  }
  const reason = (input.reasonFa ?? '').trim();
  if (input.decision !== 'APPROVED' && reason.length < 3) throw validation('ثبت دلیل الزامی است.');

  const items = await receiptItems(database, input.receiptId);

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(geneticsReceipts)
      .set({
        status: input.decision,
        reasonFa: input.decision === 'APPROVED' ? null : reason,
        reviewedByAccountId: actor.accountId,
        reviewedAt: new Date(),
        version: receipt.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(geneticsReceipts.id, receipt.id), eq(geneticsReceipts.version, receipt.version)))
      .returning();
    if (!row) throw conflict('این فیش هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'GENETICS_RECEIPT_REVIEWED',
      targetType: 'GENETICS_RECEIPT',
      targetId: receipt.id,
      targetVersion: row.version,
      reason: input.decision === 'APPROVED' ? null : reason,
      before: { status: receipt.status },
      after: { status: input.decision },
    });

    if (input.decision === 'APPROVED') {
      // Each sample of this receipt is now expected at the centre, and the
      // custodian who actually holds it is the one asked to send it (D07).
      for (const item of items) {
        const [sample] = await tx.select().from(samples).where(eq(samples.id, item.sampleId)).limit(1);
        if (!sample || sample.status !== 'IN_CUSTODY') continue;
        await tx
          .update(samples)
          .set({
            status: 'SEND_INSTRUCTED',
            sendInstructedAt: new Date(),
            version: sample.version + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(samples.id, sample.id), eq(samples.version, sample.version)));
        await createNotification(tx, {
          recipientAccountId: sample.custodyAccountId,
          kind: 'SAMPLE_SEND_INSTRUCTED',
          titleFa: 'ارسال نمونه به مرکز ژنتیک',
          bodyFa: 'فیش این نمونه تأیید شد؛ ارسال را روی همان کد رهگیری ثبت کنید.',
          resume: {
            entity: { type: 'SAMPLE', id: sample.id },
            step: 'SHIPMENT',
            originRoute: '/vet/samples',
          },
        });
      }
    }

    await createNotification(tx, {
      recipientAccountId: receipt.ownerAccountId,
      kind: 'GENETICS_RECEIPT_' + input.decision,
      titleFa:
        input.decision === 'APPROVED'
          ? 'فیش شما تأیید شد'
          : input.decision === 'NEEDS_CORRECTION'
            ? 'فیش شما نیازمند اصلاح است'
            : 'فیش شما رد شد',
      bodyFa:
        input.decision === 'APPROVED'
          ? 'مرکز ژنتیک فیش را تأیید کرد و از دامپزشک نگهدارنده خواسته شد نمونه را ارسال کند.'
          : reason,
      resume: {
        entity: { type: 'GENETICS_RECEIPT', id: receipt.id },
        step: 'RECEIPT',
        originRoute: '/pedigree/receipts/' + receipt.id,
      },
    });

    return row;
  });
}

// ── Sample handling at the centre ─────────────────────────────────────────

/** The centre records that a shipped sample arrived (§14.2). */
export async function receiveSample(
  database: Database,
  actor: Actor,
  sampleId: string,
): Promise<void> {
  assertCentre(actor);
  const [sample] = await database.select().from(samples).where(eq(samples.id, sampleId)).limit(1);
  if (!sample) throw notFound('نمونه پیدا نشد.');
  if (sample.status !== 'SHIPPED') throw conflict('این نمونه هنوز ارسال نشده است.');

  await database.transaction(async (tx) => {
    await tx
      .update(samples)
      .set({ status: 'RECEIVED', version: sample.version + 1, updatedAt: new Date() })
      .where(and(eq(samples.id, sampleId), eq(samples.version, sample.version)));
    await tx.insert(sampleEventsTable).values({ sampleId, kind: 'RECEIVED', byAccountId: actor.accountId });
    await recordAudit(tx, actor, {
      action: 'SAMPLE_RECEIVED',
      targetType: 'SAMPLE',
      targetId: sampleId,
      after: { status: 'RECEIVED' },
    });
    await createNotification(tx, {
      recipientAccountId: (await ownerOfSample(tx, sampleId)) ?? actor.accountId,
      kind: 'SAMPLE_RECEIVED',
      titleFa: 'نمونه در مرکز ژنتیک دریافت شد',
      bodyFa: 'نمونه با همان کد رهگیری در مرکز ثبت شد. پردازش، مستقل از پرداخت صدور سند انجام می‌شود.',
      resume: {
        entity: { type: 'SAMPLE', id: sampleId },
        step: 'RECEIVED',
        originRoute: '/pedigree',
      },
    });
  });
}

/** Processing starts at the centre and never waits for a Hamzist payment (§14.2). */
export async function startProcessing(
  database: Database,
  actor: Actor,
  sampleId: string,
): Promise<void> {
  assertCentre(actor);
  const [sample] = await database.select().from(samples).where(eq(samples.id, sampleId)).limit(1);
  if (!sample) throw notFound('نمونه پیدا نشد.');
  if (sample.status !== 'RECEIVED') throw conflict('این نمونه در وضعیت دریافت‌شده نیست.');

  await database.transaction(async (tx) => {
    await tx
      .update(samples)
      .set({ status: 'PROCESSING', version: sample.version + 1, updatedAt: new Date() })
      .where(and(eq(samples.id, sampleId), eq(samples.version, sample.version)));
    await tx
      .insert(sampleEventsTable)
      .values({ sampleId, kind: 'PROCESSING_STARTED', byAccountId: actor.accountId });
    await recordAudit(tx, actor, {
      action: 'SAMPLE_PROCESSING_STARTED',
      targetType: 'SAMPLE',
      targetId: sampleId,
      after: { status: 'PROCESSING' },
    });
  });
}

async function ownerOfSample(tx: DbClient, sampleId: string): Promise<string | null> {
  const [row] = await tx
    .select({ ownerAccountId: animals.ownerAccountId })
    .from(samples)
    .innerJoin(animals, eq(animals.id, samples.animalId))
    .where(eq(samples.id, sampleId))
    .limit(1);
  return row?.ownerAccountId ?? null;
}

// ── Parentage results ─────────────────────────────────────────────────────

export async function resultOfAnimal(database: DbClient, animalId: string): Promise<ResultRecord | null> {
  const [row] = await database
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.animalId, animalId))
    .orderBy(desc(parentageResults.resultVersion))
    .limit(1);
  return row ?? null;
}

export async function finalResultOf(database: DbClient, animalId: string): Promise<ResultRecord | null> {
  const row = await resultOfAnimal(database, animalId);
  return row?.status === 'FINAL' ? row : null;
}

export type ParentCheck =
  | { readonly state: 'READY'; readonly sireResultId: string | null; readonly damResultId: string | null }
  | { readonly state: 'WAITING'; readonly missingFa: string };

/**
 * §14.3 for G1+: both direct parents need a complete, resolvable result.
 *
 * A missing one is a wait, never a final result with a hole in it. Ancestry
 * above the parents is read from their own records rather than recomputed here.
 */
export async function parentResultCheck(
  database: DbClient,
  animalId: string,
): Promise<ParentCheck> {
  const [animal] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  if (!animal) throw notFound('پرونده حیوان پیدا نشد.');
  if (animal.generation === 0 || (animal.sireAnimalId === null && animal.damAnimalId === null)) {
    // G0: the centre attaches the result to the animal directly (§14.3).
    return { state: 'READY', sireResultId: null, damResultId: null };
  }

  const missing: string[] = [];
  let sireResultId: string | null = null;
  let damResultId: string | null = null;

  if (animal.sireAnimalId) {
    const result = await finalResultOf(database, animal.sireAnimalId);
    if (!result) missing.push('پدر');
    else sireResultId = result.id;
  } else {
    missing.push('پدر');
  }
  if (animal.damAnimalId) {
    const result = await finalResultOf(database, animal.damAnimalId);
    if (!result) missing.push('مادر');
    else damResultId = result.id;
  } else {
    missing.push('مادر');
  }

  if (missing.length > 0) {
    return { state: 'WAITING', missingFa: 'نتیجه ' + missing.join(' و ') + ' هنوز کامل نیست.' };
  }
  return { state: 'READY', sireResultId, damResultId };
}

export interface RecordResultInput {
  readonly sampleId: string;
  readonly technicalNoteFa?: string | null;
  /** A corrected result is a new version of the same thing (§14.5). */
  readonly supersedesResultId?: string | null;
}

/**
 * Records the Parentage Result — §14.3.
 *
 * There is one genetic output and one identifier for it. A G1+ animal whose
 * parents are not both complete gets a result in the waiting state, which is
 * visible and honest, rather than a final result that is not true yet.
 */
export async function recordResult(
  database: Database,
  actor: Actor,
  input: RecordResultInput,
): Promise<ResultRecord> {
  assertCentre(actor);
  const [sample] = await database.select().from(samples).where(eq(samples.id, input.sampleId)).limit(1);
  if (!sample) throw notFound('نمونه پیدا نشد.');
  if (sample.status !== 'PROCESSING') throw conflict('برای ثبت نتیجه، نمونه باید در حال پردازش باشد.');

  const check = await parentResultCheck(database, sample.animalId);
  const previous = await resultOfAnimal(database, sample.animalId);
  const nextVersion = (previous?.resultVersion ?? 0) + 1;

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(parentageResults)
      .values({
        animalId: sample.animalId,
        sampleId: sample.id,
        status: check.state === 'READY' ? 'FINAL' : 'WAITING_PARENT_RESULTS',
        resultVersion: nextVersion,
        supersedesResultId: input.supersedesResultId ?? previous?.id ?? null,
        sireResultId: check.state === 'READY' ? check.sireResultId : null,
        damResultId: check.state === 'READY' ? check.damResultId : null,
        technicalNoteFa: input.technicalNoteFa?.trim() || null,
        recordedByAccountId: actor.accountId,
        processedAt: new Date(),
        finalisedAt: check.state === 'READY' ? new Date() : null,
      })
      .returning();
    if (!row) throw conflict('ثبت نتیجه انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'PARENTAGE_RESULT_RECORDED',
      targetType: 'ANIMAL',
      targetId: sample.animalId,
      after: { resultId: row.id, status: row.status, resultVersion: row.resultVersion },
    });
    const ownerAccountId = await ownerOfSample(tx, sample.id);
    if (ownerAccountId) {
      await createNotification(tx, {
        recipientAccountId: ownerAccountId,
        kind: 'PARENTAGE_RESULT_' + row.status,
        titleFa: row.status === 'FINAL' ? 'نتیجه Parentage ثبت شد' : 'نتیجه در انتظار تکمیل نتایج والدین است',
        bodyFa:
          row.status === 'FINAL'
            ? 'نتیجه در پرونده حیوان قابل مشاهده است؛ صدور شجره‌نامه پرداخت جداگانه دارد.'
            : (check.state === 'WAITING' ? check.missingFa : '') + ' نتیجه ناقص به‌عنوان نتیجه نهایی ثبت نمی‌شود.',
        resume: {
          entity: { type: 'PARENTAGE_RESULT', id: row.id },
          step: 'RESULT',
          originRoute: '/pedigree/' + sample.animalId,
        },
      });
    }
    return row;
  });
}

/**
 * Re-checks a waiting result once the parents' results exist (§14.3).
 *
 * It finalises the same result rather than issuing a second identifier for it.
 */
export async function refreshWaitingResult(
  database: Database,
  actor: Actor,
  resultId: string,
): Promise<ResultRecord> {
  assertCentre(actor);
  const [current] = await database
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.id, resultId))
    .limit(1);
  if (!current) throw notFound('نتیجه پیدا نشد.');
  if (current.status !== 'WAITING_PARENT_RESULTS') throw conflict('این نتیجه در انتظار والدین نیست.');

  const check = await parentResultCheck(database, current.animalId);
  if (check.state === 'WAITING') throw conflict(check.missingFa);

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(parentageResults)
      .set({
        status: 'FINAL',
        sireResultId: check.sireResultId,
        damResultId: check.damResultId,
        finalisedAt: new Date(),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(parentageResults.id, resultId), eq(parentageResults.version, current.version)))
      .returning();
    if (!row) throw conflict('این نتیجه هم‌زمان تغییر کرده است.');
    await recordAudit(tx, actor, {
      action: 'PARENTAGE_RESULT_FINALISED',
      targetType: 'ANIMAL',
      targetId: current.animalId,
      after: { resultId: row.id, status: 'FINAL' },
    });
    const ownerAccountId = await ownerOfSample(tx, current.sampleId);
    if (ownerAccountId) {
      await createNotification(tx, {
        recipientAccountId: ownerAccountId,
        kind: 'PARENTAGE_RESULT_FINAL',
        titleFa: 'نتیجه Parentage نهایی شد',
        bodyFa: 'نتایج والدین کامل شد و نتیجه این حیوان نهایی است.',
        resume: {
          entity: { type: 'PARENTAGE_RESULT', id: row.id },
          step: 'RESULT',
          originRoute: '/pedigree/' + current.animalId,
        },
      });
    }
    return row;
  });
}

/** The centre's own work list, by sample state (§21.3). */
export async function centreSamples(
  database: DbClient,
  actor: Actor,
  statuses: readonly (
    | 'IN_CUSTODY'
    | 'SEND_INSTRUCTED'
    | 'SHIPPED'
    | 'RECEIVED'
    | 'PROCESSING'
    | 'INVALID'
  )[],
) {
  assertCentre(actor);
  return database
    .select({
      sample: samples,
      animalId: animals.id,
      animalName: animals.name,
      generation: animals.generation,
    })
    .from(samples)
    .innerJoin(animals, eq(animals.id, samples.animalId))
    .where(inArray(samples.status, [...statuses]))
    .orderBy(desc(samples.collectedAt));
}

/** The owner's view of one animal's result, scoped to their own animal. */
export async function ownerResult(
  database: DbClient,
  actor: Actor,
  animalId: string,
): Promise<ResultRecord | null> {
  const [animal] = await database.select().from(animals).where(eq(animals.id, animalId)).limit(1);
  if (!animal || animal.ownerAccountId !== actor.accountId) throw notFound('پرونده حیوان پیدا نشد.');
  return resultOfAnimal(database, animalId);
}
