/**
 * Pregnancy: the owner's declaration and the veterinarian's independent result
 * — §18.1, §18.2, §18.3, §18.4, D08, D09, D12.
 *
 * Two records live side by side here and neither can overwrite the other. The
 * owner's declaration is UNVERIFIED by definition and the cycle continues
 * without any veterinarian; a veterinarian's result is a separate record with
 * its own identity. A difference between them is shown and notified in neutral
 * words, and nothing in this file can issue, suspend, revoke or alter a permit.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import {
  pregnancyChecks,
  pregnancyDeclarations,
  vetPregnancyResults,
} from '../db/schema/breeding.ts';
import { vetLocations, vetProfiles, vetVisitRequests } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import { permitForParty, type PermitRecord } from './permits.ts';
import type { Actor } from '../authz/actor.ts';

export type DeclarationRecord = typeof pregnancyDeclarations.$inferSelect;
export type CheckRecord = typeof pregnancyChecks.$inferSelect;
export type VetResultRecord = typeof vetPregnancyResults.$inferSelect;

/** The label §18.4 fixes for a difference, and the words it must not use. */
export const MISMATCH_LABEL_FA = 'مغایرت با اعلام مالک';
export const MISMATCH_NOTE_FA =
  'این مغایرت به معنی تقلب، رد درخواست یا اختلاف حقوقی نیست، تأیید طرف مقابل لازم ندارد و روی مجوز صادرشده اثری ندارد.';
export const UNVERIFIED_NOTE_FA =
  'اعلام شما UNVERIFIED است؛ نبود تأیید دامپزشک نقص پرونده نیست و ادامه چرخه به آن وابسته نیست.';

function assertCount(value: number | null | undefined, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) throw validation(label + ' باید عدد صحیح و نامنفی باشد.');
  return value;
}

/** §18.1: the official declaration starts from a permit that was issued. */
async function requireIssuedPermit(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.status !== 'ISSUED') {
    throw conflict('اعلام رسمی بارداری فقط روی پرونده‌ای با مجوز صادرشده ممکن است.');
  }
  return permit;
}

export async function declarationsOfPermit(
  database: DbClient,
  permitId: string,
): Promise<readonly DeclarationRecord[]> {
  return database
    .select()
    .from(pregnancyDeclarations)
    .where(eq(pregnancyDeclarations.permitId, permitId))
    .orderBy(desc(pregnancyDeclarations.version));
}

export async function latestDeclaration(
  database: DbClient,
  permitId: string,
): Promise<DeclarationRecord | null> {
  const [row] = await declarationsOfPermit(database, permitId);
  return row ?? null;
}

export interface DeclarePregnancyInput {
  readonly pregnant: boolean;
  readonly expectedCount?: number | null;
  readonly noteFa?: string | null;
  /** Required when this declaration corrects an earlier version (§18.3). */
  readonly reasonFa?: string | null;
}

/**
 * The owner's declaration — §18.1, §18.3.
 *
 * Either participant of the permit may declare, every declaration is a new
 * version with its actor and time, and a correction keeps the previous version
 * intact. No veterinarian is involved and none is waited for.
 */
