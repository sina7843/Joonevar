/**
 * Death, missing, found, archived, restored — PHASE-4 PROMPT-003.
 *
 * The animal record had no way to say any of these (DEC-0217 §1). They are
 * recorded here by the owner, with a date and a reason, append-only; the
 * animal row is not rewritten and nothing is deleted. Death is final.
 *
 * The finder reacts in the same transaction: an animal that is no longer
 * active leaves the finder, and (PROMPT-005) its open requests close with the
 * reason. Finding or restoring an animal does not put it back on the finder:
 * the owner opts in again.
 */
import { asc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { animalLifeEvents } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { notFound, validation, conflict } from '../domain/errors.ts';
import { compareCivilDates, todayCivil } from '../domain/calendar.ts';
import type { Actor } from '../authz/actor.ts';
import { isLifeEventKind, lifeEventProblem, lifeStatus, type LifeEventKind, type LifeStatus } from '../finder/profile-model.ts';
import { deactivateProfileOf } from '../finder/profiles.ts';

export async function lifeEventsOf(database: DbClient, animalId: string) {
  return database
    .select()
    .from(animalLifeEvents)
    .where(eq(animalLifeEvents.animalId, animalId))
    .orderBy(asc(animalLifeEvents.createdAt), asc(animalLifeEvents.id));
}

export async function recordAnimalLifeEvent(
  database: Database,
  actor: Actor,
  input: { animalId: string; kind: string; occurredOn: string; reasonFa: string },
  now: Date = new Date(),
): Promise<LifeStatus> {
  if (!isLifeEventKind(input.kind)) throw validation('نوع رویداد را انتخاب کنید.');
  const kind: LifeEventKind = input.kind;
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('توضیح این رویداد را بنویسید؛ در سابقه حیوان می‌ماند.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) throw validation('تاریخ رویداد را کامل وارد کنید.');
  if (compareCivilDates(input.occurredOn, todayCivil(now)) > 0) throw validation('تاریخ رویداد نمی‌تواند در آینده باشد.');

  return database.transaction(async (tx) => {
    // The animal row is the per-animal mutex: two events at once are decided in turn.
    const [animal] = await tx.select().from(animals).where(eq(animals.id, input.animalId)).for('update').limit(1);
    if (!animal || animal.ownerAccountId !== actor.accountId) throw notFound('پرونده حیوان پیدا نشد.');
    if (animal.status !== 'REGISTERED') throw conflict('رویداد فقط برای حیوان ثبت‌شده پذیرفته می‌شود.');
    const before = lifeStatus((await lifeEventsOf(tx, animal.id)).map((e) => e.kind as LifeEventKind));
    const problem = lifeEventProblem(before, kind);
    if (problem) throw conflict(problem);

    const [event] = await tx
      .insert(animalLifeEvents)
      .values({ animalId: animal.id, kind, occurredOn: input.occurredOn, reasonFa, recordedByAccountId: actor.accountId, createdAt: now })
      .returning();
    const after = lifeStatus([...(await lifeEventsOf(tx, animal.id)).map((e) => e.kind as LifeEventKind)]);
    await recordAudit(tx, actor, {
      action: 'ANIMAL_LIFE_EVENT_RECORDED',
      targetType: 'ANIMAL',
      targetId: animal.id,
      before: { lifeStatus: before },
      after: { lifeStatus: after, kind, occurredOn: input.occurredOn, eventId: event!.id },
      reason: reasonFa,
    });
    if (after !== 'ACTIVE') await deactivateProfileOf(tx, animal.id, 'LIFE_EVENT', actor, reasonFa, now);
    return after;
  });
}
