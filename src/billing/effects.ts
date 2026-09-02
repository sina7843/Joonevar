/**
 * What a verified payment actually does.
 *
 * Kept apart from the payment machinery so that module stays free of product
 * knowledge, and so each service can plug its own effect in when its prompt
 * builds it. Every effect runs inside the verifying transaction.
 */
import type { DbClient } from '../db/client.ts';
import type { BatchRecord, PaidEffects } from './payments.ts';
import { activateMembershipFromPayment } from './membership.ts';
import { issueForBatch, markBatchPaid } from '../documents/registration-sheet.ts';

export const paidEffects: PaidEffects = {
  async onPaid(tx: DbClient, batch: BatchRecord) {
    switch (batch.service) {
      case 'MEMBERSHIP':
        await activateMembershipFromPayment(tx, batch);
        return;
      // Each animal is issued independently and a blocked one is recorded with
      // its reason rather than failing the whole verified payment (§13).
      case 'REGISTRATION_SHEET':
        await markBatchPaid(tx, batch.id);
        await issueForBatch(tx, batch);
        return;
      // Pedigrees, permits, kennels and puppy cards attach their own effects in
      // PROMPT-010 to PROMPT-016. Until then a verified payment for them
      // records the money and issues nothing, which is the truthful outcome
      // rather than a fabricated document.
      default:
        return;
    }
  },
};
