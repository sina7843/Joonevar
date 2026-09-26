/**
 * The notification outbox — Phase 2.5 §10 (PROMPT-015).
 *
 * The rule this file exists for: **a message never decides whether a domain
 * change happened.** When something is decided, the decision and a delivery row
 * are written in the same transaction; the sending happens afterwards, outside
 * it. A provider that is down therefore delays a message and never rolls back
 * the approval, the payment or the activation that produced it.
 *
 * What a worker does with a due row:
 *
 *   1. claims it with `for update skip locked`, so two workers cannot take the
 *      same row and the second one moves on instead of waiting;
 *   2. hands the channel the sentence the versioned catalogue wrote, never text
 *      from the record;
 *   3. marks it SENT, or schedules the next attempt with a doubling delay, or —
 *      when the attempts are used up — leaves it FAILED and readable.
 *
 * Nothing here ever deletes a row. A message that could not be sent is evidence.
 */
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, notificationDeliveries, notifications } from '../db/schema/core.ts';
import { readInt, readSetting } from '../settings/service.ts';
import { TEMPLATE_VERSION, channelsFor, renderSms, type NotificationChannelName } from './templates.ts';
import type { NotificationRecord } from './service.ts';

export type DeliveryStatusName = 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED';
export type DeliveryRow = typeof notificationDeliveries.$inferSelect;

export interface ChannelPolicy {
  readonly smsEnabled: boolean;
  readonly maxAttempts: number;
  readonly firstRetrySeconds: number;
  readonly templateVersion: string;
}

const DEFAULT_POLICY: ChannelPolicy = {
  smsEnabled: false,
  maxAttempts: 5,
  firstRetrySeconds: 60,
  templateVersion: TEMPLATE_VERSION,
};

/**
 * The policy in force. An unset or unreadable setting means the safe answer —
 * no SMS — rather than an assumed one, because enqueuing a message the operator
 * never enabled is worse than sending none.
 */
