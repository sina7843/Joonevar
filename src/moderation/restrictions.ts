/**
 * Publisher restrictions, read side — shared by the content service (which
 * enforces them) and the moderation service (which creates and lifts them).
 * Kept apart so neither service has to import the other for this question.
 */
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { publisherRestrictions } from '../db/schema/moderation.ts';
import { formatInstantFa } from '../content/model.ts';

export type RestrictionRow = typeof publisherRestrictions.$inferSelect;

/** The restriction in force for an account at `now`, if any — decided at read time, no scheduler. */
export async function activeRestrictionFor(
  database: DbClient,
  accountId: string,
  now: Date = new Date(),
): Promise<RestrictionRow | null> {
  const [row] = await database
    .select()
    .from(publisherRestrictions)
    .where(
      and(
        eq(publisherRestrictions.accountId, accountId),
        isNull(publisherRestrictions.liftedAt),
        lte(publisherRestrictions.startsAt, now),
        or(isNull(publisherRestrictions.endsAt), gt(publisherRestrictions.endsAt, now)),
      ),
    )
    .orderBy(desc(publisherRestrictions.createdAt))
    .limit(1);
  return row ?? null;
}

export function restrictionMessage(restriction: RestrictionRow): string {
  return (
    'انتشار و تغییر محتوای منتشرشده برای این حساب ' +
    (restriction.endsAt ? 'تا ' + formatInstantFa(restriction.endsAt) : 'تا اطلاع بعدی') +
    ' محدود شده است. دلیل: ' +
    restriction.reason
  );
}
