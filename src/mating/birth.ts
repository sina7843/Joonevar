/**
 * Birth, the litter and the puppy profiles — §19.1, §19.2, D18.
 *
 * The rule that shapes this file is that history is evidence: the first report
 * keeps its numbers for ever, a correction is a new version with its own actor,
 * time and reason, and a profile is never deleted. A puppy that was born alive
 * and later died keeps its file; a profile created by a report that turned out
 * to be mistaken is withdrawn with a reason, which is a different thing and is
 * recorded differently.
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { birthEvents, litters, puppies } from '../db/schema/breeding.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { humanCode } from '../domain/ids.ts';
import { parseCivilDate, todayCivil, type CivilDate } from '../domain/calendar.ts';
import { permitForParty, type PermitRecord } from './permits.ts';
import type { Actor } from '../authz/actor.ts';

export type BirthEventRecord = typeof birthEvents.$inferSelect;
export type LitterRecord = typeof litters.$inferSelect;
export type PuppyRecord = typeof puppies.$inferSelect;

export const PUPPY_STATUS_FA: Record<string, string> = {
  ALIVE: 'زنده',
  DECEASED: 'فوت‌شده پس از تولد',
  WITHDRAWN: 'حذف‌شده با اصلاح گزارش اولیه',
};

/** The provisional identifier of a puppy, distinct from every document. */
export const newPuppyTempCode = (): string => 'PUP-' + humanCode(8);

/**
 * §19.2: the historical count and the current one are different questions, so
 * this view answers both instead of collapsing them into one number.
 */
export interface LitterView {
  readonly litter: LitterRecord | null;
  readonly current: BirthEventRecord | null;
  readonly history: readonly BirthEventRecord[];
  readonly puppies: readonly PuppyRecord[];
  /** Live puppies as first reported, from the original birth event. */
  readonly reportedLiveAtBirth: number;
  readonly reportedDeadAtBirth: number;
  /** Profiles that still exist and have not been withdrawn by a correction. */
  readonly profiles: number;
  readonly livingNow: number;
  readonly diedAfterBirth: number;
}

function assertCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw validation(label + ' باید عدد صحیح و نامنفی باشد.');
  }
  return value;
}

function assertBirthDate(value: string): CivilDate {
  const date = value.trim();
  if (date === '') throw validation('تاریخ تولد را وارد کنید.');
  try {
    parseCivilDate(date);
  } catch {
    throw validation('تاریخ واردشده معتبر نیست.');
  }
  if (date > todayCivil()) throw validation('تاریخ تولد نمی‌تواند در آینده باشد.');
  return date;
}

/** §19.1: the birth report starts from a permit that was issued. */
async function requireIssuedPermit(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.status !== 'ISSUED') {
    throw conflict('ثبت نتیجه زایمان فقط روی پرونده‌ای با مجوز صادرشده ممکن است.');
  }
  return permit;
}

export async function birthHistory(database: DbClient, permitId: string): Promise<readonly BirthEventRecord[]> {
  return database
    .select()
    .from(birthEvents)
    .where(eq(birthEvents.permitId, permitId))
    .orderBy(desc(birthEvents.version));
}

export async function litterOfPermit(database: DbClient, permitId: string): Promise<LitterRecord | null> {
  const [row] = await database.select().from(litters).where(eq(litters.permitId, permitId)).limit(1);
  return row ?? null;
}

export async function puppiesOfPermit(database: DbClient, permitId: string): Promise<readonly PuppyRecord[]> {
  return database
    .select()
    .from(puppies)
    .where(eq(puppies.permitId, permitId))
    .orderBy(asc(puppies.createdAt));
}

export async function litterView(database: DbClient, permitId: string): Promise<LitterView> {
  const [litter, history, rows] = await Promise.all([
    litterOfPermit(database, permitId),
    birthHistory(database, permitId),
    puppiesOfPermit(database, permitId),
  ]);
  const current = history[0] ?? null;
  const original = history[history.length - 1] ?? null;
  const profiles = rows.filter((row) => row.status !== 'WITHDRAWN');
  return {
    litter,
    current,
    history,
    puppies: rows,
    reportedLiveAtBirth: original?.liveCount ?? 0,
    reportedDeadAtBirth: original?.deadCount ?? 0,
    profiles: profiles.length,
    livingNow: profiles.filter((row) => row.status === 'ALIVE').length,
    diedAfterBirth: rows.filter((row) => row.status === 'DECEASED').length,
  };
}