export async function channelPolicy(database: DbClient): Promise<ChannelPolicy> {
  try {
    const enabled = await readSetting(database, 'notifications.sms_enabled');
    const maxAttempts = await readInt(database, 'notifications.sms_max_attempts').catch(() => DEFAULT_POLICY.maxAttempts);
    const retrySeconds = await readInt(database, 'notifications.sms_retry_seconds').catch(() => DEFAULT_POLICY.firstRetrySeconds);
    return {
      smsEnabled: String(enabled.value ?? 'OFF').toUpperCase() === 'ON',
      maxAttempts: maxAttempts >= 1 ? maxAttempts : DEFAULT_POLICY.maxAttempts,
      firstRetrySeconds: retrySeconds >= 1 ? retrySeconds : DEFAULT_POLICY.firstRetrySeconds,
      templateVersion: TEMPLATE_VERSION,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

/**
 * One delivery row per notification and channel, written where the notification
 * itself is written. The idempotency key is derived rather than passed, so the
 * same notification cannot be queued twice for the same channel — the unique
 * index refuses the second one.
 */
export const deliveryKey = (notificationId: string, channel: NotificationChannelName): string => channel + ':' + notificationId;

export async function enqueueDeliveries(
  tx: DbClient,
  notification: NotificationRecord,
  policy: ChannelPolicy,
  now: Date = new Date(),
): Promise<readonly NotificationChannelName[]> {
  const channels = channelsFor(notification.kind, policy);
  const queued: NotificationChannelName[] = [];
  for (const channel of channels) {
    const renderedText = channel === 'SMS' ? renderSms(notification.kind) : null;
    // A channel with nothing to say is not queued at all.
    if (channel === 'SMS' && renderedText === null) continue;
    const inserted = await tx
      .insert(notificationDeliveries)
      .values({
        notificationId: notification.id,
        channel,
        idempotencyKey: deliveryKey(notification.id, channel),
        // The in-app row is the delivery: it is already done when it is written.
        status: channel === 'IN_APP' ? 'SENT' : 'PENDING',
        attempts: 0,
        maxAttempts: policy.maxAttempts,
        nextAttemptAt: now,
        sentAt: channel === 'IN_APP' ? now : null,
        renderedText,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: notificationDeliveries.idempotencyKey })
      .returning({ id: notificationDeliveries.id });
    if (inserted.length > 0) queued.push(channel);
  }
  return queued;
}

/** What a channel is asked to do. The worker never sees the record itself. */
export interface OutboundMessage {
  readonly deliveryId: string;
  readonly channel: NotificationChannelName;
  readonly recipientAccountId: string;
  readonly kind: string;
  /** The catalogue sentence, already rendered and redacted. */
  readonly text: string;
  readonly attempt: number;
  readonly templateVersion: string;
}

export interface OutboundSender {
  readonly channel: NotificationChannelName;
  send(message: OutboundMessage, recipientMobile: string): Promise<void>;
}

export interface OutboxRun {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  readonly suppressed: number;
}

const backoffSeconds = (attempt: number, first: number): number => first * 2 ** Math.max(0, attempt - 1);

/**
 * Send what is due. Safe to run from anywhere and at any time: a row is claimed
 * by exactly one caller, and a run that crashes leaves the row to the next one
 * rather than losing it.
 */
export async function runOutbox(
  database: Database,
  sender: OutboundSender,
  options: { limit?: number; now?: Date } = {},
): Promise<OutboxRun> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 20;
  const policy = await channelPolicy(database);
  let sent = 0;
  let retried = 0;
  let failed = 0;
  let suppressed = 0;

  // Claimed one at a time and in its own transaction, so a slow provider does
  // not hold a lock over the whole batch.
  const due = await database
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.status, 'PENDING'),
        eq(notificationDeliveries.channel, sender.channel),
        lte(notificationDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(notificationDeliveries.nextAttemptAt))
    .limit(limit);

  for (const candidate of due) {
    const claimed = await database.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(notificationDeliveries)
        // The candidate list was read before any claim committed, so every
        // worker is holding the same ids. The due window is re-checked here,
        // inside the lock, because that is the only place it is still true
        // that nobody else has taken this row.
        .where(
          and(
            eq(notificationDeliveries.id, candidate.id),
            eq(notificationDeliveries.status, 'PENDING'),
            lte(notificationDeliveries.nextAttemptAt, now),
          ),
        )
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return null;
      // The claim also takes a lease. `skip locked` only holds anybody off
      // while this transaction is open, and the row does not leave PENDING
      // until the provider has answered — which happens after the commit. So
      // without pushing the row out of the due window here, a second worker
      // that arrives in that gap claims the same row and sends the message
      // twice. A worker that dies mid-send leaves the row to be retried when
      // the lease runs out, which is what the retry path was already for.
      const [updated] = await tx
        .update(notificationDeliveries)
        .set({
          attempts: row.attempts + 1,
          lastAttemptAt: now,
          nextAttemptAt: new Date(now.getTime() + policy.firstRetrySeconds * 1000),
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, row.id))
        .returning();
      const [notification] = await tx
        .select({ kind: notifications.kind, recipientAccountId: notifications.recipientAccountId })
        .from(notifications)
        .where(eq(notifications.id, row.notificationId))
        .limit(1);
      return updated && notification ? { row: updated, notification } : null;
    });
    if (claimed === null) continue;

    const { row, notification } = claimed;
    // The channel was turned off after this row was queued: it is suppressed,
    // not sent and not retried for ever.
    if (sender.channel === 'SMS' && !policy.smsEnabled) {
      await database
        .update(notificationDeliveries)
        .set({ status: 'SUPPRESSED', lastError: 'کانال پیامک خاموش است.', updatedAt: now })
        .where(eq(notificationDeliveries.id, row.id));
      suppressed += 1;
      continue;
    }

    const text = row.renderedText ?? renderSms(notification.kind);
    if (text === null) {
      await database
        .update(notificationDeliveries)
        .set({ status: 'SUPPRESSED', lastError: 'متنی برای این نوع اعلان تعریف نشده است.', updatedAt: now })
        .where(eq(notificationDeliveries.id, row.id));
      suppressed += 1;
      continue;
    }

    const [recipient] = await database
      .select({ mobile: accounts.mobile })
      .from(accounts)
      .where(eq(accounts.id, notification.recipientAccountId))
      .limit(1);
    if (!recipient?.mobile) {
      await database
        .update(notificationDeliveries)
        .set({ status: 'SUPPRESSED', lastError: 'گیرنده شماره‌ای ندارد.', updatedAt: now })
        .where(eq(notificationDeliveries.id, row.id));
      suppressed += 1;
      continue;
    }

    try {
      await sender.send(
        {
          deliveryId: row.id,
          channel: sender.channel,
          recipientAccountId: notification.recipientAccountId,
          kind: notification.kind,
          text,
          attempt: row.attempts,
          templateVersion: policy.templateVersion,
        },
        recipient.mobile,
      );
      await database
        .update(notificationDeliveries)
        .set({ status: 'SENT', sentAt: now, lastError: null, updatedAt: now })
        .where(eq(notificationDeliveries.id, row.id));
      sent += 1;
    } catch (error) {
      // The provider's own words are kept, trimmed, so a stack trace or a
      // response body never becomes the record.
      const reason = (error instanceof Error ? error.message : 'خطای نامشخص در ارسال').slice(0, 300);
      const exhausted = row.attempts >= row.maxAttempts;
      await database
        .update(notificationDeliveries)
        .set({
          status: exhausted ? 'FAILED' : 'PENDING',
          lastError: reason,
          nextAttemptAt: exhausted ? row.nextAttemptAt : new Date(now.getTime() + backoffSeconds(row.attempts, policy.firstRetrySeconds) * 1000),
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, row.id));
      if (exhausted) failed += 1;
      else retried += 1;
    }
  }

  return { claimed: due.length, sent, retried, failed, suppressed };
}

