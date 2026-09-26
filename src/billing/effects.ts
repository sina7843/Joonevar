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
import { activateLicencePeriodFromPayment } from '../vets/licence-period.ts';
import { activateTrustedPeriodFromPayment } from '../vets/trusted-period.ts';
import { activateClubMembershipFromPayment } from '../clubs/enrollment.ts';
import { activatePromotionFromPayment } from '../marketplace/promotions.ts';
import { reserveFromDeposit } from '../marketplace/inquiries.ts';
import { activatePlanFromPayment } from '../commerce/plans.ts';
import { orderPaidEffects } from '../commerce/orders.ts';
import { activateFinderSubscriptionFromPayment } from '../finder/subscriptions.ts';

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
      // The licensed tag and the active licence status are made only here, by a
      // payment the server verified; a renewal starts where the live period ends (§5).
      case 'VET_LICENSE_ACTIVATION':
      case 'VET_LICENSE_RENEWAL':
        await activateLicencePeriodFromPayment(tx, batch);
        return;
      // The trusted period, the internal role and the single trusted tag are all
      // made here, by a payment the server verified — never by an approval (§7).
      case 'TRUSTED_VET_ACTIVATION':
      case 'TRUSTED_VET_RENEWAL':
        await activateTrustedPeriodFromPayment(tx, batch);
        return;
      // A club's joining fee. Paying it never overrides the club's own approval
      // rule, and never grants a membership whose conditions have lapsed.
      case 'CLUB_MEMBERSHIP':
        await activateClubMembershipFromPayment(tx, batch.id);
        return;
      // A promotion is placement the seller paid for. It becomes live only here,
      // inside the verifying transaction, and a renewal starts where the live
      // one ends rather than overlapping it (PROMPT-004).
      case 'ANIMAL_LISTING_PROMOTION':
        await activatePromotionFromPayment(tx, batch);
        return;
      // The reservation itself. The advert becomes RESERVED, this request
      // becomes the deal, the others are closed with a reason and the two sides
      // get each other's contact details — all inside this transaction, so a
      // reservation can never exist without the money that made it (PROMPT-005).
      case 'ANIMAL_SALE_DEPOSIT':
        await reserveFromDeposit(tx, batch);
        return;
      // A store starts trading because a plan period began, and a period begins
      // here, inside the verifying transaction — never because an operator said
      // the seller had paid (PROMPT-008).
      case 'COMMERCE_SELLER_PLAN':
        await activatePlanFromPayment(tx, batch);
        return;
      // Every hold in the basket becomes a sale here, and the sub-orders start
      // their own lives. Because this runs inside the transaction that moves
      // the attempt out of PENDING, a replayed callback never reaches it and
      // therefore can never sell the same units twice (PROMPT-010).
      case 'COMMERCE_ORDER':
        await orderPaidEffects().onPaid(tx, batch);
        return;
      // A finder subscription period begins only here, inside the verifying
      // transaction; a renewal starts where the live chain ends (Phase 4, PROMPT-002).
      case 'MATING_FINDER_SUBSCRIPTION':
        await activateFinderSubscriptionFromPayment(tx, batch);
        return;
      default:
        return;
    }
  },
};
