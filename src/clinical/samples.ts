/**
 * Blood samples, custody and resampling — §12.4, D07.
 *
 * The tracking code is issued only after a sample has actually been taken. It
 * is a different identifier from the referral code and the two are never mixed:
 * one is permission to be seen, the other names a tube in a fridge.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { vetVisitRequests } from '../db/schema/vets.ts';
import { sampleEvents, samples } from '../db/schema/clinical.ts';
import { recordAudit } from '../audit/service.ts';
import { issuePaidSheetsForAnimal } from '../documents/registration-sheet.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { newSampleTrackingCode } from '../domain/ids.ts';
import { isUnusable, samplingRequiredFor, type UnusableStatus } from '../domain/microchip.ts';
import { chipWorkDone, requireOpenVisit } from './microchip.ts';
import type { Actor } from '../authz/actor.ts';

export type SampleRecord = typeof samples.$inferSelect;
export type SampleEventRecord = typeof sampleEvents.$inferSelect;

const LIVE_STATUSES = ['IN_CUSTODY', 'SEND_INSTRUCTED', 'SHIPPED'] as const;

async function addEvent(
  tx: DbClient,
  sampleId: string,
  kind: SampleEventRecord['kind'],
  actor: Actor | null,
  noteFa?: string | null,
): Promise<void> {
  await tx.insert(sampleEvents).values({
    sampleId,
    kind,
    byAccountId: actor?.accountId ?? null,
    noteFa: noteFa ?? null,
  });
}

export async function samplesOfRequest(
  database: DbClient,
  requestId: string,
): Promise<readonly SampleRecord[]> {
  return database
    .select()
    .from(samples)
    .where(eq(samples.requestId, requestId))
    .orderBy(desc(samples.collectedAt));
}

export async function latestSample(database: DbClient, requestId: string): Promise<SampleRecord | null> {
  const rows = await samplesOfRequest(database, requestId);
  return rows[0] ?? null;
}

export async function eventsOfSample(
  database: DbClient,
  sampleId: string,
): Promise<readonly SampleEventRecord[]> {
  return database
    .select()
    .from(sampleEvents)
    .where(eq(sampleEvents.sampleId, sampleId))
    .orderBy(sampleEvents.occurredAt);
}

/**
 * Records a collection that has already happened — §12.4.
 *
 * The code exists because the sample does, never the other way round, so there
 * is no path here that issues one in advance. The microchip work has to be
 * finished first: a sample without a confirmed identity is not evidence of
 * anything.
 */
export async function recordSampling(
  database: Database,
  actor: Actor,
  requestId: string,
  input: { collectedAt?: Date; noteFa?: string | null } = {},
): Promise<SampleRecord> {
  const request = await requireOpenVisit(database, actor, requestId);
  if (!samplingRequiredFor(request.serviceType)) {
    throw validation('برای این خدمت نمونه‌گیری تعریف نشده است.');
  }
  if (!(await chipWorkDone(database, request))) {
    throw conflict('تا تعیین‌تکلیف میکروچیپ، نمونه‌گیری ثبت نمی‌شود.');
  }

  const live = await database
    .select({ id: samples.id })
    .from(samples)
    .where(and(eq(samples.requestId, requestId), inArray(samples.status, [...LIVE_STATUSES])));
  if (live.length > 0) throw conflict('برای این درخواست یک نمونه فعال ثبت شده است.');

  const collectedAt = input.collectedAt ?? new Date();
  if (collectedAt.getTime() > Date.now() + 60_000) {
    // §9 D09: a recorded time is when something happened, never a booking.
    throw validation('زمان نمونه‌گیری نمی‌تواند در آینده باشد.');
  }

  return database.transaction(async (tx) => {
    const [sample] = await tx
      .insert(samples)
      .values({
        trackingCode: newSampleTrackingCode(),
        animalId: request.animalId,
        requestId: request.id,
        custodyAccountId: actor.accountId,
        locationId: request.locationId,
        collectedAt,
      })
      .returning();
    if (!sample) throw conflict('ثبت نمونه انجام نشد.');

    await addEvent(tx, sample.id, 'COLLECTED', actor, input.noteFa ?? null);
    // Custody is with the veterinarian who took it and stays there until the
    // centre approves the receipt and instructs the shipment (D07).
    await addEvent(tx, sample.id, 'CUSTODY_RECORDED', actor, null);
    await recordAudit(tx, actor, {
      action: 'SAMPLE_COLLECTED',
      targetType: 'SAMPLE',
      targetId: sample.id,
      after: { requestId: request.id, animalId: request.animalId, locationId: request.locationId },
    });
    await createNotification(tx, {
      recipientAccountId: request.ownerAccountId,
      kind: 'SAMPLE_COLLECTED',
      titleFa: 'نمونه خون گرفته شد',
      bodyFa: 'کد رهگیری نمونه صادر شد و نمونه تا دستور ارسال نزد همان دامپزشک نگهداری می‌شود.',
      resume: {
        entity: { type: 'SAMPLE', id: sample.id },
        step: 'SAMPLE',
        originRoute: '/requests/' + request.id,
      },
    });

    // The visit's work is done once identity and sample are both recorded.
    await tx
      .update(vetVisitRequests)
      .set({ status: 'COMPLETED', version: request.version + 1, updatedAt: new Date() })
      .where(and(eq(vetVisitRequests.id, request.id), eq(vetVisitRequests.version, request.version)));

    // The sheet was paid for before this visit (DEC-0136), so the document is
    // produced here rather than waiting for the owner to come back and ask.
    await issuePaidSheetsForAnimal(tx, request.animalId);

    return sample;
  });
}