export interface RecordBirthInput {
  readonly bornOn: string;
  readonly liveCount: number;
  readonly deadCount: number;
  readonly noteFa?: string | null;
}

/**
 * The first birth report — §19.1.
 *
 * Exactly one provisional profile is created per puppy reported born alive.
 * Puppies reported dead at birth are counted and given no profile, no temporary
 * code and no card. Both counts zero is a real outcome: the litter is recorded
 * with no puppy profile at all.
 */
export async function recordBirth(
  database: Database,
  actor: Actor,
  permitId: string,
  input: RecordBirthInput,
): Promise<{ event: BirthEventRecord; created: readonly PuppyRecord[] }> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const bornOn = assertBirthDate(input.bornOn);
  const liveCount = assertCount(input.liveCount, 'تعداد توله زنده');
  const deadCount = assertCount(input.deadCount, 'تعداد توله مرده');
  if (await litterOfPermit(database, permitId)) throw conflict('برای این پرونده نتیجه زایمان ثبت شده است.');

  return database.transaction(async (tx) => {
    const [litter] = await tx.insert(litters).values({ permitId, bornOn }).returning();
    if (!litter) throw conflict('ثبت Litter انجام نشد.');
    const [event] = await tx
      .insert(birthEvents)
      .values({
        permitId,
        version: 1,
        kind: 'INITIAL',
        bornOn,
        liveCount,
        deadCount,
        noteFa: input.noteFa?.trim() || null,
        declaredByAccountId: actor.accountId,
        declaredAt: new Date(),
      })
      .returning();
    if (!event) throw conflict('ثبت نتیجه زایمان انجام نشد.');

    const created: PuppyRecord[] = [];
    for (let i = 0; i < liveCount; i += 1) {
      const [puppy] = await tx
        .insert(puppies)
        .values({ litterId: litter.id, permitId, tempCode: newPuppyTempCode(), createdByVersion: 1 })
        .returning();
      if (!puppy) throw conflict('ساخت پرونده موقت توله انجام نشد.');
      created.push(puppy);
    }

    await recordAudit(tx, actor, {
      action: 'BIRTH_RECORDED',
      targetType: 'BIRTH_EVENT',
      targetId: event.id,
      targetVersion: event.version,
      after: { permitId, bornOn, liveCount, deadCount, createdProfiles: created.length },
    });
    for (const animalId of [permit.sireAnimalId, permit.damAnimalId]) {
      await recordAudit(tx, actor, {
        action: 'ANIMAL_BIRTH_RECORDED',
        targetType: 'ANIMAL',
        targetId: animalId,
        after: { permitId, bornOn, liveCount, deadCount },
      });
    }
    await notifyOtherParty(tx, permit, actor, {
      kind: 'BIRTH_RECORDED',
      titleFa: 'نتیجه زایمان ثبت شد',
      bodyFa: liveCount + ' توله زنده و ' + deadCount + ' توله مرده در پرونده ثبت شد.',
      permitId,
      step: 'BIRTH_RESULT',
    });
    return { event, created };
  });
}

async function notifyOtherParty(
  tx: DbClient,
  permit: PermitRecord,
  actor: Actor,
  input: { kind: string; titleFa: string; bodyFa: string; permitId: string; step: string },
): Promise<void> {
  const other =
    permit.initiatorAccountId === actor.accountId
      ? permit.counterpartyAccountId
      : permit.initiatorAccountId;
  if (!other) return;
  await createNotification(tx, {
    recipientAccountId: other,
    kind: input.kind,
    titleFa: input.titleFa,
    bodyFa: input.bodyFa,
    resume: {
      entity: { type: 'BIRTH_EVENT', id: input.permitId },
      step: input.step,
      originRoute: '/mating/permits/' + input.permitId + '/birth',
    },
  });
}

export interface CorrectBirthInput {
  readonly liveCount: number;
  readonly deadCount: number;
  readonly reasonFa: string;
  readonly expectedVersion: number;
  /**
   * Which existing profiles the correction says should never have existed.
   * A reduction has to name them: a smaller number is never a licence to pick
   * profiles to delete (§19.2).
   */
  readonly withdrawPuppyIds?: readonly string[];
}

/**
 * A correction of the reported counts — §19.2.
 *
 * The existence of puppy profiles never locks this form, and no association
 * review is added. The reconciliation is deliberate rather than automatic: an
 * increase creates only the profiles that are missing, and a decrease has to
 * name which profiles the corrected report withdraws, with a reason. The
 * previous version and every profile stay in the record.
 */
