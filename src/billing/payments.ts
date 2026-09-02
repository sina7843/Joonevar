/**
 * Payments — §22, §23.4, §26.
 *
 * Three rules shape everything here:
 *  - the amount is computed on the server from database settings and snapshotted
 *    on the item, so a later tariff edit never rewrites what was charged;
 *  - a browser returning from the gateway proves nothing: only a server-side
 *    verify call can mark a payment paid;
 *  - a duplicated or replayed callback must not apply a second effect.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import {
  paymentAttempts,
  paymentBatches,
  paymentCallbacks,
  paymentItems,
} from '../db/schema/billing.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { snapshotSetting } from '../settings/service.ts';
import { conflict, forbidden, notConfigured, notFound, validation } from '../domain/errors.ts';
import { rialToToman, toman, tomanToRial } from '../domain/money.ts';
import { resumeContext, type ResumeContext } from '../domain/resume-context.ts';
import type { Actor } from '../authz/actor.ts';
import type { PaymentGateway } from '../adapters/registry.ts';

export type PaymentService =
  | 'MEMBERSHIP'
  | 'REGISTRATION_SHEET'
  | 'PEDIGREE'
  | 'MATING_PERMIT'
  | 'KENNEL_REGISTRATION'
  | 'PUPPY_CARD';

export interface BatchItemInput {
  readonly targetType: string;
  readonly targetId: string;
  /** The settings key the price comes from; the value is never passed in. */
  readonly settingKey: string;
}

export interface BatchRecord {
  readonly id: string;
  readonly accountId: string;
  readonly service: PaymentService;
  readonly status: 'DRAFT' | 'AWAITING_PAYMENT' | 'PAID' | 'FAILED' | 'CANCELLED';
  readonly resumeContext: ResumeContext;
  readonly version: number;
}

/**
 * Create a batch and freeze its prices.
 *
 * A missing tariff stops the batch here with a named reason. It is never
 * treated as zero, and no payment path opens for an amount nobody has entered.
 */
export async function createBatch(
  database: Database,
  actor: Actor,
  input: {
    service: PaymentService;
    items: readonly BatchItemInput[];
    resume: ResumeContext;
  },
): Promise<BatchRecord> {
  if (input.items.length === 0) throw validation('هیچ قلمی برای پرداخت انتخاب نشده است.');
  const resume = resumeContext(input.resume);

  // Snapshot every price before anything is written, so a batch is either fully
  // priced or not created at all.
  const priced = await Promise.all(
    input.items.map(async (item) => {
      const snapshot = await snapshotSetting(database, item.settingKey);
      return { item, amountToman: toman(String(snapshot.value)), settingVersion: snapshot.version };
    }),
  );

  return database.transaction(async (tx) => {
    const [batch] = await tx
      .insert(paymentBatches)
      .values({
        accountId: actor.accountId,
        service: input.service,
        status: 'DRAFT',
        resumeContext: resume,
      })
      .returning();

    for (const row of priced) {
      await tx.insert(paymentItems).values({
        batchId: batch!.id,
        targetType: row.item.targetType,
        targetId: row.item.targetId,
        amountToman: row.amountToman.toString(),
        settingKey: row.item.settingKey,
        settingVersion: row.settingVersion,
      });
    }

    await recordAudit(tx, actor, {
      action: 'PAYMENT_BATCH_CREATED',
      targetType: 'PAYMENT_BATCH',
      targetId: batch!.id,
      targetVersion: 1,
      after: {
        service: input.service,
        items: priced.map((row) => ({
          targetType: row.item.targetType,
          targetId: row.item.targetId,
          amountToman: row.amountToman.toString(),
          settingKey: row.item.settingKey,
          settingVersion: row.settingVersion,
        })),
      },
    });

    return toBatch(batch!);
  });
}

function toBatch(row: typeof paymentBatches.$inferSelect): BatchRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    service: row.service as PaymentService,
    status: row.status as BatchRecord['status'],
    resumeContext: row.resumeContext as ResumeContext,
    version: row.version,
  };
}

export async function findBatch(database: DbClient, batchId: string): Promise<BatchRecord | null> {
  const [row] = await database.select().from(paymentBatches).where(eq(paymentBatches.id, batchId)).limit(1);
  return row ? toBatch(row) : null;
}

export async function batchItems(database: DbClient, batchId: string) {
  return database.select().from(paymentItems).where(eq(paymentItems.batchId, batchId));
}

/** Exact integer sum of the frozen item amounts. */
export async function batchTotalToman(database: DbClient, batchId: string): Promise<bigint> {
  const items = await batchItems(database, batchId);
  return items.reduce((total, item) => total + toman(item.amountToman), 0n);
}

export interface StartedAttempt {
  readonly attemptId: string;
  readonly reference: string;
  readonly amountRial: bigint;
  readonly redirectUrl: string;
}