export async function declarePregnancy(
  database: Database,
  actor: Actor,
  permitId: string,
  input: DeclarePregnancyInput,
): Promise<DeclarationRecord> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const expectedCount = assertCount(input.expectedCount, 'تعداد تخمینی');
  const previous = await latestDeclaration(database, permitId);
  const reason = (input.reasonFa ?? '').trim();
  if (previous && reason.length < 3) throw validation('برای اصلاح اعلام، ثبت علت الزامی است.');

  return database.transaction(async (tx) => {
    const version = (previous?.version ?? 0) + 1;
    const [row] = await tx
      .insert(pregnancyDeclarations)
      .values({
        permitId,
        version,
        pregnant: input.pregnant,
        expectedCount,
        noteFa: input.noteFa?.trim() || null,
        reasonFa: previous ? reason : null,
        declaredByAccountId: actor.accountId,
        declaredAt: new Date(),
        replacesVersion: previous?.version ?? null,
      })
      .returning();
    if (!row) throw conflict('ثبت اعلام بارداری انجام نشد.');

    await recordAudit(tx, actor, {
      action: previous ? 'PREGNANCY_DECLARATION_CORRECTED' : 'PREGNANCY_DECLARED',
      targetType: 'PREGNANCY_DECLARATION',
      targetId: row.id,
      targetVersion: row.version,
      reason: previous ? reason : null,
      before: previous ? { version: previous.version, pregnant: previous.pregnant, expectedCount: previous.expectedCount } : undefined,
      after: { permitId, version, pregnant: row.pregnant, expectedCount: row.expectedCount, status: 'UNVERIFIED' },
    });

    const other =
      permit.initiatorAccountId === actor.accountId
        ? permit.counterpartyAccountId
        : permit.initiatorAccountId;
    if (other) {
      await createNotification(tx, {
        recipientAccountId: other,
        kind: previous ? 'PREGNANCY_DECLARATION_CORRECTED' : 'PREGNANCY_DECLARED',
        titleFa: previous ? 'اصلاح اعلام بارداری' : 'اعلام بارداری ثبت شد',
        bodyFa: 'نسخه ' + version + ' در پرونده مجوز ثبت شد. این اعلام UNVERIFIED است.',
        resume: {
          entity: { type: 'PREGNANCY_DECLARATION', id: permitId },
          step: 'PREGNANCY_DECLARATION',
          originRoute: '/mating/permits/' + permitId + '/pregnancy',
        },
      });
    }
    return row;
  });
}

// ── Optional verification ─────────────────────────────────────────────────

export async function checksOfPermit(database: DbClient, permitId: string): Promise<readonly CheckRecord[]> {
  return database
    .select()
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.permitId, permitId))
    .orderBy(desc(pregnancyChecks.requestedAt));
}

export async function checkOfRequest(database: DbClient, requestId: string): Promise<CheckRecord | null> {
  const [row] = await database
    .select()
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.requestId, requestId))
    .limit(1);
  return row ?? null;
}

/**
 * Links a visit request to this pregnancy case — §18.2.
 *
 * The visit request itself is the ordinary §11 one, created in the Finder for a
 * chosen veterinarian and a complete location. This record only says which case
 * the examination belongs to, so the result comes back to the right file.
 */
export async function attachPregnancyCheck(
  database: Database,
  actor: Actor,
  permitId: string,
  requestId: string,
): Promise<CheckRecord> {
  const permit = await requireIssuedPermit(database, actor, permitId);

  const [request] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  if (!request || request.ownerAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  if (request.context !== 'PREGNANCY') throw validation('این درخواست در مسیر بررسی بارداری نیست.');
  if (request.animalId !== permit.damAnimalId) {
    throw validation('درخواست بررسی بارداری باید برای حیوان ماده همین پرونده باشد.');
  }
  if (await checkOfRequest(database, requestId)) throw conflict('این درخواست قبلاً به پرونده وصل شده است.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .insert(pregnancyChecks)
      .values({
        permitId,
        requestId,
        animalId: request.animalId,
        requestedByAccountId: actor.accountId,
      })
      .returning();
    if (!row) throw conflict('اتصال درخواست به پرونده انجام نشد.');
    await recordAudit(tx, actor, {
      action: 'PREGNANCY_CHECK_REQUESTED',
      targetType: 'PREGNANCY_DECLARATION',
      targetId: permitId,
      after: { checkId: row.id, requestId, animalId: request.animalId },
    });
    return row;
  });
}

export async function resultsOfCheck(
  database: DbClient,
  checkId: string,
): Promise<readonly VetResultRecord[]> {
  return database
    .select()
    .from(vetPregnancyResults)
    .where(eq(vetPregnancyResults.checkId, checkId))
    .orderBy(desc(vetPregnancyResults.version));
}

export interface VetResultInput {
  readonly pregnant: boolean;
  readonly expectedCount?: number | null;
  readonly noteFa?: string | null;
  readonly reasonFa?: string | null;
}

/**
 * The veterinarian's result — §18.2, §18.3, §18.4.
 *
 * Only the assigned veterinarian, from their own panel and with a valid licence
 * at the examining location, can record it; there is no queue anyone may take a
 * case from. The result carries the vet's name, council code, time and
 * location, and it never rewrites the owner's numbers: a difference produces a
 * neutral notice and an audit event linking both records.
 */