export async function correctBirth(
  database: Database,
  actor: Actor,
  permitId: string,
  input: CorrectBirthInput,
): Promise<{ event: BirthEventRecord; created: readonly PuppyRecord[]; withdrawn: readonly PuppyRecord[] }> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const liveCount = assertCount(input.liveCount, 'تعداد توله زنده');
  const deadCount = assertCount(input.deadCount, 'تعداد توله مرده');
  const reason = (input.reasonFa ?? '').trim();
  if (reason.length < 3) throw validation('برای اصلاح تعداد، ثبت علت الزامی است.');

  const litter = await litterOfPermit(database, permitId);
  if (!litter) throw conflict('ابتدا نتیجه زایمان را ثبت کنید.');
  const [current] = await birthHistory(database, permitId);
  if (!current) throw conflict('ابتدا نتیجه زایمان را ثبت کنید.');
  if (current.version !== input.expectedVersion) {
    throw versionStale(input.expectedVersion, current.version);
  }

  const rows = await puppiesOfPermit(database, permitId);
  // A correction speaks about the original report, so a puppy that died later
  // still counts as one of the profiles this report created (§19.2).
  const standing = rows.filter((row) => row.status !== 'WITHDRAWN');
  const withdrawIds = [...new Set(input.withdrawPuppyIds ?? [])];
  const toWithdraw = withdrawIds.map((id) => {
    const row = standing.find((puppy) => puppy.id === id);
    if (!row) throw notFound('پرونده توله انتخاب‌شده پیدا نشد.');
    return row;
  });

  const remaining = standing.length - toWithdraw.length;
  if (liveCount < remaining) {
    throw validation(
      'برای کاهش تعداد، باید مشخص کنید کدام پرونده‌های توله با این اصلاح حذف می‌شوند؛ حذف خودکار انجام نمی‌شود.',
    );
  }

  return database.transaction(async (tx) => {
    const version = current.version + 1;
    const [event] = await tx
      .insert(birthEvents)
      .values({
        permitId,
        version,
        kind: 'CORRECTION',
        bornOn: current.bornOn,
        liveCount,
        deadCount,
        reasonFa: reason,
        declaredByAccountId: actor.accountId,
        declaredAt: new Date(),
        replacesVersion: current.version,
      })
      .returning();
    if (!event) throw conflict('ثبت اصلاح انجام نشد.');

    const withdrawn: PuppyRecord[] = [];
    for (const row of toWithdraw) {
      const [updated] = await tx
        .update(puppies)
        .set({
          status: 'WITHDRAWN',
          withdrawnByVersion: version,
          withdrawnReasonFa: reason,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(puppies.id, row.id), eq(puppies.version, row.version)))
        .returning();
      if (!updated) throw conflict('این پرونده توله هم‌زمان تغییر کرده است.');
      withdrawn.push(updated);
      await recordAudit(tx, actor, {
        action: 'PUPPY_PROFILE_WITHDRAWN',
        targetType: 'PUPPY',
        targetId: row.id,
        targetVersion: updated.version,
        reason,
        before: { status: row.status },
        after: { status: 'WITHDRAWN', birthEventVersion: version },
      });
    }

    // An increase creates only what is missing; nothing existing is touched.
    const created: PuppyRecord[] = [];
    for (let i = standing.length - toWithdraw.length; i < liveCount; i += 1) {
      const [puppy] = await tx
        .insert(puppies)
        .values({ litterId: litter.id, permitId, tempCode: newPuppyTempCode(), createdByVersion: version })
        .returning();
      if (!puppy) throw conflict('ساخت پرونده موقت توله انجام نشد.');
      created.push(puppy);
    }

    await recordAudit(tx, actor, {
      action: 'BIRTH_COUNTS_CORRECTED',
      targetType: 'BIRTH_EVENT',
      targetId: event.id,
      targetVersion: version,
      reason,
      before: { version: current.version, liveCount: current.liveCount, deadCount: current.deadCount },
      after: {
        version,
        liveCount,
        deadCount,
        createdProfiles: created.map((row) => row.id),
        withdrawnProfiles: withdrawn.map((row) => row.id),
      },
    });
    await notifyOtherParty(tx, permit, actor, {
      kind: 'BIRTH_COUNTS_CORRECTED',
      titleFa: 'اصلاح تعداد توله‌ها',
      bodyFa: 'نسخه ' + version + ' با علت ثبت‌شده در پرونده ثبت شد؛ نسخه قبلی حذف نشده است.',
      permitId,
      step: 'BIRTH_CORRECTION',
    });
    return { event, created, withdrawn };
  });
}