/**
 * Open a trip to the gateway.
 *
 * The Rial amount is derived from the frozen Toman snapshots by the documented
 * ×10 conversion (DEC-0012), so the figure sent to the gateway and the figure
 * verified afterwards come from the same source.
 */
export async function startAttempt(
  database: Database,
  actor: Actor,
  input: { batchId: string; callbackUrl: string },
  gateway: PaymentGateway,
  providerName: string,
): Promise<StartedAttempt> {
  const batch = await findBatch(database, input.batchId);
  if (batch === null) throw notFound('پرونده پرداخت پیدا نشد.');
  if (batch.accountId !== actor.accountId) throw forbidden();
  if (batch.status === 'PAID') throw conflict('این پرداخت قبلاً تأیید شده است.');
  if (batch.status === 'CANCELLED') throw conflict('این پرداخت لغو شده است.');

  const totalToman = await batchTotalToman(database, batch.id);
  if (totalToman <= 0n) throw notConfigured('مبلغ این پرداخت');
  const amountRial = tomanToRial(totalToman);

  const reference = 'HZP-' + randomBytes(12).toString('base64url');
  const intent = await gateway.start({ reference, amountRial, callbackUrl: input.callbackUrl });

  const [attempt] = await database
    .insert(paymentAttempts)
    .values({ batchId: batch.id, provider: providerName, reference, amountRial: amountRial.toString() })
    .returning();

  await database
    .update(paymentBatches)
    .set({ status: 'AWAITING_PAYMENT', version: batch.version + 1, updatedAt: new Date() })
    .where(eq(paymentBatches.id, batch.id));

  await recordAudit(database, actor, {
    action: 'PAYMENT_ATTEMPT_STARTED',
    targetType: 'PAYMENT_BATCH',
    targetId: batch.id,
    after: { attemptId: attempt!.id, provider: providerName, amountRial: amountRial.toString() },
  });

  return { attemptId: attempt!.id, reference, amountRial, redirectUrl: intent.redirectUrl };
}

export type VerifyOutcome =
  | { readonly state: 'PAID'; readonly batch: BatchRecord; readonly performed: boolean }
  | { readonly state: 'FAILED'; readonly batch: BatchRecord; readonly reasonFa: string; readonly performed: boolean }
  | { readonly state: 'CANCELLED'; readonly batch: BatchRecord; readonly performed: boolean }
  | { readonly state: 'UNKNOWN_REFERENCE' };

/** Applied inside the same transaction that marks the batch paid. */
export interface PaidEffects {
  onPaid(tx: DbClient, batch: BatchRecord): Promise<void>;
}

const MISMATCH_FA = 'مبلغ تأییدشده درگاه با مبلغ این پرداخت یکی نیست.';
const UNPAID_FA = 'پرداخت از سوی درگاه تأیید نشد.';

/**
 * Verify with the gateway and apply the outcome exactly once.
 *
 * Called from the return page and from any provider callback; both go through
 * this one path. `performed: false` means this call found the work already done,
 * which is what a duplicated or concurrent callback gets.
 */
