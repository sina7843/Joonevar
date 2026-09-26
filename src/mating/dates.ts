/**
 * Official mating dates and the cooldown basis — §17.1, §17.2, §17.3, D12.
 *
 * Only a permit that has actually been issued opens this. Either participant
 * may declare a date, as often as they like, and every declaration is a new
 * version rather than an edit of the last one: history is never overwritten. A
 * date becomes the official basis only once the other side has confirmed that
 * exact version.
 *
 * PHASE-4 PROMPT-006: the same protocol also serves the contract-backed personal
 * mating of the Finder. A row belongs to exactly one subject (a permit or a
 * personal mating, enforced by a CHECK), so the two paths share the rules but
 * never each other's rows or effects.
 */
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { finderPersonalMatings, matingDateDeclarations, matingPermits } from '../db/schema/mating.ts';
import { profiles } from '../db/schema/identity.ts';
import { refreshLastMating } from '../finder/last-mating.ts';
import { completeLinkedRequest } from '../finder/downstream-link.ts';
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

/**
 * What a date belongs to. The two parties, the two animals and where the
 * counterparty is sent are all the protocol needs; which path it is stays in
 * `kind` and in the row's own column.
 */
export interface DateSubject {
  readonly kind: 'PERMIT' | 'PERSONAL';
  readonly id: string;
  readonly parties: readonly [string, string];
  readonly sireAnimalId: string;
  readonly damAnimalId: string;
  readonly route: string;
}

export const permitSubject = (permit: PermitRecord): DateSubject => ({
  kind: 'PERMIT',
  id: permit.id,
  parties: [permit.initiatorAccountId, permit.counterpartyAccountId ?? permit.initiatorAccountId],
  sireAnimalId: permit.sireAnimalId,
  damAnimalId: permit.damAnimalId,
  route: '/mating/permits/' + permit.id + '/dates',
});

export type PersonalMatingRecord = typeof finderPersonalMatings.$inferSelect;

export const personalSubject = (mating: PersonalMatingRecord): DateSubject => ({
  kind: 'PERSONAL',
  id: mating.id,
  parties: [mating.sireAccountId, mating.damAccountId],
  sireAnimalId: mating.sireAnimalId,
  damAnimalId: mating.damAnimalId,
  route: '/account/mating-finder/personal/' + mating.id,
});

/** A party of an ACTIVE personal mating; anyone else gets the same not-found. */
export async function personalMatingForParty(
  database: DbClient,
  actor: Actor,
  id: string,
  opts: { requireActive?: boolean } = {},
): Promise<PersonalMatingRecord> {
  const [row] = await database.select().from(finderPersonalMatings).where(eq(finderPersonalMatings.id, id)).limit(1);
  if (!row || (row.sireAccountId !== actor.accountId && row.damAccountId !== actor.accountId)) {
    throw notFound('پرونده جفت‌گیری شخصی پیدا نشد.');
  }
  if (opts.requireActive && row.status !== 'ACTIVE') throw conflict('این پرونده لغو شده است؛ تاریخ تازه‌ای روی آن ثبت نمی‌شود.');
  return row;
}

const ofSubject = (subject: DateSubject): SQL =>
  subject.kind === 'PERMIT'
    ? eq(matingDateDeclarations.permitId, subject.id)
    : eq(matingDateDeclarations.personalMatingId, subject.id);

const subjectColumns = (subject: DateSubject) =>
  subject.kind === 'PERMIT' ? { permitId: subject.id } : { personalMatingId: subject.id };

export async function datesOfSubject(database: DbClient, subject: DateSubject): Promise<readonly DateRecord[]> {
  return database.select().from(matingDateDeclarations).where(ofSubject(subject)).orderBy(desc(matingDateDeclarations.version));
}