export interface PuppyDeathInput {
  readonly puppyId: string;
  readonly diedOn: string;
  readonly reasonFa: string;
  readonly expectedVersion: number;
}

/**
 * A death after birth — §19.2.
 *
 * This is not the same as having been dead at birth: the puppy keeps its
 * profile and its history, the original live count stays exactly as reported,
 * and only the current living count changes. The event names the puppy it
 * concerns, which is what makes the difference between the two numbers
 * traceable.
 */
export async function recordPuppyDeath(
  database: Database,
  actor: Actor,
  permitId: string,
  input: PuppyDeathInput,
): Promise<PuppyRecord> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const diedOn = assertBirthDate(input.diedOn);
  const reason = (input.reasonFa ?? '').trim();
  if (reason.length < 3) throw validation('برای ثبت مرگ توله، ثبت علت الزامی است.');

  const [puppy] = await database
    .select()
    .from(puppies)
    .where(and(eq(puppies.id, input.puppyId), eq(puppies.permitId, permitId)))
    .limit(1);
  if (!puppy) throw notFound('پرونده توله پیدا نشد.');
  if (puppy.version !== input.expectedVersion) throw versionStale(input.expectedVersion, puppy.version);
  if (puppy.status === 'WITHDRAWN') throw conflict('این پرونده با اصلاح گزارش اولیه حذف شده است.');
  if (puppy.status === 'DECEASED') throw conflict('مرگ این توله قبلاً ثبت شده است.');
  const litter = await litterOfPermit(database, permitId);
  if (litter && diedOn < litter.bornOn) throw validation('تاریخ مرگ نمی‌تواند پیش از تاریخ تولد باشد.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(puppies)
      .set({
        status: 'DECEASED',
        diedOn,
        deathReasonFa: reason,
        deathRecordedByAccountId: actor.accountId,
        deathRecordedAt: new Date(),
        version: puppy.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(puppies.id, puppy.id), eq(puppies.version, input.expectedVersion)))
      .returning();
    if (!row) throw conflict('این پرونده توله هم‌زمان تغییر کرده است.');

    const view = await litterView(tx, permitId);
    await recordAudit(tx, actor, {
      action: 'PUPPY_DIED_AFTER_BIRTH',
      targetType: 'PUPPY',
      targetId: row.id,
      targetVersion: row.version,
      reason,
      before: { status: 'ALIVE' },
      after: {
        status: 'DECEASED',
        diedOn,
        // The reported count stays; only the current number moves (§19.2).
        reportedLiveAtBirth: view.reportedLiveAtBirth,
        livingNow: view.livingNow,
      },
    });
    await notifyOtherParty(tx, permit, actor, {
      kind: 'PUPPY_DIED_AFTER_BIRTH',
      titleFa: 'ثبت مرگ توله پس از تولد',
      bodyFa: 'پرونده و سابقه این توله حفظ می‌شود و تعداد ثبت‌شده در زمان تولد تغییر نمی‌کند.',
      permitId,
      step: 'PUPPY_DEATH',
    });
    return row;
  });
}

/** Renaming a live puppy stays optional until the microchip stage (§19.1). */
export async function renamePuppy(
  database: Database,
  actor: Actor,
  permitId: string,
  input: { puppyId: string; nameFa: string | null; expectedVersion: number },
): Promise<PuppyRecord> {
  await requireIssuedPermit(database, actor, permitId);
  const [puppy] = await database
    .select()
    .from(puppies)
    .where(and(eq(puppies.id, input.puppyId), eq(puppies.permitId, permitId)))
    .limit(1);
  if (!puppy) throw notFound('پرونده توله پیدا نشد.');
  if (puppy.status === 'WITHDRAWN') throw forbidden('این پرونده با اصلاح گزارش اولیه حذف شده است.');
  if (puppy.version !== input.expectedVersion) throw versionStale(input.expectedVersion, puppy.version);

  const [row] = await database
    .update(puppies)
    .set({ nameFa: input.nameFa?.trim() || null, version: puppy.version + 1, updatedAt: new Date() })
    .where(and(eq(puppies.id, puppy.id), eq(puppies.version, input.expectedVersion)))
    .returning();
  if (!row) throw conflict('این پرونده توله هم‌زمان تغییر کرده است.');
  await recordAudit(database, actor, {
    action: 'PUPPY_RENAMED',
    targetType: 'PUPPY',
    targetId: row.id,
    targetVersion: row.version,
    before: { nameFa: puppy.nameFa },
    after: { nameFa: row.nameFa },
  });
  return row;
}
