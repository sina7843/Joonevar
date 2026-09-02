/**
 * Official mating dates and the cooldown basis — §17.1, §17.2, §17.3, D12.
 *
 * Only a permit that has actually been issued opens this. Either participant
 * may declare a date, as often as they like, and every declaration is a new
 * version rather than an edit of the last one: history is never overwritten. A
 * date becomes the official basis only once the other side has confirmed that
 * exact version.
 */
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { matingDateDeclarations, matingPermits } from '../db/schema/mating.ts';
import { profiles } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { parseCivilDate, todayCivil, type CivilDate } from '../domain/calendar.ts';
import { permitForParty, type PermitRecord } from './permits.ts';
import {
  cooldownAdvisoryForAnimals,
  latestConfirmedDateOfAnimal,
  recordCooldownContinuation,
} from './cooldown.ts';
import type { Actor } from '../authz/actor.ts';

export type DateRecord = typeof matingDateDeclarations.$inferSelect;

export const DATE_STATUS_FA: Record<string, string> = {
  PROPOSED: 'در انتظار تأیید طرف مقابل',
  CONFIRMED: 'تأییدشده دوطرفه',
  SUPERSEDED: 'جایگزین‌شده با نسخه جدید',
  CONFLICTED: 'مغایرت تاریخ (DATE_CONFLICT)',
};

/** A date is a civil day; a future day is not a mating that has happened. */
function assertDeclarableDate(value: string): CivilDate {
  const date = value.trim();
  if (date === '') throw validation('تاریخ جفت‌گیری را وارد کنید.');
  try {
    parseCivilDate(date);
  } catch {
    throw validation('تاریخ واردشده معتبر نیست.');
  }
  if (date > todayCivil()) throw validation('تاریخ جفت‌گیری نمی‌تواند در آینده باشد.');
  return date;
}

/** §17.1: the entry is a permit that has actually been issued. */
async function requireIssuedPermit(
  database: DbClient,
  actor: Actor,
  permitId: string,
): Promise<PermitRecord> {
  const permit = await permitForParty(database, actor, permitId);
  if (permit.status !== 'ISSUED') {
    throw conflict('اعلام تاریخ رسمی فقط روی پرونده‌ای با مجوز صادرشده ممکن است.');
  }
  return permit;
}

export async function datesOfPermit(database: DbClient, permitId: string): Promise<readonly DateRecord[]> {
  return database
    .select()
    .from(matingDateDeclarations)
    .where(eq(matingDateDeclarations.permitId, permitId))
    .orderBy(desc(matingDateDeclarations.version));
}

/** The version still waiting for the other side, if there is one. */
export async function pendingDate(database: DbClient, permitId: string): Promise<DateRecord | null> {
  const [row] = await database
    .select()
    .from(matingDateDeclarations)
    .where(
      and(eq(matingDateDeclarations.permitId, permitId), eq(matingDateDeclarations.status, 'PROPOSED')),
    )
    .orderBy(desc(matingDateDeclarations.version))
    .limit(1);
  return row ?? null;
}

