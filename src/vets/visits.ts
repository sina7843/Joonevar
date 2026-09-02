/**
 * Visit requests, referral codes and check-in — §11.2, §11.3, §11.4, §26, D15.
 *
 * A group of animals is a display grouping and nothing more: every animal gets
 * its own request, its own code and its own state, so correcting the service
 * for one animal cannot disturb the others. The code is issued before any
 * sampling, and QR and manual entry are two renderings of the same value.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { profiles } from '../db/schema/identity.ts';
import { referralCodes, vetLocations, vetProfiles, vetVisitBatches, vetVisitRequests } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { snapshotSetting } from '../settings/service.ts';
import { assertEligible, vetEligibilityFor } from '../domain/eligibility/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { newReferralCode } from '../domain/ids.ts';
import {
  checkInRejection,
  normalizeReferralCode,
  referralExpiry,
  REJECTION_FA,
  SERVICES_BY_CONTEXT,
  SERVICE_TYPE_FA,
  type CodeRejection,
  type VisitContextName,
  type VisitServiceTypeName,
} from '../domain/referral.ts';
import { eligibilityOf } from './registry.ts';
import type { Actor } from '../authz/actor.ts';

export const REFERRAL_VALIDITY_SETTING = 'referral.validity_days';

export type VisitRequestRecord = typeof vetVisitRequests.$inferSelect;
export type ReferralRecord = typeof referralCodes.$inferSelect;

export interface VisitItemInput {
  readonly animalId: string;
  readonly serviceType: VisitServiceTypeName;
}

export interface CreateVisitInput {
  readonly context: VisitContextName;
  readonly vetAccountId: string;
  readonly locationId: string;
  readonly items: readonly VisitItemInput[];
}

/**
 * Issues a code for one request.
 *
 * The active validity is read from the database at this moment and copied onto
 * the row together with the settings version. That copy is what makes a later
 * change of the deadline non-retroactive, and it is the same value the screen
 * shows and the server enforces (§11.4, D15).
 */
async function issueReferral(tx: DbClient, requestId: string): Promise<ReferralRecord> {
  const setting = await snapshotSetting(tx, REFERRAL_VALIDITY_SETTING);
  const validityDays = Number(setting.value);
  if (!Number.isInteger(validityDays) || validityDays < 1) {
    throw validation('مهلت اعتبار کد مراجعه در تنظیمات معتبر نیست.');
  }
  const issuedAt = new Date();
  const [row] = await tx
    .insert(referralCodes)
    .values({
      requestId,
      code: newReferralCode(),
      issuedAt,
      expiresAt: referralExpiry(issuedAt, validityDays),
      validityDays,
      settingsVersion: setting.version,
    })
    .returning();
  if (!row) throw conflict('صدور کد مراجعه انجام نشد.');
  return row;
}

/** The same server-side gate the Finder query applies, re-checked at write time. */
async function assertAssignable(
  database: DbClient,
  vetAccountId: string,
  locationId: string,
  context: VisitContextName,
): Promise<void> {
  const [location] = await database.select().from(vetLocations).where(eq(vetLocations.id, locationId)).limit(1);
  if (!location || location.vetAccountId !== vetAccountId) throw notFound('این مرکز در دسترس نیست.');
  const eligibility = eligibilityOf(location, context);
  if (!eligibility.eligible) throw validation(eligibility.reasonFa);

  const vet = await vetEligibilityFor(database, vetAccountId);
  if (!vet || !vet.canAcceptNewWork) {
    throw validation('این دامپزشک در حال حاضر درخواست جدید نمی‌پذیرد. دامپزشک دیگری انتخاب کنید.');
  }
}

export interface CreatedVisit {
  readonly batchId: string;
  readonly items: ReadonlyArray<{ readonly request: VisitRequestRecord; readonly referral: ReferralRecord }>;
}

