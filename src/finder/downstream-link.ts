/**
 * The small piece of the Finder the shared date protocol needs — PHASE-4 PROMPT-006.
 *
 * When the other side confirms a date on a permit or a personal mating that a
 * Finder contract leads to, the request behind that contract becomes
 * MATING_COMPLETED in the same transaction. A permit that no Finder contract
 * links to is untouched: this finds nothing and returns.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { finderDownstreamLinks } from '../db/schema/mating.ts';
import { finderContracts, matingRequests } from '../db/schema/finder.ts';
import type { Actor } from '../authz/actor.ts';
import { counterpartOf, lockAnimals, moveRequest, notifyFinder, releaseCoordination } from './requests.ts';

export async function completeLinkedRequest(
  tx: DbClient,
  actor: Actor,
  kind: 'PERMIT' | 'PERSONAL',
  subjectId: string,
  now: Date = new Date(),
): Promise<void> {
  const [link] = await tx
    .select({ contractId: finderDownstreamLinks.contractId })
    .from(finderDownstreamLinks)
    .where(
      and(
        kind === 'PERMIT' ? eq(finderDownstreamLinks.permitId, subjectId) : eq(finderDownstreamLinks.personalMatingId, subjectId),
        isNull(finderDownstreamLinks.detachedAt),
      ),
    )
    .limit(1);
  if (!link) return;
  const [peek] = await tx
    .select({ sender: matingRequests.senderAnimalId, receiver: matingRequests.receiverAnimalId })
    .from(finderContracts)
    .innerJoin(matingRequests, eq(matingRequests.id, finderContracts.requestId))
    .where(eq(finderContracts.id, link.contractId))
    .limit(1);
  if (!peek) return;
  // Same lock order as startContract: the animals first, then the request row.
  await lockAnimals(tx, [peek.sender, peek.receiver]);
  const [row] = await tx
    .select({ request: matingRequests })
    .from(finderContracts)
    .innerJoin(matingRequests, eq(matingRequests.id, finderContracts.requestId))
    .where(eq(finderContracts.id, link.contractId))
    .for('update', { of: matingRequests })
    .limit(1);
  // Only the first confirmed date moves the request; later ones are more history.
  if (!row || row.request.status !== 'CONTRACT_CONFIRMED') return;
  await moveRequest(tx, row.request, 'MATING_COMPLETED', actor, null, {}, now);
  // The mating happened: both animals leave coordination and are available again,
  // with the cooldown warning computed from this very date.
  await releaseCoordination(tx, row.request.id, now);
  await notifyFinder(
    tx,
    counterpartOf(row.request, actor.accountId),
    'FINDER_REQUEST_OUTCOME',
    'جفت‌گیری ثبت شد',
    'تاریخ جفت‌گیری به‌صورت دوطرفه تأیید شد.',
    row.request.id,
  );
}