export async function recordVetPregnancyResult(
  database: Database,
  actor: Actor,
  requestId: string,
  input: VetResultInput,
): Promise<VetResultRecord> {
  if (actor.context !== 'TRUSTED_VET') throw forbidden('ثبت نتیجه بارداری فقط از پنل دامپزشک معتمد است.');

  const [request] = await database
    .select()
    .from(vetVisitRequests)
    .where(eq(vetVisitRequests.id, requestId))
    .limit(1);
  // Same answer for "not yours" and "does not exist" (§23.4).
  if (!request || request.vetAccountId !== actor.accountId) throw notFound('درخواست مراجعه پیدا نشد.');
  if (request.context !== 'PREGNANCY') throw validation('این درخواست در مسیر بررسی بارداری نیست.');
  if (request.status !== 'CHECKED_IN' && request.status !== 'COMPLETED') {
    throw conflict('برای ثبت نتیجه، ابتدا کد مراجعه را در همین مرکز بپذیرید.');
  }

  const check = await checkOfRequest(database, requestId);
  if (!check) throw conflict('این مراجعه به پرونده بارداری وصل نشده است.');

  const [profile] = await database
    .select({ displayNameFa: vetProfiles.displayNameFa, councilCode: vetProfiles.councilCode })
    .from(vetProfiles)
    .where(eq(vetProfiles.accountId, actor.accountId))
    .limit(1);
  // An owned profile always carries its verified council code; only unowned directory profiles lack one.
  if (!profile || profile.councilCode === null) throw forbidden('پرونده حرفه‌ای دامپزشک پیدا نشد.');
  const councilCode = profile.councilCode;
  const [location] = await database
    .select({ id: vetLocations.id, licenceStatus: vetLocations.licenceStatus, isActive: vetLocations.isActive })
    .from(vetLocations)
    .where(eq(vetLocations.id, request.locationId))
    .limit(1);
  if (!location || location.licenceStatus !== 'VALID' || !location.isActive) {
    throw forbidden('ثبت نتیجه فقط از مرکز فعال با پروانه معتبر ممکن است.');
  }

  const expectedCount = assertCount(input.expectedCount, 'تعداد تخمینی');
  const [previous] = await resultsOfCheck(database, check.id);
  const reason = (input.reasonFa ?? '').trim();
  if (previous && reason.length < 3) throw validation('برای اصلاح نتیجه، ثبت علت الزامی است.');

  const declaration = await latestDeclaration(database, check.permitId);

  return database.transaction(async (tx) => {
    const version = (previous?.version ?? 0) + 1;
    const [row] = await tx
      .insert(vetPregnancyResults)
      .values({
        checkId: check.id,
        version,
        pregnant: input.pregnant,
        expectedCount,
        noteFa: input.noteFa?.trim() || null,
        reasonFa: previous ? reason : null,
        vetAccountId: actor.accountId,
        vetNameFa: profile.displayNameFa,
        councilCode,
        locationId: request.locationId,
        examinedAt: new Date(),
        replacesVersion: previous?.version ?? null,
      })
      .returning();
    if (!row) throw conflict('ثبت نتیجه دامپزشک انجام نشد.');

    await recordAudit(tx, actor, {
      action: previous ? 'VET_PREGNANCY_RESULT_CORRECTED' : 'VET_PREGNANCY_RESULT_RECORDED',
      targetType: 'PREGNANCY_DECLARATION',
      targetId: check.permitId,
      targetVersion: row.version,
      reason: previous ? reason : null,
      after: {
        checkId: check.id,
        resultId: row.id,
        pregnant: row.pregnant,
        expectedCount: row.expectedCount,
        locationId: row.locationId,
        status: 'VERIFIED_BY_VET',
      },
    });

    // §18.4: a difference is a display state and a neutral notice, nothing more.
    const differs =
      declaration !== null &&
      (declaration.pregnant !== row.pregnant ||
        (declaration.expectedCount ?? null) !== (row.expectedCount ?? null));
    if (differs && declaration) {
      await recordAudit(tx, actor, {
        action: 'PREGNANCY_RECORDS_MISMATCH',
        targetType: 'PREGNANCY_DECLARATION',
        targetId: check.permitId,
        // Both records are referenced, with their versions and their values.
        before: {
          ownerDeclarationId: declaration.id,
          version: declaration.version,
          pregnant: declaration.pregnant,
          expectedCount: declaration.expectedCount,
        },
        after: {
          vetResultId: row.id,
          version: row.version,
          pregnant: row.pregnant,
          expectedCount: row.expectedCount,
        },
      });
      await createNotification(tx, {
        recipientAccountId: declaration.declaredByAccountId,
        kind: 'PREGNANCY_RECORDS_MISMATCH',
        titleFa: MISMATCH_LABEL_FA,
        bodyFa: 'نتیجه دامپزشک با اعلام شما یکسان نیست؛ هر دو مقدار در همان پرونده دیده می‌شود. ' + MISMATCH_NOTE_FA,
        resume: {
          entity: { type: 'PREGNANCY_DECLARATION', id: check.permitId },
          step: 'PREGNANCY_RESULT',
          originRoute: '/mating/permits/' + check.permitId + '/pregnancy',
        },
      });
    } else {
      await createNotification(tx, {
        recipientAccountId: check.requestedByAccountId,
        kind: 'VET_PREGNANCY_RESULT_RECORDED',
        titleFa: 'نتیجه بررسی بارداری ثبت شد',
        bodyFa: 'نتیجه مستقل دامپزشک در پرونده شما ثبت شد.',
        resume: {
          entity: { type: 'PREGNANCY_DECLARATION', id: check.permitId },
          step: 'PREGNANCY_RESULT',
          originRoute: '/mating/permits/' + check.permitId + '/pregnancy',
        },
      });
    }
    return row;
  });
}