async function nextVersion(tx: DbClient, permitId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${matingDateDeclarations.version})` })
    .from(matingDateDeclarations)
    .where(eq(matingDateDeclarations.permitId, permitId));
  return (row?.max ?? 0) + 1;
}

const otherParty = (permit: PermitRecord, actor: Actor): string =>
  permit.initiatorAccountId === actor.accountId
    ? (permit.counterpartyAccountId ?? permit.initiatorAccountId)
    : permit.initiatorAccountId;

async function notifyCounterparty(
  tx: DbClient,
  permit: PermitRecord,
  actor: Actor,
  kind: string,
  titleFa: string,
  bodyFa: string,
): Promise<void> {
  await createNotification(tx, {
    recipientAccountId: otherParty(permit, actor),
    kind,
    titleFa,
    bodyFa,
    resume: {
      entity: { type: 'MATING_DATE_DECLARATION', id: permit.id },
      step: 'DATE_CONFIRMATION',
      originRoute: '/mating/permits/' + permit.id + '/dates',
    },
  });
}

export interface DeclareDateInput {
  readonly matedOn: string;
  readonly noteFa?: string | null;
  /**
   * The version being corrected. A correction appends a new version, marks the
   * old one SUPERSEDED and needs the counterparty's confirmation again (§17.1).
   */
  readonly replacesVersion?: number | null;
}

/**
 * Declares a date — §17.1.
 *
 * Both participants may do this, several times, including more than once in a
 * week. Nothing is overwritten: an outstanding proposal that this one corrects
 * becomes SUPERSEDED, and any approval it had stops counting.
 */
export async function declareDate(
  database: Database,
  actor: Actor,
  permitId: string,
  input: DeclareDateInput,
): Promise<DateRecord> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const matedOn = assertDeclarableDate(input.matedOn);
  // §17.2: the warning never blocks, so what is worth recording is that it was
  // shown and the person went ahead.
  const advisory = await cooldownAdvisoryForAnimals(database, [permit.sireAnimalId, permit.damAnimalId]);

  return database.transaction(async (tx) => {
    let replaces: number | null = null;
    if (input.replacesVersion !== null && input.replacesVersion !== undefined) {
      const [previous] = await tx
        .select()
        .from(matingDateDeclarations)
        .where(
          and(
            eq(matingDateDeclarations.permitId, permitId),
            eq(matingDateDeclarations.version, input.replacesVersion),
          ),
        )
        .limit(1);
      if (!previous) throw notFound('نسخه‌ای که اصلاح می‌کنید پیدا نشد.');
      if (previous.status !== 'PROPOSED') throw conflict('این نسخه دیگر در انتظار تأیید نیست.');
      // The old row stays readable; only its pending approval is retired.
      await tx
        .update(matingDateDeclarations)
        .set({ status: 'SUPERSEDED' })
        .where(and(eq(matingDateDeclarations.id, previous.id), eq(matingDateDeclarations.status, 'PROPOSED')));
      replaces = previous.version;
    }

    const version = await nextVersion(tx, permitId);
    const [row] = await tx
      .insert(matingDateDeclarations)
      .values({
        permitId,
        version,
        matedOn,
        declaredByAccountId: actor.accountId,
        declaredAt: new Date(),
        replacesVersion: replaces,
        noteFa: input.noteFa?.trim() || null,
      })
      .returning();
    if (!row) throw conflict('ثبت تاریخ انجام نشد.');

    await recordAudit(tx, actor, {
      action: replaces === null ? 'MATING_DATE_DECLARED' : 'MATING_DATE_CORRECTED',
      targetType: 'MATING_DATE_DECLARATION',
      targetId: row.id,
      targetVersion: row.version,
      after: { permitId, matedOn, version, replacesVersion: replaces },
    });
    await recordCooldownContinuation(tx, actor, advisory, {
      type: 'MATING_DATE_DECLARATION',
      id: row.id,
      step: 'DATE_DECLARATION',
    });
    await notifyCounterparty(
      tx,
      permit,
      actor,
      replaces === null ? 'MATING_DATE_DECLARED' : 'MATING_DATE_CORRECTED',
      replaces === null ? 'اعلام تاریخ جفت‌گیری' : 'اصلاح تاریخ جفت‌گیری',
      'نسخه ' + version + ' برای تأیید شما ثبت شد.',
    );
    return row;
  });
}

/**
 * Confirms one exact version — §17.1.
 *
 * The confirmation is bound to the version it was shown for, so an approval
 * that was already open when a correction arrived cannot confirm the new one.
 */
export async function confirmDate(
  database: Database,
  actor: Actor,
  permitId: string,
  input: { declarationId: string; expectedVersion: number },
): Promise<DateRecord> {
  const permit = await requireIssuedPermit(database, actor, permitId);

  const [declaration] = await database
    .select()
    .from(matingDateDeclarations)
    .where(
      and(
        eq(matingDateDeclarations.id, input.declarationId),
        eq(matingDateDeclarations.permitId, permitId),
      ),
    )
    .limit(1);
  if (!declaration) throw notFound('این اعلام تاریخ پیدا نشد.');
  if (declaration.version !== input.expectedVersion) {
    throw versionStale(input.expectedVersion, declaration.version);
  }
  if (declaration.declaredByAccountId === actor.accountId) {
    throw forbidden('تأیید تاریخ با طرف مقابلِ اعلام‌کننده است.');
  }
  if (declaration.status !== 'PROPOSED') {
    throw conflict('این نسخه در انتظار تأیید نیست؛ نسخه جدیدتر را تأیید کنید.');
  }

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(matingDateDeclarations)
      .set({ status: 'CONFIRMED', confirmedByAccountId: actor.accountId, confirmedAt: new Date() })
      .where(
        and(
          eq(matingDateDeclarations.id, declaration.id),
          eq(matingDateDeclarations.version, input.expectedVersion),
          eq(matingDateDeclarations.status, 'PROPOSED'),
        ),
      )
      .returning();
    if (!row) throw conflict('این نسخه هم‌زمان تغییر کرده است؛ نسخه جدید را ببینید.');

    await recordAudit(tx, actor, {
      action: 'MATING_DATE_CONFIRMED',
      targetType: 'MATING_DATE_DECLARATION',
      targetId: row.id,
      targetVersion: row.version,
      after: { permitId, matedOn: row.matedOn, version: row.version },
    });
    // The confirmed date belongs to both animals' files (§10, §17.1).
    for (const animalId of [permit.sireAnimalId, permit.damAnimalId]) {
      await recordAudit(tx, actor, {
        action: 'ANIMAL_MATING_DATE_CONFIRMED',
        targetType: 'ANIMAL',
        targetId: animalId,
        after: { permitId, matedOn: row.matedOn, version: row.version },
      });
    }
    await notifyCounterparty(
      tx,
      permit,
      actor,
      'MATING_DATE_CONFIRMED',
      'تاریخ جفت‌گیری تأیید شد',
      'نسخه ' + row.version + ' به‌صورت دوطرفه تأیید شد.',
    );
    return row;
  });
}

/**
 * Answers with a different date — §17.1, DATE_CONFLICT.
 *
 * Both values stay visible: the version answered becomes CONFLICTED and the new
 * one points back at it, so nobody has to guess what the disagreement was.
 */
export async function declareDifferentDate(
  database: Database,
  actor: Actor,
  permitId: string,
  input: { declarationId: string; expectedVersion: number; matedOn: string; noteFa?: string | null },
): Promise<{ conflicted: DateRecord; proposed: DateRecord }> {
  const permit = await requireIssuedPermit(database, actor, permitId);
  const matedOn = assertDeclarableDate(input.matedOn);

  const [declaration] = await database
    .select()
    .from(matingDateDeclarations)
    .where(
      and(
        eq(matingDateDeclarations.id, input.declarationId),
        eq(matingDateDeclarations.permitId, permitId),
      ),
    )
    .limit(1);
  if (!declaration) throw notFound('این اعلام تاریخ پیدا نشد.');
  if (declaration.version !== input.expectedVersion) {
    throw versionStale(input.expectedVersion, declaration.version);
  }
  if (declaration.declaredByAccountId === actor.accountId) {
    throw forbidden('پاسخ به اعلام تاریخ با طرف مقابل است.');
  }
  if (declaration.status !== 'PROPOSED') throw conflict('این نسخه در انتظار پاسخ نیست.');
  if (declaration.matedOn === matedOn) {
    throw validation('این همان تاریخ اعلام‌شده است؛ برای پذیرش، آن را تأیید کنید.');
  }

  return database.transaction(async (tx) => {
    const [conflicted] = await tx
      .update(matingDateDeclarations)
      .set({ status: 'CONFLICTED' })
      .where(
        and(
          eq(matingDateDeclarations.id, declaration.id),
          eq(matingDateDeclarations.version, input.expectedVersion),
          eq(matingDateDeclarations.status, 'PROPOSED'),
        ),
      )
      .returning();
    if (!conflicted) throw conflict('این نسخه هم‌زمان تغییر کرده است.');

    const version = await nextVersion(tx, permitId);
    const [proposed] = await tx
      .insert(matingDateDeclarations)
      .values({
        permitId,
        version,
        matedOn,
        declaredByAccountId: actor.accountId,
        declaredAt: new Date(),
        conflictsWithId: conflicted.id,
        noteFa: input.noteFa?.trim() || null,
      })
      .returning();
    if (!proposed) throw conflict('ثبت تاریخ متفاوت انجام نشد.');

    await recordAudit(tx, actor, {
      action: 'MATING_DATE_CONFLICT',
      targetType: 'MATING_DATE_DECLARATION',
      targetId: proposed.id,
      targetVersion: proposed.version,
      before: { version: conflicted.version, matedOn: conflicted.matedOn },
      after: { version: proposed.version, matedOn: proposed.matedOn },
    });
    await notifyCounterparty(
      tx,
      permit,
      actor,
      'MATING_DATE_CONFLICT',
      'مغایرت تاریخ جفت‌گیری',
      'طرف مقابل تاریخ دیگری اعلام کرد؛ هر دو مقدار در پرونده دیده می‌شود.',
    );
    return { conflicted, proposed };
  });
}

// ── The official basis ────────────────────────────────────────────────────

/** Both sides of one permit, for the warning shown on its screens. */
export async function confirmedBasisForPermit(
  database: DbClient,
  permit: PermitRecord,
): Promise<{ sire: CivilDate | null; dam: CivilDate | null }> {
  const [sire, dam] = await Promise.all([
    latestConfirmedDateOfAnimal(database, permit.sireAnimalId),
    latestConfirmedDateOfAnimal(database, permit.damAnimalId),
  ]);
  return { sire, dam };
}

/** Every confirmed date of an animal, newest first, for its timeline (§10). */
export async function confirmedDatesOfAnimal(database: DbClient, animalId: string) {
  return database
    .select({
      matedOn: matingDateDeclarations.matedOn,
      version: matingDateDeclarations.version,
      confirmedAt: matingDateDeclarations.confirmedAt,
      permitId: matingPermits.id,
      permitNo: matingPermits.permitNo,
    })
    .from(matingDateDeclarations)
    .innerJoin(matingPermits, eq(matingPermits.id, matingDateDeclarations.permitId))
    .where(
      and(
        eq(matingDateDeclarations.status, 'CONFIRMED'),
        or(eq(matingPermits.sireAnimalId, animalId), eq(matingPermits.damAnimalId, animalId)),
      ),
    )
    .orderBy(desc(matingDateDeclarations.matedOn));
}

/** Declarer names for the history list, limited to the two participants. */
export async function declarerNames(
  database: DbClient,
  permit: PermitRecord,
): Promise<Record<string, string>> {
  const ids = [permit.initiatorAccountId, permit.counterpartyAccountId].filter(
    (value): value is string => value !== null,
  );
  const rows = await database
    .select({ accountId: profiles.accountId, firstName: profiles.firstName, lastName: profiles.lastName })
    .from(profiles)
    .where(inArray(profiles.accountId, ids));
  const out: Record<string, string> = {};
  for (const row of rows) out[row.accountId] = row.firstName + ' ' + row.lastName.trim().slice(0, 1) + '.';
  return out;
}

/** The animals of one permit, for the cooldown warning's wording. */
export async function permitAnimals(database: DbClient, permit: PermitRecord) {
  const rows = await database
    .select({ id: animals.id, name: animals.name, sex: animals.sex })
    .from(animals)
    .where(inArray(animals.id, [permit.sireAnimalId, permit.damAnimalId]));
  return rows;
}
