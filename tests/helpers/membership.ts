/**
 * Becoming a member, for fixtures — Phase 2.5 PROMPT-009.
 *
 * Membership is no longer bought in one step: it is applied for, reviewed by the
 * association and then paid for one period at a time, and none of the figures
 * has a seeded value. Every suite that needs a member goes through the real
 * functions here rather than writing a membership row by hand.
 */
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/client.ts';
import { applyForMembership, decideMembershipApplication, startMembershipPeriodPayment } from '../../src/billing/membership.ts';
import { startAttempt, verifyAttempt } from '../../src/billing/payments.ts';
import { paidEffects } from '../../src/billing/effects.ts';
import type { Actor } from '../../src/authz/actor.ts';
import type { PaymentGateway } from '../../src/adapters/registry.ts';

export interface MembershipSettings {
  readonly feeToman?: number;
  readonly renewalToman?: number;
  readonly periodDays?: number;
  readonly graceDays?: number | null;
  readonly reminderDaysBefore?: number | null;
}

/** Synthetic managed figures. Nothing real is seeded, so a fixture states its own. */
export async function configureMembership(database: Database, settings: MembershipSettings = {}): Promise<void> {
  const values: Record<string, unknown> = {
    'fee.membership_toman': String(settings.feeToman ?? 300_000),
    'membership.renewal_toman': String(settings.renewalToman ?? 200_000),
    'membership.period_days': settings.periodDays ?? 365,
    'membership.grace_days': settings.graceDays === undefined ? 10 : settings.graceDays,
    'membership.reminder_days_before': settings.reminderDaysBefore === undefined ? 30 : settings.reminderDaysBefore,
  };
  for (const [key, value] of Object.entries(values)) {
    await database.execute(sql`update product_setting set value = ${JSON.stringify(value)}::jsonb, updated_at = now() where key = ${key}`);
  }
}

export const payingGateway = (amountRial: bigint): PaymentGateway => ({
  async start(input) {
    return { reference: input.reference, amountRial: input.amountRial, redirectUrl: input.callbackUrl };
  },
  async verify(input) {
    return { paid: true, amountRial, providerRef: 'p-' + input.reference };
  },
});

/** Apply, have the association approve, and pay one period — the whole real path. */
export async function becomeMember(
  database: Database,
  actor: Actor,
  reviewer: Actor,
  options: { amountRial?: bigint; now?: Date } = {},
): Promise<{ batchId: string }> {
  const application = await applyForMembership(database, actor, { statementFa: 'SYNTHETIC درخواست عضویت' });
  await decideMembershipApplication(database, reviewer, {
    applicationId: application.id,
    expectedVersion: application.version,
    decision: 'APPROVE',
    reasonFa: 'SYNTHETIC مدارک عضویت کامل است',
  });
  return payMembershipPeriod(database, actor, options);
}

/** Pay one period for an account the association has already approved. */
export async function payMembershipPeriod(
  database: Database,
  actor: Actor,
  options: { amountRial?: bigint; now?: Date } = {},
): Promise<{ batchId: string }> {
  const started = await startMembershipPeriodPayment(database, actor, undefined, options.now ?? new Date());
  // The gateway answers with what this period actually costs (Toman ×10, DEC-0012),
  // so a mismatch in a test means the product changed, not the fixture.
  const gateway = payingGateway(options.amountRial ?? BigInt(started.period.amountToman) * 10n);
  const attempt = await startAttempt(database, actor, { batchId: started.batch.id, callbackUrl: '/x' }, gateway, 'test-gateway');
  const outcome = await verifyAttempt(database, { reference: attempt.reference }, gateway, paidEffects);
  assert.equal(outcome.state, 'PAID');
  return { batchId: started.batch.id };
}
