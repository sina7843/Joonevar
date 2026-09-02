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
import {
  issueForBatch as issuePedigrees,
  markBatchPaid as markPedigreeBatchPaid,
} from '../documents/pedigree.ts';

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
      // The pedigree needs both halves of the join: this verified payment and a
      // final Parentage Result. Whichever arrives second finishes it (§14.2).
      case 'PEDIGREE':
        await markPedigreeBatchPaid(tx, batch.id);
        await issuePedigrees(tx, batch);
        return;
      // Permits, kennels and puppy cards attach their own effects in
      // PROMPT-012 to PROMPT-016. Until then a verified payment for them
      // records the money and issues nothing, which is the truthful outcome
      // rather than a fabricated document.
      default:
        return;
    }
  },
};