export async function createVisitRequests(
  database: Database,
  actor: Actor,
  input: CreateVisitInput,
): Promise<CreatedVisit> {
  await assertEligible(database, actor.accountId, 'VET_VISIT_REQUEST');
  if (input.items.length === 0) throw validation('حداقل یک حیوان انتخاب کنید.');

  const allowed = SERVICES_BY_CONTEXT[input.context];
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!allowed.includes(item.serviceType)) throw validation('نوع خدمت با این مسیر هم‌خوان نیست.');
    if (seen.has(item.animalId)) throw validation('هر حیوان فقط یک بار در این درخواست می‌آید.');
    seen.add(item.animalId);
  }

  const owned = await database
    .select({ id: animals.id, status: animals.status, ownerAccountId: animals.ownerAccountId })
    .from(animals)
    .where(inArray(animals.id, [...seen]));
  for (const animalId of seen) {
    const row = owned.find((a) => a.id === animalId);
    // Same answer for "not yours" and "does not exist" (§23.4).
    if (!row || row.ownerAccountId !== actor.accountId) throw notFound('پرونده حیوان پیدا نشد.');
    if (row.status !== 'REGISTERED') throw validation('برای این حیوان ابتدا ثبت اولیه را کامل کنید.');
  }

  // An animal already waiting for a visit in this context does not get a
  // second live request, which is what keeps one animal to one active code.
  const live = await database
    .select({ animalId: vetVisitRequests.animalId })
    .from(vetVisitRequests)
    .where(
      and(
        inArray(vetVisitRequests.animalId, [...seen]),
        eq(vetVisitRequests.context, input.context),
        inArray(vetVisitRequests.status, ['ACTIVE', 'CHECKED_IN']),
      ),
    );
  if (live.length > 0) throw conflict('برای این حیوان یک درخواست مراجعه فعال وجود دارد.');

  await assertAssignable(database, input.vetAccountId, input.locationId, input.context);

  return database.transaction(async (tx) => {
    const [batch] = await tx
      .insert(vetVisitBatches)
      .values({ ownerAccountId: actor.accountId, context: input.context })
      .returning();
    if (!batch) throw conflict('ساخت گروه درخواست انجام نشد.');

    const items: Array<{ request: VisitRequestRecord; referral: ReferralRecord }> = [];
    for (const item of input.items) {
      const [request] = await tx
        .insert(vetVisitRequests)
        .values({
          batchId: batch.id,
          animalId: item.animalId,
          ownerAccountId: actor.accountId,
          vetAccountId: input.vetAccountId,
          locationId: input.locationId,
          context: input.context,
          serviceType: item.serviceType,
        })
        .returning();
      if (!request) throw conflict('ساخت درخواست مراجعه انجام نشد.');

      const referral = await issueReferral(tx, request.id);
      await recordAudit(tx, actor, {
        action: 'VET_VISIT_REQUEST_CREATED',
        targetType: 'VET_VISIT_REQUEST',
        targetId: request.id,
        targetVersion: request.version,
        after: {
          animalId: request.animalId,
          serviceType: request.serviceType,
          vetAccountId: request.vetAccountId,
          locationId: request.locationId,
          referralId: referral.id,
          expiresAt: referral.expiresAt.toISOString(),
          validityDays: referral.validityDays,
          settingsVersion: referral.settingsVersion,
        },
      });
      await createNotification(tx, {
        recipientAccountId: actor.accountId,
        kind: 'REFERRAL_ISSUED',
        titleFa: 'کد مراجعه صادر شد',
        bodyFa:
          'کد مراجعه ' +
          SERVICE_TYPE_FA[item.serviceType] +
          ' صادر شد. مهلت مراجعه روی همان پرونده نمایش داده می‌شود.',
        resume: {
          entity: { type: 'VET_VISIT_REQUEST', id: request.id },
          step: 'REFERRAL',
          originRoute: '/requests/' + request.id,
        },
      });
      items.push({ request, referral });
    }

    return { batchId: batch.id, items };
  });
}

// ── Reads ─────────────────────────────────────────────────────────────────

export interface RequestView {
  readonly request: VisitRequestRecord;
  readonly referral: ReferralRecord | null;
  readonly animalName: string | null;
  readonly locationNameFa: string;
  readonly vetNameFa: string;
  readonly expired: boolean;
}

async function decorate(
  database: DbClient,
  rows: readonly VisitRequestRecord[],
): Promise<readonly RequestView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const codes = await database
    .select()
    .from(referralCodes)
    .where(inArray(referralCodes.requestId, ids))
    .orderBy(desc(referralCodes.issuedAt));
  const animalRows = await database
    .select({ id: animals.id, name: animals.name })
    .from(animals)
    .where(inArray(animals.id, rows.map((r) => r.animalId)));
  const locationRows = await database
    .select({ id: vetLocations.id, nameFa: vetLocations.nameFa })
    .from(vetLocations)
    .where(inArray(vetLocations.id, rows.map((r) => r.locationId)));
  const vetRows = await database
    .select({ accountId: vetProfiles.accountId, nameFa: vetProfiles.displayNameFa })
    .from(vetProfiles)
    .where(inArray(vetProfiles.accountId, rows.map((r) => r.vetAccountId)));

  const now = Date.now();
  return rows.map((request) => {
    const referral = codes.find((c) => c.requestId === request.id) ?? null;
    return {
      request,
      referral,
      animalName: animalRows.find((a) => a.id === request.animalId)?.name ?? null,
      locationNameFa: locationRows.find((l) => l.id === request.locationId)?.nameFa ?? '—',
      vetNameFa: vetRows.find((v) => v.accountId === request.vetAccountId)?.nameFa ?? '—',
      expired:
        referral !== null && referral.status === 'ACTIVE' && referral.expiresAt.getTime() <= now,
    };
  });
}