export async function pendingDateOf(database: DbClient, subject: DateSubject): Promise<DateRecord | null> {
  const [row] = await database
    .select()
    .from(matingDateDeclarations)
    .where(and(ofSubject(subject), eq(matingDateDeclarations.status, 'PROPOSED')))
    .orderBy(desc(matingDateDeclarations.version))
    .limit(1);
  return row ?? null;
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

/**
 * The next version of one subject. A per-subject advisory lock (re-entrant within
 * the transaction) serialises two declarations or corrections racing on it, so
 * neither reuses a version number and only one of two corrections of the same
 * version succeeds.
 */
const lockSubject = (tx: DbClient, subject: DateSubject) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext('mating_date:' || ${subject.id}))`);

async function nextVersion(tx: DbClient, subject: DateSubject): Promise<number> {
  await lockSubject(tx, subject);
  const [row] = await tx
    .select({ max: sql<number | null>`max(${matingDateDeclarations.version})` })
    .from(matingDateDeclarations)
    .where(ofSubject(subject));
  return (row?.max ?? 0) + 1;
}

const otherParty = (subject: DateSubject, actor: Actor): string =>
  subject.parties[0] === actor.accountId ? subject.parties[1] : subject.parties[0];

async function notifyCounterparty(
  tx: DbClient,
  subject: DateSubject,
  actor: Actor,
  kind: string,
  titleFa: string,
  bodyFa: string,
): Promise<void> {
  await createNotification(tx, {
    recipientAccountId: otherParty(subject, actor),
    kind,
    titleFa,
    bodyFa,
    resume: {
      entity: { type: 'MATING_DATE_DECLARATION', id: subject.id },
      step: 'DATE_CONFIRMATION',
      originRoute: subject.route,
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
  return declareDateOn(database, actor, permitSubject(permit), input);
}

/** The protocol itself, for either subject; the caller has already checked the party. */
export async function declareDateOn(
  database: Database,
  actor: Actor,
  subject: DateSubject,
  input: DeclareDateInput,
): Promise<DateRecord> {
  const permitId = subject.id;
  const matedOn = assertDeclarableDate(input.matedOn);
  // §17.2: the warning never blocks, so what is worth recording is that it was
  // shown and the person went ahead.
  const advisory = await cooldownAdvisoryForAnimals(database, [subject.sireAnimalId, subject.damAnimalId]);

  return database.transaction(async (tx) => {
    await lockSubject(tx, subject);
    let replaces: number | null = null;
    if (input.replacesVersion !== null && input.replacesVersion !== undefined) {
      const [previous] = await tx
        .select()
        .from(matingDateDeclarations)
        .where(and(ofSubject(subject), eq(matingDateDeclarations.version, input.replacesVersion)))
        .limit(1);
      if (!previous) throw notFound('نسخه‌ای که اصلاح می‌کنید پیدا نشد.');
      if (previous.status !== 'PROPOSED') throw conflict('این نسخه دیگر در انتظار تأیید نیست.');
      // The old row stays readable; only its pending approval is retired.
      const [retired] = await tx
        .update(matingDateDeclarations)
        .set({ status: 'SUPERSEDED' })
        .where(and(eq(matingDateDeclarations.id, previous.id), eq(matingDateDeclarations.status, 'PROPOSED')))
        .returning({ id: matingDateDeclarations.id });
      if (!retired) throw conflict('این نسخه هم‌زمان تغییر کرده است؛ نسخه جدید را ببینید.');
      replaces = previous.version;
    }

    const version = await nextVersion(tx, subject);
    const [row] = await tx
      .insert(matingDateDeclarations)
      .values({
        ...subjectColumns(subject),
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
      after: { subject: subject.kind, subjectId: permitId, matedOn, version, replacesVersion: replaces },
    });
    await recordCooldownContinuation(tx, actor, advisory, {
      type: 'MATING_DATE_DECLARATION',
      id: row.id,
      step: 'DATE_DECLARATION',
    });
    await notifyCounterparty(
      tx,
      subject,
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
  return confirmDateOn(database, actor, permitSubject(permit), input);
}

export async function confirmDateOn(
  database: Database,
  actor: Actor,
  subject: DateSubject,
  input: { declarationId: string; expectedVersion: number },
): Promise<DateRecord> {
  const permitId = subject.id;
  const [declaration] = await database
    .select()
    .from(matingDateDeclarations)
    .where(and(eq(matingDateDeclarations.id, input.declarationId), ofSubject(subject)))
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
      after: { subject: subject.kind, subjectId: permitId, matedOn: row.matedOn, version: row.version },
    });
    // The confirmed date belongs to both animals' files (§10, §17.1).
    for (const animalId of [subject.sireAnimalId, subject.damAnimalId]) {
      await recordAudit(tx, actor, {
        action: 'ANIMAL_MATING_DATE_CONFIRMED',
        targetType: 'ANIMAL',
        targetId: animalId,
        after: { subject: subject.kind, subjectId: permitId, matedOn: row.matedOn, version: row.version },
      });
    }
    // The derived last mating of both animals moves in this same transaction,
    // and only here: nothing else writes it (Phase 4, PROMPT-003, R5).
    await refreshLastMating(tx, [subject.sireAnimalId, subject.damAnimalId]);
    // A Finder request that led here is now MATING_COMPLETED (PROMPT-006).
    await completeLinkedRequest(tx, actor, subject.kind, subject.id);
    await notifyCounterparty(
      tx,
      subject,
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
  return declareDifferentDateOn(database, actor, permitSubject(permit), input);
}

export async function declareDifferentDateOn(
  database: Database,
  actor: Actor,
  subject: DateSubject,
  input: { declarationId: string; expectedVersion: number; matedOn: string; noteFa?: string | null },
): Promise<{ conflicted: DateRecord; proposed: DateRecord }> {
  const matedOn = assertDeclarableDate(input.matedOn);

  const [declaration] = await database
    .select()
    .from(matingDateDeclarations)
    .where(and(eq(matingDateDeclarations.id, input.declarationId), ofSubject(subject)))
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

    const version = await nextVersion(tx, subject);
    const [proposed] = await tx
      .insert(matingDateDeclarations)
      .values({
        ...subjectColumns(subject),
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
      subject,
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