export interface OutboxStanding {
  readonly pending: number;
  readonly due: number;
  readonly failed: number;
  readonly suppressed: number;
  readonly sent: number;
  readonly oldestPendingAt: Date | null;
}

/** What the outbox looks like right now, for the operator who has to answer for it. */
export async function outboxStanding(database: DbClient, now: Date = new Date()): Promise<OutboxStanding> {
  const [row] = await database
    .select({
      pending: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'PENDING')`,
      due: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'PENDING' and ${notificationDeliveries.nextAttemptAt} <= ${now})`,
      failed: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'FAILED')`,
      suppressed: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'SUPPRESSED')`,
      sent: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'SENT')`,
      oldestPendingAt: sql<Date | null>`min(${notificationDeliveries.createdAt}) filter (where ${notificationDeliveries.status} = 'PENDING')`,
    })
    .from(notificationDeliveries);
  return {
    pending: Number(row?.pending ?? 0),
    due: Number(row?.due ?? 0),
    failed: Number(row?.failed ?? 0),
    suppressed: Number(row?.suppressed ?? 0),
    sent: Number(row?.sent ?? 0),
    oldestPendingAt: row?.oldestPendingAt ? new Date(row.oldestPendingAt) : null,
  };
}

/**
 * Put a failed row back in the queue, with its attempts reset. An operator's
 * decision, not something that happens on its own.
 */
export async function requeueDelivery(database: Database, deliveryId: string, now: Date = new Date()): Promise<DeliveryRow | null> {
  const [row] = await database
    .update(notificationDeliveries)
    .set({ status: 'PENDING', attempts: 0, nextAttemptAt: now, lastError: null, updatedAt: now })
    .where(and(eq(notificationDeliveries.id, deliveryId), eq(notificationDeliveries.status, 'FAILED')))
    .returning();
  return row ?? null;
}