export async function listOwnerRequests(database: DbClient, actor: Actor): Promise<readonly RequestView[]> {
  const rows = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.ownerAccountId, actor.accountId))
    .orderBy(desc(vetVisitRequests.createdAt));
  return decorate(database, rows);
}

export async function ownerRequest(
  database: DbClient,
  actor: Actor,
  requestId: string,
): Promise<RequestView> {
  const [row] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  if (!row || row.ownerAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  const [view] = await decorate(database, [row]);
  return view!;
}

/** The queue of §21.1: only work assigned to this veterinarian. */
export async function vetQueue(database: DbClient, actor: Actor): Promise<readonly RequestView[]> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('این صف فقط برای دامپزشک معتمد است.');
  const rows = await database
    .select()
    .from(vetVisitRequests)
    .where(
      and(
        eq(vetVisitRequests.vetAccountId, actor.accountId),
        inArray(vetVisitRequests.status, ['ACTIVE', 'CHECKED_IN']),
      ),
    )
    .orderBy(desc(vetVisitRequests.createdAt));
  return decorate(database, rows);
}

export interface VetRequestDetail extends RequestView {
  readonly ownerNameFa: string | null;
  readonly ownerMobileTail: string | null;
}

/**
 * Detail of one assigned request. Owner identity is shown only after the code
 * has actually been accepted here, so a queue view never becomes a directory
 * of other people's records.
 */
export async function vetRequestDetail(
  database: DbClient,
  actor: Actor,
  requestId: string,
): Promise<VetRequestDetail> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('این صفحه فقط برای دامپزشک معتمد است.');
  const [row] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  if (!row || row.vetAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  const [view] = await decorate(database, [row]);

  if (row.status !== 'CHECKED_IN' && row.status !== 'COMPLETED') {
    return { ...view!, ownerNameFa: null, ownerMobileTail: null };
  }
  const [owner] = await database
    .select({ firstName: profiles.firstName, lastName: profiles.lastName })
    .from(profiles)
    .where(eq(profiles.accountId, row.ownerAccountId))
    .limit(1);
  return {
    ...view!,
    ownerNameFa: owner ? owner.firstName + ' ' + owner.lastName : null,
    ownerMobileTail: null,
  };
}

// ── Renewal ───────────────────────────────────────────────────────────────

/**
 * A new code after expiry — §11.4, §26.
 *
 * The veterinarian and location are checked again, because eligibility can have
 * changed while the old code sat unused. The previous code stays in the record
 * as EXPIRED: a settings change is not permission to erase code history.
 */
export async function renewReferral(
  database: Database,
  actor: Actor,
  requestId: string,
): Promise<ReferralRecord> {
  const [request] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  if (!request || request.ownerAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  if (request.status !== 'ACTIVE') throw conflict('این درخواست دیگر در انتظار مراجعه نیست.');

  const [current] = await database
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.requestId, requestId))
    .orderBy(desc(referralCodes.issuedAt))
    .limit(1);
  if (!current) throw notFound('کد مراجعه‌ای برای این درخواست وجود ندارد.');
  if (current.status === 'CONSUMED') throw conflict('این کد قبلاً استفاده شده است.');
  if (current.status === 'ACTIVE' && current.expiresAt.getTime() > Date.now()) {
    throw conflict('کد فعلی هنوز معتبر است.');
  }

  await assertAssignable(database, request.vetAccountId, request.locationId, request.context);

  return database.transaction(async (tx) => {
    const [ended] = await tx
      .update(referralCodes)
      .set({
        status: 'EXPIRED',
        endedReasonFa: 'مهلت مراجعه گذشت و کد جدید صادر شد.',
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(referralCodes.id, current.id), eq(referralCodes.version, current.version)))
      .returning();
    if (!ended) throw conflict('این کد هم‌زمان تغییر کرده است.');

    const referral = await issueReferral(tx, requestId);
    await recordAudit(tx, actor, {
      action: 'REFERRAL_REISSUED',
      targetType: 'VET_VISIT_REQUEST',
      targetId: requestId,
      before: { referralId: current.id, expiresAt: current.expiresAt.toISOString() },
      after: {
        referralId: referral.id,
        expiresAt: referral.expiresAt.toISOString(),
        validityDays: referral.validityDays,
        settingsVersion: referral.settingsVersion,
      },
    });
    return referral;
  });
}