async function requireCustodian(
  database: DbClient,
  actor: Actor,
  sampleId: string,
): Promise<SampleRecord> {
  const [row] = await database.select().from(samples).where(eq(samples.id, sampleId)).limit(1);
  if (!row) throw notFound('نمونه پیدا نشد.');
  if (actor.context !== 'TRUSTED_VET' || row.custodyAccountId !== actor.accountId) {
    throw notFound('نمونه پیدا نشد.');
  }
  return row;
}

/**
 * Marks a sample unusable — §12.4, §26.
 *
 * The sample and its code stay in the record with the reason. Nothing is
 * deleted, and this does not by itself produce a replacement: a new code exists
 * only after a new collection.
 */
export async function markSampleUnusable(
  database: Database,
  actor: Actor,
  sampleId: string,
  status: UnusableStatus,
  reasonFa: string,
): Promise<SampleRecord> {
  const reason = reasonFa.trim();
  if (reason.length < 3) throw validation('ثبت دلیل الزامی است.');
  if (!isUnusable(status)) throw validation('وضعیت انتخاب‌شده معتبر نیست.');

  const [current] = await database.select().from(samples).where(eq(samples.id, sampleId)).limit(1);
  if (!current) throw notFound('نمونه پیدا نشد.');
  const isCustodian = actor.context === 'TRUSTED_VET' && current.custodyAccountId === actor.accountId;
  // The centre judges usability; the custodian reports a loss or damage in hand.
  if (!isCustodian && actor.context !== 'GENETICS_OPERATOR') throw notFound('نمونه پیدا نشد.');
  if (isUnusable(current.status)) throw conflict('این نمونه قبلاً غیرقابل‌استفاده ثبت شده است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(samples)
      .set({
        status,
        unusableReasonFa: reason,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(samples.id, sampleId), eq(samples.version, current.version)))
      .returning();
    if (!row) throw conflict('این نمونه هم‌زمان تغییر کرده است.');

    await addEvent(tx, sampleId, 'MARKED_UNUSABLE', actor, reason);
    await recordAudit(tx, actor, {
      action: 'SAMPLE_MARKED_UNUSABLE',
      targetType: 'SAMPLE',
      targetId: sampleId,
      reason,
      before: { status: current.status },
      after: { status },
    });
    return row;
  });
}

/**
 * A second collection on the same request — §12.4.
 *
 * The previous sample and its code stay exactly as they are, with their reason.
 * This is not a second implant: no chip work happens here at all.
 */
