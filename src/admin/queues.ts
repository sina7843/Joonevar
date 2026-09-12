/**
 * The review queues of Requirements-Phase-2 §21 (PROMPT-016).
 *
 * §21 asks for the queues to exist "with independent permissions". They already
 * do — each was built by the prompt that owns it — so this module adds no queue
 * of its own. It asks each one how much work is waiting, and asks it as the
 * signed-in actor, so an operator sees exactly the queues they may open and
 * nothing about the ones they may not.
 *
 * A queue that refuses the actor is left out rather than shown as zero: zero is
 * a fact about the queue, and we do not have that fact when we are not allowed
 * to read it.
 */
import type { DbClient } from '../db/client.ts';
import type { Actor } from '../authz/actor.ts';
import { AppError } from '../domain/errors.ts';
import { vetApplicationQueue } from '../vets/onboarding.ts';
import { centreClaimQueue } from '../centres/claims.ts';
import { suggestionQueue } from '../suggestions/service.ts';
import { openReportQueue } from '../moderation/service.ts';

export interface QueueCard {
  readonly key: string;
  readonly labelFa: string;
  readonly href: string;
  /** How many cases are waiting right now. */
  readonly waiting: number;
}

/** A queue the actor may not read is absent, not zero. */
async function ask(
  key: string,
  labelFa: string,
  href: string,
  read: () => Promise<{ total: number }>,
): Promise<QueueCard | null> {
  try {
    const answer = await read();
    return { key, labelFa, href, waiting: Number(answer.total ?? 0) };
  } catch (error) {
    if (error instanceof AppError && (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED')) return null;
    throw error;
  }
}

/**
 * Every queue this actor may open, with the number of cases waiting in it.
 *
 * The counts come from the same functions the queue pages themselves use, so a
 * number on this board can never disagree with the page it links to.
 */
export async function queueBoard(database: DbClient, actor: Actor): Promise<QueueCard[]> {
  const one = { view: 'OPEN' as const, page: 1, pageSize: 1 };
  const cards = await Promise.all([
    ask('vet-applications', 'درخواست‌های دامپزشک', '/review/vets', () => vetApplicationQueue(database, actor, one)),
    ask('centre-claims', 'Claim مراکز', '/review/centres/claims', () => centreClaimQueue(database, actor, one)),
    ask('suggestions', 'پیشنهادهای کاربران', '/review/suggestions', () => suggestionQueue(database, actor, one)),
    ask('content-reports', 'گزارش‌های محتوا', '/content/reports', () =>
      openReportQueue(database, actor, { page: 1, pageSize: 1 }),
    ),
  ]);
  return cards.filter((card): card is QueueCard => card !== null);
}