// ── Check-in ──────────────────────────────────────────────────────────────

export type CheckInOutcome =
  | { readonly ok: true; readonly request: VisitRequestRecord }
  | { readonly ok: false; readonly rejection: CodeRejection; readonly messageFa: string };

export interface CheckInInput {
  readonly code: string;
  readonly locationId: string;
}

/**
 * One-time check-in — §11.3.
 *
 * Two scanners racing on the same code is decided by the conditional update:
 * whoever moves the row out of ACTIVE wins, and the loser is told the code has
 * already been used rather than being given a second acceptance. A suspended
 * veterinarian can still complete work already assigned (§7.1); it is new
 * assignment that is closed to them, not this desk.
 */
export async function checkIn(
  database: Database,
  actor: Actor,
  input: CheckInInput,
): Promise<CheckInOutcome> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('پذیرش مراجعه فقط توسط دامپزشک معتمد انجام می‌شود.');
  const vet = await vetEligibilityFor(database, actor.accountId);
  if (!vet || !vet.canContinueActiveWork) {
    throw forbidden(vet?.reasonFa ?? 'تأیید حرفه‌ای این حساب فعال نیست.');
  }

  const code = normalizeReferralCode(input.code);
  const reject = (rejection: CodeRejection): CheckInOutcome => ({
    ok: false,
    rejection,
    messageFa: REJECTION_FA[rejection],
  });
  if (code === '') return reject('NOT_FOUND');

  const [referral] = await database.select().from(referralCodes).where(eq(referralCodes.code, code)).limit(1);
  if (!referral) return reject('NOT_FOUND');

  const [request] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, referral.requestId))
    .limit(1);
  if (!request) return reject('NOT_FOUND');

  const rejection = checkInRejection({
    referralStatus: referral.status,
    expiresAt: referral.expiresAt,
    requestStatus: request.status,
    requestVetAccountId: request.vetAccountId,
    requestLocationId: request.locationId,
    presentedByVetAccountId: actor.accountId,
    presentedAtLocationId: input.locationId,
    now: new Date(),
  });
  if (rejection) return reject(rejection);

  const outcome = await database.transaction(async (tx) => {
    // The arbiter of the race: exactly one update can move ACTIVE to CONSUMED.
    const [consumed] = await tx
      .update(referralCodes)
      .set({
        status: 'CONSUMED',
        consumedAt: new Date(),
        consumedByAccountId: actor.accountId,
        version: referral.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(referralCodes.id, referral.id), eq(referralCodes.status, 'ACTIVE')))
      .returning();
    if (!consumed) return null;

    const [updated] = await tx
      .update(vetVisitRequests)
      .set({
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInByAccountId: actor.accountId,
        version: request.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(vetVisitRequests.id, request.id), eq(vetVisitRequests.status, 'ACTIVE')))
      .returning();
    if (!updated) throw conflict('این درخواست هم‌زمان تغییر کرده است.');

    await recordAudit(tx, actor, {
      action: 'VET_VISIT_CHECKED_IN',
      targetType: 'VET_VISIT_REQUEST',
      targetId: updated.id,
      targetVersion: updated.version,
      after: { referralId: referral.id, locationId: input.locationId },
    });
    await createNotification(tx, {
      recipientAccountId: updated.ownerAccountId,
      kind: 'VISIT_CHECKED_IN',
      titleFa: 'مراجعه شما ثبت شد',
      bodyFa: 'کد مراجعه در مرکز پذیرش شد و خدمت ' + SERVICE_TYPE_FA[updated.serviceType] + ' در جریان است.',
      resume: {
        entity: { type: 'VET_VISIT_REQUEST', id: updated.id },
        step: 'CHECKED_IN',
        originRoute: '/requests/' + updated.id,
      },
    });
    return updated;
  });

  return outcome ? { ok: true, request: outcome } : reject('CONSUMED');
}

// ── In-place service correction ───────────────────────────────────────────

/**
 * The observed microchip state differs from what was requested — §11.4.
 *
 * Only this animal's request and code are superseded. The other animals in the
 * group are untouched, the old audit rows stay exactly as they were, and the
 * corrected request comes back with a fresh code that still has to be checked
 * in.
 */
