/**
 * Notification creation and delivery — §8, §23.4.
 *
 * A notification is not a message; it is a pointer back into a case. It always
 * carries entity, step and origin route so opening it reopens that exact record
 * at that exact step, and authorization is re-checked when it is opened.
 *
 * Delivery is idempotent by key: a retried worker, a duplicated domain event or
 * a replayed gateway callback must not send twice.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbClient, Database } from '../db/client.ts';
import { notificationDeliveries, notifications } from '../db/schema/core.ts';
import type { Actor } from '../authz/actor.ts';
import { forbidden, notFound } from '../domain/errors.ts';
import { offsetOf, pageOf, type Page, type PageRequest } from '../domain/pagination.ts';
import { resumeContext, type ResumeContext } from '../domain/resume-context.ts';

export type NotificationChannelName = 'IN_APP' | 'SMS';
export type DeliveryStatusName = 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED';

export interface CreateNotificationInput {
  readonly recipientAccountId: string;
  readonly kind: string;
  readonly titleFa: string;
  readonly bodyFa: string;
  readonly resume: ResumeContext;
}

export interface NotificationRecord {
  readonly id: string;
  readonly recipientAccountId: string;
  readonly kind: string;
  readonly titleFa: string;
  readonly bodyFa: string;
  readonly resume: ResumeContext;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

function toRecord(row: typeof notifications.$inferSelect): NotificationRecord {
  return {
    id: row.id,
    recipientAccountId: row.recipientAccountId,
    kind: row.kind,
    titleFa: row.titleFa,
    bodyFa: row.bodyFa,
    resume: {
      entity: { type: row.entityType as ResumeContext['entity']['type'], id: row.entityId },
      step: row.step,
      originRoute: row.originRoute,
      ...(row.selection ? { selection: row.selection as ResumeContext['selection'] } : {}),
    },
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

export async function createNotification(
  tx: DbClient,
  input: CreateNotificationInput,
): Promise<NotificationRecord> {
  const resume = resumeContext(input.resume);
  const [row] = await tx
    .insert(notifications)
    .values({
      recipientAccountId: input.recipientAccountId,
      kind: input.kind,
      entityType: resume.entity.type,
      entityId: resume.entity.id,
      step: resume.step,
      originRoute: resume.originRoute,
      selection: resume.selection ?? null,
      titleFa: input.titleFa,
      bodyFa: input.bodyFa,
    })
    .returning();
  return toRecord(row!);
}

/**
 * A channel implementation. Real providers are adapters; the abstraction keeps
 * idempotency and status handling in one place instead of in every caller.
 */
export interface NotificationChannel {
  readonly name: NotificationChannelName;
  send(notification: NotificationRecord): Promise<void>;
}

export interface DeliveryOutcome {
  readonly status: DeliveryStatusName;
  /** True when this call actually performed the send rather than finding an existing one. */
  readonly performed: boolean;
}

/**
 * Deliver once per idempotency key. The unique index does the arbitration, so
 * two concurrent workers cannot both send.
 */
export async function deliverOnce(
  database: Database,
  notification: NotificationRecord,
  channel: NotificationChannel,
  idempotencyKey: string,
): Promise<DeliveryOutcome> {
  const claimed = await database
    .insert(notificationDeliveries)
    .values({
      notificationId: notification.id,
      channel: channel.name,
      idempotencyKey,
      status: 'PENDING',
      attempts: 1,
    })
    .onConflictDoNothing({ target: notificationDeliveries.idempotencyKey })
    .returning();

  if (claimed.length === 0) {
    const [existing] = await database
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.idempotencyKey, idempotencyKey))
      .limit(1);
    return { status: (existing?.status ?? 'PENDING') as DeliveryStatusName, performed: false };
  }

  const row = claimed[0]!;
  try {
    await channel.send(notification);
    await database
      .update(notificationDeliveries)
      .set({ status: 'SENT', updatedAt: new Date() })
      .where(eq(notificationDeliveries.id, row.id));
    return { status: 'SENT', performed: true };
  } catch (error) {
    await database
      .update(notificationDeliveries)
      .set({
        status: 'FAILED',
        lastError: error instanceof Error ? error.message : 'unknown error',
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, row.id));
    return { status: 'FAILED', performed: true };
  }
}

/** In-app channel is a no-op send: the row itself is the delivery. */
export const inAppChannel: NotificationChannel = {
  name: 'IN_APP',
  async send() {
    /* the notification row is the delivery */
  },
};

export async function listForActor(
  database: DbClient,
  actor: Actor,
  request: PageRequest,
): Promise<Page<NotificationRecord>> {
  const where = eq(notifications.recipientAccountId, actor.accountId);
  const rows = await database
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));
  const [counted] = await database.select({ total: sql<string>`count(*)` }).from(notifications).where(where);
  return pageOf(rows.map(toRecord), Number(counted?.total ?? 0), request);
}

/**
 * Opening a notification re-authorizes on the server (§8). Recipient-only is
 * the minimum; the target record still runs its own check when it loads.
 */
export async function openNotification(
  database: DbClient,
  actor: Actor,
  notificationId: string,
): Promise<NotificationRecord> {
  const [row] = await database.select().from(notifications).where(eq(notifications.id, notificationId)).limit(1);
  if (!row) throw notFound('Notification not found');
  if (row.recipientAccountId !== actor.accountId) throw forbidden('This notification belongs to another account');
  if (row.readAt === null) {
    await database
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.recipientAccountId, actor.accountId)));
  }
  return toRecord(row);
}
