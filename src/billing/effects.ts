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
import { markKennelPaid } from '../kennels/service.ts';
import { markPermitPaid } from '../mating/permits.ts';
import { issueCardsForBatch, markCardBatchPaid } from '../mating/allocation.ts';
import { activateSubscriptionFromPayment } from '../advertising/service.ts';

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
      // The kennel is not approved by paying: the verified payment only opens
      // the submission step, and the association still reviews it (§15.2).
      case 'KENNEL_REGISTRATION':
        await markKennelPaid(tx, batch);
        return;
      // Paying does not issue a permit either: it only opens the final submit,
      // and the association's operational review still decides (§16 steps 7–9).
      case 'MATING_PERMIT':
        await markPermitPaid(tx, batch);
        return;
      // Each puppy is judged again at issuance and issued on its own, so a
      // puppy that is no longer eligible is recorded with its reason instead of
      // failing the whole verified payment (§19.4).
      case 'PUPPY_CARD':
        await markCardBatchPaid(tx, batch.id);
        await issueCardsForBatch(tx, batch);
        return;
      // The package starts only where the money was really taken, and a renewal
      // begins where the live period ends (§14).
      case 'ADVERTISING_PACKAGE':
        await activateSubscriptionFromPayment(tx, batch);
        return;
      default:
        return;
    }
  },
};