export async function correctService(
  database: Database,
  actor: Actor,
  requestId: string,
  serviceType: VisitServiceTypeName,
  reasonFa: string,
): Promise<{ readonly request: VisitRequestRecord; readonly referral: ReferralRecord }> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('تغییر نوع خدمت فقط توسط دامپزشک معتمد انجام می‌شود.');
  const reason = reasonFa.trim();
  if (reason.length < 3) throw validation('دلیل تغییر نوع خدمت لازم است.');

  const [request] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  if (!request || request.vetAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  if (request.status !== 'ACTIVE' && request.status !== 'CHECKED_IN') {
    throw conflict('این درخواست دیگر قابل اصلاح نیست.');
  }
  if (request.serviceType === serviceType) throw validation('نوع خدمت با درخواست فعلی یکسان است.');
  if (!SERVICES_BY_CONTEXT[request.context].includes(serviceType)) {
    throw validation('نوع خدمت با این مسیر هم‌خوان نیست.');
  }

  return database.transaction(async (tx) => {
    const [replacement] = await tx
      .insert(vetVisitRequests)
      .values({
        batchId: request.batchId,
        animalId: request.animalId,
        ownerAccountId: request.ownerAccountId,
        vetAccountId: request.vetAccountId,
        locationId: request.locationId,
        context: request.context,
        serviceType,
      })
      .returning();
    if (!replacement) throw conflict('ساخت درخواست اصلاح‌شده انجام نشد.');

    const [superseded] = await tx
      .update(vetVisitRequests)
      .set({
        status: 'SUPERSEDED',
        supersededByRequestId: replacement.id,
        supersedeReasonFa: reason,
        version: request.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(vetVisitRequests.id, request.id), eq(vetVisitRequests.version, request.version)))
      .returning();
    if (!superseded) throw conflict('این درخواست هم‌زمان تغییر کرده است.');

    // Any code still usable on the old request stops being usable, without
    // touching codes that were already consumed or expired.
    await tx
      .update(referralCodes)
      .set({
        status: 'SUPERSEDED',
        endedReasonFa: reason,
        version: sql`${referralCodes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(referralCodes.requestId, request.id), eq(referralCodes.status, 'ACTIVE')));

    const referral = await issueReferral(tx, replacement.id);
    await recordAudit(tx, actor, {
      action: 'VET_VISIT_SERVICE_CORRECTED',
      targetType: 'VET_VISIT_REQUEST',
      targetId: request.id,
      targetVersion: superseded.version,
      reason,
      before: { serviceType: request.serviceType, status: request.status },
      after: { replacementRequestId: replacement.id, serviceType, referralId: referral.id },
    });
    await createNotification(tx, {
      recipientAccountId: request.ownerAccountId,
      kind: 'VISIT_SERVICE_CORRECTED',
      titleFa: 'نوع خدمت این حیوان اصلاح شد',
      bodyFa:
        'وضعیت مشاهده‌شده با درخواست فرق داشت؛ خدمت به ' +
        SERVICE_TYPE_FA[serviceType] +
        ' اصلاح شد و کد مراجعه جدید صادر شد.',
      resume: {
        entity: { type: 'VET_VISIT_REQUEST', id: replacement.id },
        step: 'REFERRAL',
        originRoute: '/requests/' + replacement.id,
      },
    });
    return { request: replacement, referral };
  });
}

/** Animals that may still be sent to a visit in this context. */
export async function selectableAnimals(
  database: DbClient,
  actor: Actor,
  context: VisitContextName,
): Promise<ReadonlyArray<{ readonly id: string; readonly name: string | null }>> {
  const rows = await database
    .select({ id: animals.id, name: animals.name })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, actor.accountId), eq(animals.status, 'REGISTERED')));
  const busy = await database
    .select({ animalId: vetVisitRequests.animalId })
    .from(vetVisitRequests)
    .where(
      and(
        eq(vetVisitRequests.ownerAccountId, actor.accountId),
        eq(vetVisitRequests.context, context),
        inArray(vetVisitRequests.status, ['ACTIVE', 'CHECKED_IN']),
      ),
    );
  const taken = new Set(busy.map((b) => b.animalId));
  return rows.filter((row) => !taken.has(row.id));
}

/** The veterinarian's own locations, for the check-in desk selector. */
export async function myLocations(database: DbClient, actor: Actor) {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('این فهرست فقط برای دامپزشک معتمد است.');
  return database.select().from(vetLocations).where(eq(vetLocations.vetAccountId, actor.accountId));
}