export async function resample(
  database: Database,
  actor: Actor,
  requestId: string,
  input: { collectedAt?: Date; noteFa?: string | null } = {},
): Promise<SampleRecord> {
  const request = await requireOpenVisit(database, actor, requestId).catch(async (error) => {
    // Resampling happens after the visit's work was recorded as done, so a
    // completed request is reopened for this one purpose rather than refused.
    const [row] = await database
      .select()
      .from(vetVisitRequests)
      .where(eq(vetVisitRequests.id, requestId))
      .limit(1);
    if (!row || row.vetAccountId !== actor.accountId || row.status !== 'COMPLETED') throw error;
    if (actor.context !== 'TRUSTED_VET') throw error;
    return row;
  });

  const previous = await latestSample(database, requestId);
  if (!previous) throw conflict('نمونه‌ای برای این درخواست ثبت نشده است.');
  if (!isUnusable(previous.status)) {
    throw conflict('تا وقتی نمونه قبلی غیرقابل‌استفاده ثبت نشده، نمونه‌گیری مجدد انجام نمی‌شود.');
  }

  const collectedAt = input.collectedAt ?? new Date();
  return database.transaction(async (tx) => {
    const [sample] = await tx
      .insert(samples)
      .values({
        trackingCode: newSampleTrackingCode(),
        animalId: request.animalId,
        requestId: request.id,
        custodyAccountId: actor.accountId,
        locationId: request.locationId,
        collectedAt,
      })
      .returning();
    if (!sample) throw conflict('ثبت نمونه جدید انجام نشد.');

    await tx
      .update(samples)
      .set({ supersededBySampleId: sample.id, updatedAt: new Date() })
      .where(eq(samples.id, previous.id));

    await addEvent(tx, previous.id, 'RESAMPLED', actor, 'نمونه‌گیری مجدد در همین درخواست انجام شد.');
    await addEvent(tx, sample.id, 'COLLECTED', actor, input.noteFa ?? null);
    await addEvent(tx, sample.id, 'CUSTODY_RECORDED', actor, null);
    await recordAudit(tx, actor, {
      action: 'SAMPLE_RECOLLECTED',
      targetType: 'SAMPLE',
      targetId: sample.id,
      before: { previousSampleId: previous.id, previousStatus: previous.status },
      after: { requestId: request.id },
    });
    await createNotification(tx, {
      recipientAccountId: request.ownerAccountId,
      kind: 'SAMPLE_RECOLLECTED',
      titleFa: 'نمونه‌گیری مجدد انجام شد',
      bodyFa: 'نمونه قبلی قابل استفاده نبود؛ نمونه تازه با کد رهگیری جدید در همین درخواست ثبت شد.',
      resume: {
        entity: { type: 'SAMPLE', id: sample.id },
        step: 'SAMPLE',
        originRoute: '/requests/' + request.id,
      },
    });
    return sample;
  });
}

/** The centre asks for the sample; until then the veterinarian keeps it (D07). */
export async function instructSend(
  database: Database,
  actor: Actor,
  sampleId: string,
): Promise<SampleRecord> {
  if (actor.context !== 'GENETICS_OPERATOR') {
    throw forbidden('دستور ارسال نمونه از محیط مرکز ژنتیک صادر می‌شود.');
  }
  const [current] = await database.select().from(samples).where(eq(samples.id, sampleId)).limit(1);
  if (!current) throw notFound('نمونه پیدا نشد.');
  if (current.status !== 'IN_CUSTODY') throw conflict('این نمونه در وضعیت نگهداری نزد دامپزشک نیست.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(samples)
      .set({
        status: 'SEND_INSTRUCTED',
        sendInstructedAt: new Date(),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(samples.id, sampleId), eq(samples.version, current.version)))
      .returning();
    if (!row) throw conflict('این نمونه هم‌زمان تغییر کرده است.');
    await addEvent(tx, sampleId, 'SEND_INSTRUCTED', actor, null);
    await recordAudit(tx, actor, {
      action: 'SAMPLE_SEND_INSTRUCTED',
      targetType: 'SAMPLE',
      targetId: sampleId,
      after: { status: 'SEND_INSTRUCTED' },
    });
    return row;
  });
}

/** Shipment is an event on the same code — no replacement identifier (§12.4). */
export async function recordShipment(
  database: Database,
  actor: Actor,
  sampleId: string,
  shipmentRefFa: string,
): Promise<SampleRecord> {
  const current = await requireCustodian(database, actor, sampleId);
  if (current.status !== 'SEND_INSTRUCTED') {
    throw conflict('تا صدور دستور ارسال از مرکز ژنتیک، نمونه ارسال نمی‌شود.');
  }
  const reference = shipmentRefFa.trim();
  if (reference.length < 3) throw validation('شناسه یا توضیح ارسال لازم است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(samples)
      .set({
        status: 'SHIPPED',
        shippedAt: new Date(),
        shipmentRefFa: reference,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(samples.id, sampleId), eq(samples.version, current.version)))
      .returning();
    if (!row) throw conflict('این نمونه هم‌زمان تغییر کرده است.');
    await addEvent(tx, sampleId, 'SHIPPED', actor, reference);
    await recordAudit(tx, actor, {
      action: 'SAMPLE_SHIPPED',
      targetType: 'SAMPLE',
      targetId: sampleId,
      after: { status: 'SHIPPED' },
    });
    return row;
  });
}

/** What this veterinarian is currently holding (§21.1). */
export async function custodyList(database: DbClient, actor: Actor): Promise<readonly SampleRecord[]> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('این فهرست فقط برای دامپزشک معتمد است.');
  return database
    .select()
    .from(samples)
    .where(eq(samples.custodyAccountId, actor.accountId))
    .orderBy(desc(samples.collectedAt));
}

/** The owner's view of one sample, scoped to their own animal. */
export async function ownerSamples(
  database: DbClient,
  actor: Actor,
  requestId: string,
): Promise<readonly SampleRecord[]> {
  const [request] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  if (!request || request.ownerAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  return samplesOfRequest(database, requestId);
}