// ── The joined view ───────────────────────────────────────────────────────

export interface PregnancyRecordsView {
  readonly declaration: DeclarationRecord | null;
  readonly declarations: readonly DeclarationRecord[];
  readonly checks: ReadonlyArray<{
    readonly check: CheckRecord;
    readonly results: readonly VetResultRecord[];
    readonly latest: VetResultRecord | null;
    readonly locationNameFa: string | null;
  }>;
  /** True only when both records exist and disagree (§18.4). */
  readonly mismatch: boolean;
}

export async function pregnancyRecords(
  database: DbClient,
  permitId: string,
): Promise<PregnancyRecordsView> {
  const declarations = await declarationsOfPermit(database, permitId);
  const declaration = declarations[0] ?? null;
  const rows = await checksOfPermit(database, permitId);

  const checks = [];
  let mismatch = false;
  for (const check of rows) {
    const results = await resultsOfCheck(database, check.id);
    const latest = results[0] ?? null;
    const [location] = latest
      ? await database
          .select({ nameFa: vetLocations.nameFa })
          .from(vetLocations)
          .where(eq(vetLocations.id, latest.locationId))
          .limit(1)
      : [];
    if (
      latest &&
      declaration &&
      (declaration.pregnant !== latest.pregnant ||
        (declaration.expectedCount ?? null) !== (latest.expectedCount ?? null))
    ) {
      mismatch = true;
    }
    checks.push({ check, results, latest, locationNameFa: location?.nameFa ?? null });
  }
  return { declaration, declarations, checks, mismatch };
}

/** The dam of a permit, which is the animal a pregnancy check is about. */
export async function damOfPermit(database: DbClient, permit: PermitRecord) {
  const [row] = await database
    .select({ id: animals.id, name: animals.name, sex: animals.sex })
    .from(animals)
    .where(and(eq(animals.id, permit.damAnimalId)))
    .limit(1);
  return row ?? null;
}

/** Pregnancy visit requests of this owner that are not linked to a case yet. */
export async function unlinkedPregnancyRequests(database: DbClient, actor: Actor, animalId: string) {
  const rows = await database
    .select({ id: vetVisitRequests.id, status: vetVisitRequests.status, createdAt: vetVisitRequests.createdAt })
    .from(vetVisitRequests)
    .where(
      and(
        eq(vetVisitRequests.ownerAccountId, actor.accountId),
        eq(vetVisitRequests.animalId, animalId),
        eq(vetVisitRequests.context, 'PREGNANCY'),
      ),
    )
    .orderBy(desc(vetVisitRequests.createdAt));
  const out = [];
  for (const row of rows) {
    if (!(await checkOfRequest(database, row.id))) out.push(row);
  }
  return out;
}