export async function verifyAttempt(
  database: Database,
  input: { reference: string; providerRef?: string | null },
  gateway: PaymentGateway,
  effects: PaidEffects,
): Promise<VerifyOutcome> {
  const [attempt] = await database
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.reference, input.reference))
    .limit(1);
  if (!attempt) return { state: 'UNKNOWN_REFERENCE' };

  const batch = await findBatch(database, attempt.batchId);
  if (batch === null) return { state: 'UNKNOWN_REFERENCE' };

  // Already settled: report the stored outcome without touching anything.
  if (attempt.status !== 'PENDING') {
    if (attempt.status === 'VERIFIED') return { state: 'PAID', batch, performed: false };
    if (attempt.status === 'CANCELLED') return { state: 'CANCELLED', batch, performed: false };
    return { state: 'FAILED', batch, reasonFa: attempt.failureReason ?? UNPAID_FA, performed: false };
  }

  const verification = await gateway.verify({
    reference: input.reference,
    providerRef: input.providerRef ?? attempt.providerRef ?? '',
  });

  const expectedRial = BigInt(attempt.amountRial);
  const paid = verification.paid && verification.amountRial === expectedRial;
  const mismatched = verification.paid && verification.amountRial !== expectedRial;

  return database.transaction(async (tx) => {
    // The callback row records the receipt and makes a repeated delivery of the
    // same provider reference a no-op.
    const externalRef = input.providerRef ?? verification.providerRef ?? input.reference;
    const claimed = await tx
      .insert(paymentCallbacks)
      .values({
        provider: attempt.provider,
        externalRef,
        attemptId: attempt.id,
        outcome: paid ? 'PAID' : mismatched ? 'AMOUNT_MISMATCH' : 'UNPAID',
      })
      .onConflictDoNothing({ target: [paymentCallbacks.provider, paymentCallbacks.externalRef] })
      .returning({ id: paymentCallbacks.id });

    // The attempt status is the real arbiter: only the transaction that moves it
    // out of PENDING applies the effect.
    const [settled] = await tx
      .update(paymentAttempts)
      .set({
        status: paid ? 'VERIFIED' : 'FAILED',
        providerRef: verification.providerRef || attempt.providerRef,
        failureReason: paid ? null : mismatched ? MISMATCH_FA : UNPAID_FA,
        settledAt: new Date(),
      })
      .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, 'PENDING')))
      .returning();

    if (!settled) {
      const [current] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, attempt.id));
      const latest = (await findBatch(tx, attempt.batchId))!;
      if (current?.status === 'VERIFIED') return { state: 'PAID', batch: latest, performed: false };
      return { state: 'FAILED', batch: latest, reasonFa: current?.failureReason ?? UNPAID_FA, performed: false };
    }

    if (!paid) {
      // A failed attempt does not destroy the batch: §26 keeps the draft and the
      // items so the payer can retry.
      await tx
        .update(paymentBatches)
        .set({ status: 'FAILED', version: batch.version + 1, updatedAt: new Date() })
        .where(eq(paymentBatches.id, batch.id));
      await recordAudit(tx, null, {
        action: 'PAYMENT_FAILED',
        targetType: 'PAYMENT_BATCH',
        targetId: batch.id,
        after: {
          reason: mismatched ? 'AMOUNT_MISMATCH' : 'NOT_PAID',
          expectedRial: expectedRial.toString(),
          reportedRial: verification.amountRial.toString(),
          duplicateCallback: claimed.length === 0,
        },
      });
      const failed = (await findBatch(tx, batch.id))!;
      return {
        state: 'FAILED',
        batch: failed,
        reasonFa: mismatched ? MISMATCH_FA : UNPAID_FA,
        performed: true,
      };
    }

    await tx
      .update(paymentBatches)
      .set({ status: 'PAID', version: batch.version + 1, updatedAt: new Date() })
      .where(eq(paymentBatches.id, batch.id));
    await tx.update(paymentItems).set({ status: 'PAID' }).where(eq(paymentItems.batchId, batch.id));

    const paidBatch = (await findBatch(tx, batch.id))!;
    await effects.onPaid(tx, paidBatch);

    await recordAudit(tx, null, {
      action: 'PAYMENT_VERIFIED',
      targetType: 'PAYMENT_BATCH',
      targetId: batch.id,
      targetVersion: batch.version + 1,
      before: { status: batch.status },
      after: {
        status: 'PAID',
        amountRial: expectedRial.toString(),
        amountToman: rialToToman(expectedRial).toString(),
        provider: attempt.provider,
      },
    });

    await createNotification(tx, {
      recipientAccountId: batch.accountId,
      kind: 'PAYMENT_VERIFIED',
      titleFa: 'پرداخت شما تأیید شد',
      bodyFa: 'تأیید پرداخت روی سرور انجام شد و ادامه مسیر باز است.',
      resume: paidBatch.resumeContext,
    });

    return { state: 'PAID', batch: paidBatch, performed: true };
  });
}

/** Cancelling keeps the batch and its items so the payer can start again (§26). */
export async function cancelAttempt(
  database: Database,
  input: { reference: string },
): Promise<VerifyOutcome> {
  const [attempt] = await database
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.reference, input.reference))
    .limit(1);
  if (!attempt) return { state: 'UNKNOWN_REFERENCE' };

  const [settled] = await database
    .update(paymentAttempts)
    .set({ status: 'CANCELLED', settledAt: new Date(), failureReason: 'پرداخت لغو شد.' })
    .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, 'PENDING')))
    .returning();

  const batch = (await findBatch(database, attempt.batchId))!;
  if (!settled) {
    return attempt.status === 'VERIFIED'
      ? { state: 'PAID', batch, performed: false }
      : { state: 'CANCELLED', batch, performed: false };
  }

  await database
    .update(paymentBatches)
    .set({ status: 'CANCELLED', version: batch.version + 1, updatedAt: new Date() })
    .where(eq(paymentBatches.id, batch.id));
  await recordAudit(database, null, {
    action: 'PAYMENT_CANCELLED',
    targetType: 'PAYMENT_BATCH',
    targetId: batch.id,
    before: { status: batch.status },
    after: { status: 'CANCELLED' },
  });
  return { state: 'CANCELLED', batch: (await findBatch(database, batch.id))!, performed: true };
}

/** Latest attempt for a batch, for the return page and for retry. */
export async function latestAttempt(database: DbClient, batchId: string) {
  const [row] = await database
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.batchId, batchId))
    .orderBy(sql`started_at desc`)
    .limit(1);
  return row ?? null;
}
