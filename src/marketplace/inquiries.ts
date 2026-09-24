/**
 * Purchase requests, negotiation, the thread and the reservation — PROMPT-005.
 *
 * Four rules shape this module.
 *
 * One: looking is public, asking is not. Anyone may read an advert; only a
 * KYC-verified account may start a request, because from here on the two people
 * are heading towards an animal changing hands.
 *
 * Two: an advert may carry several open requests at once, and the seller
 * chooses one. "Only one at a time" is a partial unique index, not a read
 * followed by a write, so two tabs pressing accept together cannot both win.
 *
 * Three: the final price is a two-sided fact. It is locked from the advert for
 * an exact-price sale, or from an offer the other side accepted, and the
 * commission it produces is frozen with the setting versions it came from.
 *
 * Four: a reservation exists only where money did. `RESERVED` is written inside
 * the transaction that verified the deposit, together with closing every other
 * request — never by anyone pressing a button.
 */
import { and, asc, desc, eq, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { animals } from '../db/schema/animals.ts';
import { animalListings } from '../db/schema/marketplace.ts';
import {
  inquiryBlocks,
  inquiryHandoverProposals,
  inquiryMessages,
  listingInquiries,
  listingOffers,
} from '../db/schema/inquiry.ts';
import { recordAudit } from '../audit/service.ts';
import { violates } from '../db/constraint.ts';
import { createNotification } from '../notifications/service.ts';
import { createBatch, findBatch, type BatchRecord } from '../billing/payments.ts';
import { putPrivateFile, safeOriginalName } from '../files/storage.ts';
import { findCase } from '../identity/kyc.ts';
import { readSetting, readText, snapshotSetting } from '../settings/service.ts';
import { resolveCommission } from './commission-rules.ts';
import { AppError, conflict, forbidden, notConfigured, notFound, validation } from '../domain/errors.ts';
import { resumeContext } from '../domain/resume-context.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability, hasMarketplaceCapability } from './model.ts';
import { assertFlagEnabled } from './flags.ts';
import { isDeliveryMethod, type DeliveryMethod } from './listing-model.ts';
import {
  acceptsInquiries,
  applyContactPolicy,
  canMoveInquiry,
  canRespondToOffer,
  CONTACT_BLOCKED_FA,
  depositForPrice,
  failedDepositDecision,
  isThreadWritable,
  offerProblem,
  paymentDeadline,
  type CommissionInputs,
  type InquiryMover,
  type InquiryStatus,
  type OfferParty,
} from './inquiry-model.ts';

export type InquiryRow = typeof listingInquiries.$inferSelect;
export type OfferRow = typeof listingOffers.$inferSelect;
export type MessageRow = typeof inquiryMessages.$inferSelect;

export const PAYMENT_WINDOW_KEY = 'market.animal.request_payment_window_hours';
export const CANCELLATION_POLICY_KEY = 'market.animal.cancellation_policy_version';
export const COMMISSION_FIXED_KEY = 'market.animal.commission_fixed_toman';
export const COMMISSION_PERCENT_KEY = 'market.animal.commission_percent_bp';
export const COMMISSION_MIN_KEY = 'market.animal.commission_min_toman';
export const COMMISSION_MAX_KEY = 'market.animal.commission_max_toman';
export const BUYER_PENALTY_KEY = 'market.animal.buyer_cancellation_penalty_bp';
export const SELLER_PENALTY_KEY = 'market.animal.seller_cancellation_penalty_toman';
export const SELLER_RESTRICTION_KEY = 'market.animal.seller_cancellation_restriction_days';
export const RISK_LIMIT_KEY = 'market.animal.failed_deposit_limit';
export const RISK_WINDOW_KEY = 'market.animal.failed_deposit_window_days';

const DAY_MS = 24 * 60 * 60 * 1000;

// ── shared reads ───────────────────────────────────────────────────────────

async function loadInquiry(database: DbClient, inquiryId: string): Promise<InquiryRow> {
  const [row] = await database.select().from(listingInquiries).where(eq(listingInquiries.id, inquiryId)).limit(1);
  if (!row) throw notFound('این درخواست خرید پیدا نشد.');
  return row;
}

export type ThreadRole = 'BUYER' | 'SELLER' | 'MODERATOR';

/**
 * Who this actor is inside this thread.
 *
 * A stranger is told the thread does not exist rather than that it is not
 * theirs, so one account cannot use the difference to learn who is negotiating
 * over which animal. A moderator is here because a reported message has to be
 * readable by the person deciding about it — and only by them.
 */
export function threadRole(inquiry: InquiryRow, actor: Actor): ThreadRole {
  if (inquiry.buyerAccountId === actor.accountId) return 'BUYER';
  if (inquiry.sellerAccountId === actor.accountId) return 'SELLER';
  if (hasMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE')) return 'MODERATOR';
  throw notFound('این درخواست خرید پیدا نشد.');
}

const partyOf = (role: ThreadRole): OfferParty => {
  if (role === 'MODERATOR') throw forbidden();
  return role;
};

async function assertKycVerified(database: DbClient, accountId: string): Promise<void> {
  const kyc = await findCase(database, accountId);
  if (kyc?.status !== 'APPROVED') {
    throw conflict('برای ثبت درخواست خرید، احراز هویت شما باید تأییدشده باشد. دیدن آگهی‌ها نیازی به احراز هویت ندارد.');
  }
}

/** A block by either side stops the thread for both; it never deletes anything. */
async function assertNotBlocked(database: DbClient, inquiryId: string): Promise<void> {
  const [block] = await database
    .select({ byAccountId: inquiryBlocks.byAccountId })
    .from(inquiryBlocks)
    .where(eq(inquiryBlocks.inquiryId, inquiryId))
    .limit(1);
  if (block) throw conflict('این گفت‌وگو بسته شده است.');
}

// ── the money, frozen once ─────────────────────────────────────────────────

/**
 * The scope a commission is resolved for.
 *
 * Read from the advert and the animal rather than passed around, because the
 * formula depends on what is being sold and by whom (PRODUCT_DECISIONS §5).
 */
async function commissionScope(
  database: DbClient,
  listingId: string,
): Promise<{ speciesCode: string; sellerKind: 'OWNER' | 'KENNEL' }> {
  const [row] = await database
    .select({ sellerKind: animalListings.sellerKind, speciesCode: animals.species })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(animalListings.id, listingId))
    .limit(1);
  if (!row) throw notFound('این آگهی پیدا نشد.');
  return { speciesCode: row.speciesCode, sellerKind: row.sellerKind as 'OWNER' | 'KENNEL' };
}

/**
 * The fields a price lock writes. Computed once and never recomputed later.
 *
 * The formula comes from the published commission rule for this species and
 * seller kind, or from the global settings when no rule exists (PROMPT-006).
 * Whichever it was, its identity is frozen here with the figures it produced.
 */
async function lockedPriceFields(database: DbClient, listingId: string, finalPriceToman: bigint, now: Date) {
  const commission = await resolveCommission(database, await commissionScope(database, listingId));
  return {
    finalPriceToman,
    finalPriceLockedAt: now,
    depositAmountToman: depositForPrice(finalPriceToman, commission.inputs),
    commissionFixedToman: commission.inputs.fixedToman,
    commissionPercentBp: commission.inputs.percentBp,
    commissionMinToman: commission.inputs.minToman,
    commissionMaxToman: commission.inputs.maxToman,
    commissionSettingVersions: commission.versions,
    commissionRuleId: commission.ruleId,
  };
}

/**
 * The cancellation policy as it stands now, to be frozen on a deal.
 *
 * Each figure is optional and stays null when nobody has set it. That null is
 * carried all the way to the cancellation outcome, where it means "no penalty
 * was agreed for this deal" — never zero by accident and never a fee invented
 * at the moment somebody cancels.
 */
async function frozenCancellationPolicy(database: DbClient): Promise<{
  buyerPenaltyBp: number | null;
  sellerPenaltyToman: bigint | null;
  sellerRestrictionDays: number | null;
}> {
  const buyer = await readSetting(database, BUYER_PENALTY_KEY);
  const seller = await readSetting(database, SELLER_PENALTY_KEY);
  const restriction = await readSetting(database, SELLER_RESTRICTION_KEY);
  return {
    buyerPenaltyBp: buyer.configured ? Number(buyer.value) : null,
    sellerPenaltyToman: seller.configured ? BigInt(String(seller.value)) : null,
    sellerRestrictionDays: restriction.configured ? Number(restriction.value) : null,
  };
}

// ── the bounded risk control ───────────────────────────────────────────────

export interface RiskState {
  readonly failures: number;
  readonly limit: number | null;
  readonly windowDays: number | null;
  readonly blocked: boolean;
  readonly reasonFa: string | null;
}

/**
 * How often this buyer has let an accepted request expire lately.
 *
 * Counted from the rows themselves rather than from a tally somebody has to
 * keep correct, so it cannot drift, and it thins out by itself as the window
 * moves forward.
 */
export async function buyerRisk(database: DbClient, buyerAccountId: string, now: Date = new Date()): Promise<RiskState> {
  const limitRow = await readSetting(database, RISK_LIMIT_KEY);
  const windowRow = await readSetting(database, RISK_WINDOW_KEY);
  const limit = limitRow.configured ? Number(limitRow.value) : null;
  const windowDays = windowRow.configured ? Number(windowRow.value) : null;

  let failures = 0;
  if (limit !== null && windowDays !== null) {
    const since = new Date(now.getTime() - windowDays * DAY_MS);
    const [row] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(listingInquiries)
      .where(
        and(
          eq(listingInquiries.buyerAccountId, buyerAccountId),
          eq(listingInquiries.status, 'EXPIRED'),
          sql`${listingInquiries.statusChangedAt} >= ${since}`,
        ),
      );
    failures = row?.count ?? 0;
  }

  const decision = failedDepositDecision(failures, limit, windowDays);
  return { failures, limit, windowDays, blocked: decision.blocked, reasonFa: decision.reasonFa };
}

// ── requests ───────────────────────────────────────────────────────────────

export interface CreateInquiryInput {
  readonly listingId: string;
  readonly messageFa?: string | null;
  /** A negotiable advert may be opened with the buyer's first offer. */
  readonly offerToman?: bigint | null;
}

/**
 * Start a request.
 *
 * An exact-price advert locks its price here, because there is nothing to agree
 * about: the number on the advert is the number. A negotiable one locks nothing
 * yet and the ladder of offers decides it.
 */
export async function createInquiry(
  database: Database,
  actor: Actor,
  input: CreateInquiryInput,
): Promise<InquiryRow> {
  await assertFlagEnabled(database, 'market.flag.animal_market_enabled');
  await assertKycVerified(database, actor.accountId);

  const [listing] = await database
    .select({
      id: animalListings.id,
      sellerAccountId: animalListings.sellerAccountId,
      status: animalListings.status,
      priceMode: animalListings.priceMode,
      priceToman: animalListings.priceToman,
    })
    .from(animalListings)
    .where(eq(animalListings.id, input.listingId))
    .limit(1);
  if (!listing) throw notFound('این آگهی پیدا نشد.');
  if (listing.sellerAccountId === actor.accountId) throw validation('نمی‌توانید برای آگهی خودتان درخواست خرید ثبت کنید.');
  if (!acceptsInquiries(listing.status as never)) throw conflict('این آگهی در حال حاضر درخواست خرید نمی‌پذیرد.');

  // Checked before anything is written, so somebody who cannot have a request
  // accepted is told now rather than after a seller has read it.
  const risk = await buyerRisk(database, actor.accountId);
  if (risk.blocked) throw conflict(risk.reasonFa!);

  const now = new Date();
  const exact = listing.priceMode === 'EXACT';
  if (exact && (listing.priceToman === null || listing.priceToman <= 0n)) {
    throw conflict('قیمت این آگهی معتبر نیست.');
  }

  const opening = input.offerToman ?? null;
  if (opening !== null) {
    if (exact) throw validation('این آگهی قیمت مقطوع دارد و پیشنهاد قیمت نمی‌پذیرد.');
    const problem = offerProblem(opening);
    if (problem !== null) throw validation(problem);
  }

  const messageFa = input.messageFa?.trim() ?? '';
  // The opening message goes through the same policy every later message does.
  const opened = messageFa === '' ? null : applyContactPolicy(messageFa, false);

  return database.transaction(async (tx) => {
    let inquiry: InquiryRow;
    try {
      const [row] = await tx
        .insert(listingInquiries)
        .values({
          listingId: listing.id,
          buyerAccountId: actor.accountId,
          sellerAccountId: listing.sellerAccountId,
          status: 'OPEN',
          messageFa: opened?.text ?? null,
          statusChangedAt: now,
          ...(exact ? await lockedPriceFields(tx, listing.id, listing.priceToman!, now) : {}),
        })
        .returning();
      inquiry = row!;
    } catch (error) {
      if (violates(error, 'listing_inquiry_one_live_key')) {
        throw conflict('شما برای این آگهی یک درخواست باز دارید.');
      }
      throw error;
    }

    if (opened !== null) {
      await tx.insert(inquiryMessages).values({
        inquiryId: inquiry.id,
        senderAccountId: actor.accountId,
        kind: 'TEXT',
        bodyFa: opened.text,
        redactedNoteFa: opened.redacted ? CONTACT_BLOCKED_FA : null,
      });
      if (opened.redacted) await logRedaction(tx, actor, inquiry.id, opened.codes);
    }

    if (opening !== null) {
      await insertOffer(tx, actor, inquiry.id, 'BUYER', opening);
    }

    await recordAudit(tx, actor, {
      action: 'LISTING_INQUIRY_CREATED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      after: { listingId: listing.id, priceMode: listing.priceMode, openingOffer: opening?.toString() ?? null },
    });
    await createNotification(tx, {
      recipientAccountId: listing.sellerAccountId,
      kind: 'LISTING_INQUIRY_CREATED',
      titleFa: 'درخواست خرید تازه',
      bodyFa: 'برای یکی از آگهی‌های شما درخواست خرید ثبت شد.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'INQUIRY_REVIEW',
        originRoute: '/account/listings/' + listing.id + '/requests',
      }),
    });
    return inquiry;
  });
}

/** Every enforcement of the disclosure policy is recorded, including the rules that fired. */
async function logRedaction(tx: DbClient, actor: Actor | null, inquiryId: string, codes: readonly string[]): Promise<void> {
  await recordAudit(tx, actor, {
    action: 'INQUIRY_CONTACT_REDACTED',
    targetType: 'LISTING_INQUIRY',
    targetId: inquiryId,
    // The removed text is deliberately not here: the record says what kind of
    // thing was removed, never the thing itself.
    metadata: { rules: [...codes] },
  });
}

// ── offers ─────────────────────────────────────────────────────────────────

async function insertOffer(
  tx: DbClient,
  actor: Actor,
  inquiryId: string,
  party: OfferParty,
  amountToman: bigint,
): Promise<OfferRow> {
  // A new proposal replaces the live one rather than joining it, so «پیشنهاد
  // فعلی» is always a single row and the rest stay readable as history.
  const [live] = await tx
    .select({ id: listingOffers.id })
    .from(listingOffers)
    .where(and(eq(listingOffers.inquiryId, inquiryId), eq(listingOffers.status, 'PROPOSED')))
    .limit(1);
  if (live) {
    await tx
      .update(listingOffers)
      .set({ status: 'SUPERSEDED', respondedAt: new Date() })
      .where(eq(listingOffers.id, live.id));
  }

  const [offer] = await tx
    .insert(listingOffers)
    .values({
      inquiryId,
      party,
      amountToman,
      createdByAccountId: actor.accountId,
      supersedesOfferId: live?.id ?? null,
    })
    .returning();

  await tx.insert(inquiryMessages).values({
    inquiryId,
    senderAccountId: actor.accountId,
    kind: 'OFFER',
    offerId: offer!.id,
  });
  return offer!;
}

/** Propose or counter a price. Either side may, while the thread is open. */
export async function proposeOffer(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; amountToman: bigint },
): Promise<OfferRow> {
  const problem = offerProblem(input.amountToman);
  if (problem !== null) throw validation(problem);

  const inquiry = await loadInquiry(database, input.inquiryId);
  const party = partyOf(threadRole(inquiry, actor));
  if (!isThreadWritable(inquiry.status as InquiryStatus)) throw conflict('این گفت‌وگو بسته شده است.');
  if (inquiry.finalPriceLockedAt !== null) throw conflict('قیمت نهایی این معامله قفل شده است و تغییر نمی‌کند.');
  await assertNotBlocked(database, inquiry.id);

  return database.transaction(async (tx) => {
    const offer = await insertOffer(tx, actor, inquiry.id, party, input.amountToman);
    await recordAudit(tx, actor, {
      action: 'LISTING_OFFER_PROPOSED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      after: { offerId: offer.id, party, amountToman: input.amountToman.toString() },
    });
    await createNotification(tx, {
      recipientAccountId: party === 'BUYER' ? inquiry.sellerAccountId : inquiry.buyerAccountId,
      kind: 'LISTING_OFFER_PROPOSED',
      titleFa: 'پیشنهاد قیمت تازه',
      bodyFa: 'در یکی از گفت‌وگوهای خرید، پیشنهاد قیمت تازه‌ای ثبت شد.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'INQUIRY_THREAD',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });
    return offer;
  });
}

/**
 * Answer the live offer.
 *
 * Accepting locks the final price for both sides at once and freezes the
 * commission that follows from it. The person who made the offer cannot be the
 * one who accepts it, which is the whole of what makes the locked price an
 * agreement rather than an assertion.
 */
export async function respondToOffer(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; offerId: string; accept: boolean },
): Promise<InquiryRow> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  const responder = partyOf(threadRole(inquiry, actor));
  if (!isThreadWritable(inquiry.status as InquiryStatus)) throw conflict('این گفت‌وگو بسته شده است.');
  if (inquiry.finalPriceLockedAt !== null) throw conflict('قیمت نهایی این معامله قفل شده است و تغییر نمی‌کند.');

  const [offer] = await database
    .select()
    .from(listingOffers)
    .where(and(eq(listingOffers.id, input.offerId), eq(listingOffers.inquiryId, inquiry.id)))
    .limit(1);
  if (!offer) throw notFound('این پیشنهاد پیدا نشد.');
  // A stale tab is answering an offer that a newer one already replaced.
  if (offer.status !== 'PROPOSED') throw conflict('این پیشنهاد دیگر پیشنهاد فعلی نیست؛ صفحه را دوباره باز کنید.');
  if (!canRespondToOffer(offer.party as OfferParty, responder)) {
    throw validation('پاسخ به پیشنهاد با طرف مقابل است، نه با پیشنهاددهنده.');
  }

  const now = new Date();
  return database.transaction(async (tx) => {
    await tx
      .update(listingOffers)
      .set({ status: input.accept ? 'ACCEPTED' : 'REJECTED', respondedAt: now })
      .where(and(eq(listingOffers.id, offer.id), eq(listingOffers.status, 'PROPOSED')));

    if (!input.accept) {
      await recordAudit(tx, actor, {
        action: 'LISTING_OFFER_REJECTED',
        targetType: 'LISTING_INQUIRY',
        targetId: inquiry.id,
        after: { offerId: offer.id },
      });
      return inquiry;
    }

    const [updated] = await tx
      .update(listingInquiries)
      .set({
        ...(await lockedPriceFields(tx, inquiry.listingId, offer.amountToman, now)),
        version: inquiry.version + 1,
        updatedAt: now,
      })
      .where(and(eq(listingInquiries.id, inquiry.id), isNull(listingInquiries.finalPriceLockedAt)))
      .returning();
    if (!updated) throw conflict('قیمت نهایی این معامله در این فاصله قفل شد؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'LISTING_PRICE_LOCKED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      targetVersion: updated.version,
      after: {
        offerId: offer.id,
        finalPriceToman: updated.finalPriceToman?.toString() ?? null,
        depositAmountToman: updated.depositAmountToman?.toString() ?? null,
        commissionSettingVersions: updated.commissionSettingVersions,
      },
    });
    await createNotification(tx, {
      recipientAccountId: offer.createdByAccountId,
      kind: 'LISTING_OFFER_ACCEPTED',
      titleFa: 'پیشنهاد قیمت پذیرفته شد',
      bodyFa: 'قیمت نهایی این معامله قفل شد و دیگر تغییر نمی‌کند.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'INQUIRY_THREAD',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });
    return updated;
  });
}

// ── acceptance, decline, withdrawal ────────────────────────────────────────

/**
 * The seller chooses this buyer.
 *
 * Acceptance is not the deal: it is a held place with a deadline on it, read
 * from the managed window at this moment and frozen on the row, so a later
 * change of the window never shortens a deadline somebody was already given.
 */
export async function acceptInquiry(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; expectedVersion: number },
): Promise<InquiryRow> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  if (threadRole(inquiry, actor) !== 'SELLER') throw forbidden();
  if (!canMoveInquiry(inquiry.status as InquiryStatus, 'ACCEPTED', 'SELLER')) {
    throw conflict('این درخواست در وضعیتی نیست که پذیرفته شود.');
  }
  if (inquiry.finalPriceToman === null) {
    throw conflict('تا قفل‌شدن قیمت نهایی، درخواست پذیرفته نمی‌شود.');
  }

  // Without a recorded policy version nobody could say afterwards which terms
  // the two sides agreed to, so the deposit path stays shut until there is one.
  const policyVersion = await readText(database, CANCELLATION_POLICY_KEY);
  const window = await snapshotSetting(database, PAYMENT_WINDOW_KEY);
  const hours = Number(window.value);
  if (!Number.isInteger(hours) || hours <= 0) throw notConfigured(PAYMENT_WINDOW_KEY);

  const risk = await buyerRisk(database, inquiry.buyerAccountId);
  if (risk.blocked) throw conflict('این خریدار به دلیل پرداخت‌نشدن بیعانه‌های اخیر فعلاً قابل پذیرش نیست.');

  // The cancellation policy is frozen here with its version (PROMPT-006). A
  // penalty edited tomorrow must not reach back into this deal, and a penalty
  // nobody had set stays null rather than becoming a zero somebody could later
  // mistake for a decision.
  const policy = await frozenCancellationPolicy(database);

  const now = new Date();
  const deadline = paymentDeadline(now, hours);

  return database.transaction(async (tx) => {
    let updated: InquiryRow | undefined;
    try {
      [updated] = await tx
        .update(listingInquiries)
        .set({
          status: 'ACCEPTED',
          acceptedAt: now,
          paymentDeadlineAt: deadline,
          paymentWindowHours: hours,
          cancellationPolicyVersion: policyVersion,
          buyerPenaltyBp: policy.buyerPenaltyBp,
          sellerPenaltyToman: policy.sellerPenaltyToman,
          sellerRestrictionDays: policy.sellerRestrictionDays,
          statusChangedAt: now,
          version: inquiry.version + 1,
          updatedAt: now,
        })
        .where(and(eq(listingInquiries.id, inquiry.id), eq(listingInquiries.version, input.expectedVersion)))
        .returning();
    } catch (error) {
      // The index is the arbiter of the race the prompt names: two tabs, or a
      // tab and a callback, cannot both hold an advert.
      if (violates(error, 'listing_inquiry_one_accepted_key')) {
        throw conflict('برای این آگهی درخواست دیگری پذیرفته شده است.');
      }
      throw error;
    }
    if (!updated) throw conflict('این درخواست در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'LISTING_INQUIRY_ACCEPTED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      targetVersion: updated.version,
      before: { status: inquiry.status },
      after: {
        status: 'ACCEPTED',
        paymentDeadlineAt: deadline.toISOString(),
        paymentWindowHours: hours,
        paymentWindowSettingVersion: window.version,
        cancellationPolicyVersion: policyVersion,
        buyerPenaltyBp: policy.buyerPenaltyBp,
        sellerPenaltyToman: policy.sellerPenaltyToman?.toString() ?? null,
        sellerRestrictionDays: policy.sellerRestrictionDays,
      },
    });
    await createNotification(tx, {
      recipientAccountId: inquiry.buyerAccountId,
      kind: 'LISTING_INQUIRY_ACCEPTED',
      titleFa: 'درخواست خرید شما پذیرفته شد',
      bodyFa: 'تا پایان مهلت اعلام‌شده بیعانه را پرداخت کنید؛ پس از آن آگهی دوباره برای دیگران باز می‌شود.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'DEPOSIT_PAYMENT',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });
    return updated;
  });
}

/** Decline, withdraw: the two ordinary ways a request ends without money. */
export async function closeInquiry(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; to: Extract<InquiryStatus, 'DECLINED' | 'WITHDRAWN'>; reasonFa?: string; expectedVersion: number },
): Promise<InquiryRow> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  const role = threadRole(inquiry, actor);
  const mover: InquiryMover = partyOf(role);
  if (!canMoveInquiry(inquiry.status as InquiryStatus, input.to, mover)) {
    throw conflict('این تغییر وضعیت مجاز نیست.');
  }
  return applyStatus(database, actor, inquiry, input.to, input.reasonFa?.trim() || null, input.expectedVersion, mover);
}

async function applyStatus(
  database: Database,
  actor: Actor | null,
  inquiry: InquiryRow,
  to: InquiryStatus,
  reasonFa: string | null,
  expectedVersion: number,
  mover: InquiryMover,
): Promise<InquiryRow> {
  const now = new Date();
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(listingInquiries)
      .set({
        status: to,
        closedReasonFa: reasonFa,
        statusChangedAt: now,
        version: inquiry.version + 1,
        updatedAt: now,
      })
      .where(and(eq(listingInquiries.id, inquiry.id), eq(listingInquiries.version, expectedVersion)))
      .returning();
    if (!updated) throw conflict('این درخواست در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'LISTING_INQUIRY_STATUS_CHANGED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      targetVersion: updated.version,
      before: { status: inquiry.status },
      after: { status: to, mover },
      reason: reasonFa,
    });
    await createNotification(tx, {
      recipientAccountId: mover === 'BUYER' ? inquiry.sellerAccountId : inquiry.buyerAccountId,
      kind: 'LISTING_INQUIRY_STATUS_CHANGED',
      titleFa: 'وضعیت درخواست خرید تغییر کرد',
      bodyFa: 'یکی از درخواست‌های خرید شما وضعیت تازه‌ای دارد.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'INQUIRY_THREAD',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });
    return updated;
  });
}

// ── the deposit ────────────────────────────────────────────────────────────

/**
 * Open the deposit payment.
 *
 * The amount is not passed in: the batch reads it from the frozen figure on the
 * request itself. A retry reuses the batch that already exists, because §26
 * keeps a failed payment's draft and its frozen amounts rather than repricing.
 */
export async function startDepositPayment(
  database: Database,
  actor: Actor,
  input: { inquiryId: string },
): Promise<{ inquiry: InquiryRow; batch: BatchRecord }> {
  await assertFlagEnabled(database, 'market.flag.animal_market_enabled');
  const inquiry = await loadInquiry(database, input.inquiryId);
  if (threadRole(inquiry, actor) !== 'BUYER') throw forbidden();
  if (inquiry.status !== 'ACCEPTED') throw conflict('این درخواست در وضعیت پرداخت بیعانه نیست.');
  if (inquiry.paymentDeadlineAt !== null && inquiry.paymentDeadlineAt.getTime() <= Date.now()) {
    throw conflict('مهلت پرداخت بیعانه این درخواست گذشته است.');
  }

  if (inquiry.paymentBatchId !== null) {
    const existing = await findBatch(database, inquiry.paymentBatchId);
    if (existing && existing.status !== 'PAID') return { inquiry, batch: existing };
    if (existing?.status === 'PAID') throw conflict('بیعانه این درخواست قبلاً پرداخت شده است.');
  }

  return database.transaction(async (tx) => {
    const batch = await createBatch(tx as Database, actor, {
      service: 'ANIMAL_SALE_DEPOSIT',
      items: [{ targetType: 'LISTING_INQUIRY', targetId: inquiry.id, inquiryId: inquiry.id }],
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'DEPOSIT_PAYMENT',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });

    const [linked] = await tx
      .update(listingInquiries)
      .set({ paymentBatchId: batch.id, updatedAt: new Date() })
      .where(and(eq(listingInquiries.id, inquiry.id), isNull(listingInquiries.paymentBatchId)))
      .returning();
    if (!linked) throw conflict('برای این درخواست پرداخت دیگری باز شده است؛ صفحه را دوباره باز کنید.');

    await recordAudit(tx, actor, {
      action: 'ANIMAL_SALE_DEPOSIT_STARTED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      after: { batchId: batch.id, amountToman: inquiry.depositAmountToman?.toString() ?? null },
    });
    return { inquiry: linked, batch };
  });
}

/**
 * Turn a verified deposit into a reservation.
 *
 * Runs inside the transaction that marked the batch paid, and does the three
 * things that have to happen together or not at all: this request becomes the
 * deal, the advert becomes RESERVED, and every other open request on that
 * advert is closed with a reason its buyer can read. Contact details become
 * readable at the same instant, which is the only moment they ever do.
 *
 * A second delivery of the same callback finds the request already converted
 * and does nothing, so the effect is idempotent in the only way that matters.
 */
export async function reserveFromDeposit(
  tx: DbClient,
  batch: { id: string },
  now: Date = new Date(),
): Promise<void> {
  const [inquiry] = await tx
    .select()
    .from(listingInquiries)
    .where(eq(listingInquiries.paymentBatchId, batch.id))
    .limit(1);
  if (!inquiry || inquiry.status !== 'ACCEPTED') return;

  const [converted] = await tx
    .update(listingInquiries)
    .set({
      status: 'CONVERTED',
      reservedAt: now,
      contactRevealedAt: now,
      statusChangedAt: now,
      version: inquiry.version + 1,
      updatedAt: now,
    })
    .where(and(eq(listingInquiries.id, inquiry.id), eq(listingInquiries.status, 'ACCEPTED')))
    .returning();
  if (!converted) return;

  const [listing] = await tx
    .select({ id: animalListings.id, status: animalListings.status, version: animalListings.version })
    .from(animalListings)
    .where(eq(animalListings.id, inquiry.listingId))
    .limit(1);
  if (listing) {
    await tx
      .update(animalListings)
      .set({
        status: 'RESERVED',
        statusReasonFa: 'بیعانه این حیوان پرداخت و تأیید شد.',
        statusChangedAt: now,
        version: listing.version + 1,
        updatedAt: now,
      })
      .where(eq(animalListings.id, listing.id));
  }

  // Every other open request on this advert ends here, with a reason rather
  // than by going quiet.
  const closed = await tx
    .update(listingInquiries)
    .set({
      status: 'CLOSED',
      closedReasonFa: 'این حیوان با درخواست دیگری رزرو شد.',
      statusChangedAt: now,
      updatedAt: now,
      version: sql`${listingInquiries.version} + 1`,
    })
    .where(
      and(
        eq(listingInquiries.listingId, inquiry.listingId),
        ne(listingInquiries.id, inquiry.id),
        eq(listingInquiries.status, 'OPEN'),
      ),
    )
    .returning({ id: listingInquiries.id, buyerAccountId: listingInquiries.buyerAccountId });

  await recordAudit(tx, null, {
    action: 'ANIMAL_LISTING_RESERVED',
    targetType: 'LISTING_INQUIRY',
    targetId: inquiry.id,
    targetVersion: converted.version,
    after: {
      listingId: inquiry.listingId,
      batchId: batch.id,
      depositAmountToman: inquiry.depositAmountToman?.toString() ?? null,
      closedOtherRequests: closed.length,
    },
  });

  for (const recipient of [inquiry.buyerAccountId, inquiry.sellerAccountId]) {
    await createNotification(tx, {
      recipientAccountId: recipient,
      kind: 'ANIMAL_LISTING_RESERVED',
      titleFa: 'بیعانه تأیید شد و حیوان رزرو شد',
      bodyFa: 'اطلاعات تماس طرف مقابل از این لحظه در گفت‌وگو در دسترس است.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'INQUIRY_THREAD',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });
  }
  for (const other of closed) {
    await createNotification(tx, {
      recipientAccountId: other.buyerAccountId,
      kind: 'LISTING_INQUIRY_STATUS_CHANGED',
      titleFa: 'این حیوان رزرو شد',
      bodyFa: 'حیوان این آگهی با درخواست دیگری رزرو شد و درخواست شما بسته شد.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: other.id },
        step: 'INQUIRY_THREAD',
        originRoute: '/account/purchases/' + other.id,
      }),
    });
  }
}

/**
 * Release the acceptances whose deadline has passed.
 *
 * Called by an operator or a scheduler; nothing runs it by itself, and that is
 * said plainly rather than hidden behind a page load that happens often enough
 * to look automatic. Releasing frees the advert for the other requests, which
 * stayed open the whole time, and the expiry is what the risk control counts.
 */
export async function releaseExpiredInquiries(database: Database, now: Date = new Date()): Promise<number> {
  const due = await database
    .select()
    .from(listingInquiries)
    .where(and(eq(listingInquiries.status, 'ACCEPTED'), lte(listingInquiries.paymentDeadlineAt, now)));

  let released = 0;
  for (const inquiry of due) {
    try {
      await applyStatus(
        database,
        null,
        inquiry,
        'EXPIRED',
        'مهلت پرداخت بیعانه گذشت و آگهی دوباره باز شد.',
        inquiry.version,
        'SYSTEM',
      );
      released += 1;
    } catch (error) {
      // A deposit verified a moment ago moved the row out of ACCEPTED, and the
      // version guard turned this into a refusal rather than a reversal. That
      // one outcome is expected; anything else is a real failure and is raised.
      if (!(error instanceof AppError) || error.code !== 'CONFLICT') throw error;
    }
  }
  return released;
}

// ── the thread ─────────────────────────────────────────────────────────────

export interface PostMessageInput {
  readonly inquiryId: string;
  readonly bodyFa?: string | null;
  readonly file?: { readonly bytes: Uint8Array; readonly originalName: string | null } | null;
}

/**
 * Say something in the thread.
 *
 * Before the deposit is verified the text goes through the disclosure policy;
 * afterwards it does not, because the two sides have each other's details by
 * then and there is nothing left to withhold. The policy is honest about what
 * it is: a set of rules for the ordinary ways a number or a link is written,
 * not a promise that nothing can get through. Every enforcement is logged and a
 * moderator can read the thread a report came from.
 */
export async function postMessage(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: PostMessageInput,
): Promise<MessageRow> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  const role = threadRole(inquiry, actor);
  if (role === 'MODERATOR') throw forbidden();
  if (!isThreadWritable(inquiry.status as InquiryStatus)) {
    throw conflict('این گفت‌وگو بسته شده است و پیام تازه نمی‌پذیرد.');
  }
  await assertNotBlocked(database, inquiry.id);

  const body = input.bodyFa?.trim() ?? '';
  if (body === '' && !input.file) throw validation('متن پیام یا پیوست را وارد کنید.');

  const revealed = inquiry.contactRevealedAt !== null;
  const policy = body === '' ? null : applyContactPolicy(body, revealed);

  return database.transaction(async (tx) => {
    const stored = input.file
      ? await putPrivateFile(tx, storageRoot, actor, {
          ownerAccountId: actor.accountId,
          purpose: 'INQUIRY_ATTACHMENT',
          bytes: input.file.bytes,
          originalName: safeOriginalName(input.file.originalName),
        })
      : null;

    const [message] = await tx
      .insert(inquiryMessages)
      .values({
        inquiryId: inquiry.id,
        senderAccountId: actor.accountId,
        // The kind follows the bytes the storage layer actually detected, not
        // the name the sender typed.
        kind: stored ? (stored.mime === 'application/pdf' ? 'DOCUMENT' : 'IMAGE') : 'TEXT',
        bodyFa: policy?.text ?? null,
        redactedNoteFa: policy?.redacted ? CONTACT_BLOCKED_FA : null,
        fileId: stored?.id ?? null,
      })
      .returning();

    if (policy?.redacted) await logRedaction(tx, actor, inquiry.id, policy.codes);

    await createNotification(tx, {
      recipientAccountId: role === 'BUYER' ? inquiry.sellerAccountId : inquiry.buyerAccountId,
      kind: 'INQUIRY_MESSAGE_POSTED',
      titleFa: 'پیام تازه در گفت‌وگوی خرید',
      bodyFa: 'در یکی از گفت‌وگوهای خرید پیام تازه‌ای ثبت شد.',
      resume: resumeContext({
        entity: { type: 'LISTING_INQUIRY', id: inquiry.id },
        step: 'INQUIRY_THREAD',
        originRoute: '/account/purchases/' + inquiry.id,
      }),
    });
    return message!;
  });
}

/** Propose a time and a place for the handover; the other side answers it. */
export async function proposeHandover(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; method: string; placeFa?: string | null; proposedAt: Date },
): Promise<void> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  const role = threadRole(inquiry, actor);
  if (role === 'MODERATOR') throw forbidden();
  if (!isDeliveryMethod(input.method)) throw validation('روش تحویل معتبر نیست.');
  if (input.proposedAt.getTime() <= Date.now()) throw validation('زمان پیشنهادی باید در آینده باشد.');
  if (!isThreadWritable(inquiry.status as InquiryStatus) && inquiry.status !== 'CONVERTED') {
    throw conflict('این گفت‌وگو بسته شده است.');
  }
  await assertNotBlocked(database, inquiry.id);

  await database.transaction(async (tx) => {
    const [live] = await tx
      .select({ id: inquiryHandoverProposals.id })
      .from(inquiryHandoverProposals)
      .where(
        and(eq(inquiryHandoverProposals.inquiryId, inquiry.id), eq(inquiryHandoverProposals.status, 'PROPOSED')),
      )
      .limit(1);
    if (live) {
      await tx
        .update(inquiryHandoverProposals)
        .set({ status: 'SUPERSEDED', respondedAt: new Date() })
        .where(eq(inquiryHandoverProposals.id, live.id));
    }

    const [proposal] = await tx
      .insert(inquiryHandoverProposals)
      .values({
        inquiryId: inquiry.id,
        proposedByAccountId: actor.accountId,
        method: input.method as DeliveryMethod,
        placeFa: input.placeFa?.trim() || null,
        proposedAt: input.proposedAt,
      })
      .returning();

    await tx.insert(inquiryMessages).values({
      inquiryId: inquiry.id,
      senderAccountId: actor.accountId,
      kind: 'HANDOVER',
      bodyFa: 'زمان و محل تحویل پیشنهاد شد.',
    });
    await recordAudit(tx, actor, {
      action: 'INQUIRY_HANDOVER_PROPOSED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      after: { proposalId: proposal!.id, method: input.method, proposedAt: input.proposedAt.toISOString() },
    });
  });
}

export async function respondToHandover(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; proposalId: string; accept: boolean },
): Promise<void> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  const role = threadRole(inquiry, actor);
  if (role === 'MODERATOR') throw forbidden();

  const [proposal] = await database
    .select()
    .from(inquiryHandoverProposals)
    .where(
      and(eq(inquiryHandoverProposals.id, input.proposalId), eq(inquiryHandoverProposals.inquiryId, inquiry.id)),
    )
    .limit(1);
  if (!proposal) throw notFound('این پیشنهاد تحویل پیدا نشد.');
  if (proposal.status !== 'PROPOSED') throw conflict('این پیشنهاد دیگر فعال نیست؛ صفحه را دوباره باز کنید.');
  // The same rule the price ladder has: agreeing with yourself is not agreement.
  if (proposal.proposedByAccountId === actor.accountId) {
    throw validation('پاسخ به پیشنهاد تحویل با طرف مقابل است.');
  }

  await database.transaction(async (tx) => {
    await tx
      .update(inquiryHandoverProposals)
      .set({ status: input.accept ? 'ACCEPTED' : 'REJECTED', respondedAt: new Date() })
      .where(and(eq(inquiryHandoverProposals.id, proposal.id), eq(inquiryHandoverProposals.status, 'PROPOSED')));
    await recordAudit(tx, actor, {
      action: 'INQUIRY_HANDOVER_ANSWERED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      after: { proposalId: proposal.id, accepted: input.accept },
    });
  });
}

/** Stop this conversation. Nothing said in it is removed. */
export async function blockThread(
  database: Database,
  actor: Actor,
  input: { inquiryId: string; reasonFa: string },
): Promise<void> {
  const inquiry = await loadInquiry(database, input.inquiryId);
  const role = threadRole(inquiry, actor);
  if (role === 'MODERATOR') throw forbidden();
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل بستن گفت‌وگو را بنویسید؛ برای بررسی گزارش‌ها لازم است.');

  await database.transaction(async (tx) => {
    await tx
      .insert(inquiryBlocks)
      .values({ inquiryId: inquiry.id, byAccountId: actor.accountId, reasonFa })
      .onConflictDoNothing();
    await recordAudit(tx, actor, {
      action: 'INQUIRY_THREAD_BLOCKED',
      targetType: 'LISTING_INQUIRY',
      targetId: inquiry.id,
      reason: reasonFa,
      after: { byRole: role },
    });
  });
}

// ── reads for the screens ──────────────────────────────────────────────────

export interface ThreadMessageView {
  readonly id: string;
  readonly kind: string;
  readonly bodyFa: string | null;
  readonly redactedNoteFa: string | null;
  readonly fileId: string | null;
  /** Set when a moderator hid this message; the text is then not rendered. */
  readonly hiddenReasonFa: string | null;
  readonly offerAmountToman: bigint | null;
  readonly offerParty: string | null;
  readonly offerStatus: string | null;
  readonly mine: boolean;
  readonly createdAt: Date;
}

export interface ThreadView {
  readonly inquiry: InquiryRow;
  readonly role: ThreadRole;
  readonly listingTitleFa: string;
  readonly counterpartMobile: string | null;
  readonly liveOffer: OfferRow | null;
  readonly liveHandover: typeof inquiryHandoverProposals.$inferSelect | null;
  readonly messages: readonly ThreadMessageView[];
  readonly blockedByFa: string | null;
  readonly writable: boolean;
}

/**
 * One thread, for the person entitled to read it.
 *
 * The counterpart's mobile number is in this view only once the deposit has
 * been verified: before that the field is null on the server, not hidden by the
 * page, so no screen and no URL can produce it early.
 */
export async function inquiryThread(
  database: DbClient,
  actor: Actor,
  inquiryId: string,
): Promise<ThreadView> {
  const inquiry = await loadInquiry(database, inquiryId);
  const role = threadRole(inquiry, actor);

  // The name is read from the animal, never copied onto the advert (§10).
  const [listing] = await database
    .select({ nameFa: animals.name })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(animalListings.id, inquiry.listingId))
    .limit(1);

  const counterpartId = role === 'BUYER' ? inquiry.sellerAccountId : inquiry.buyerAccountId;
  let counterpartMobile: string | null = null;
  if (role !== 'MODERATOR' && inquiry.contactRevealedAt !== null) {
    const [person] = await database
      .select({ mobile: accounts.mobile })
      .from(accounts)
      .where(eq(accounts.id, counterpartId))
      .limit(1);
    counterpartMobile = person?.mobile ?? null;
  }

  const rows = await database
    .select({
      id: inquiryMessages.id,
      kind: inquiryMessages.kind,
      bodyFa: inquiryMessages.bodyFa,
      redactedNoteFa: inquiryMessages.redactedNoteFa,
      fileId: inquiryMessages.fileId,
      hiddenAt: inquiryMessages.hiddenAt,
      hiddenReasonFa: inquiryMessages.hiddenReasonFa,
      senderAccountId: inquiryMessages.senderAccountId,
      createdAt: inquiryMessages.createdAt,
      offerAmountToman: listingOffers.amountToman,
      offerParty: listingOffers.party,
      offerStatus: listingOffers.status,
    })
    .from(inquiryMessages)
    .leftJoin(listingOffers, eq(listingOffers.id, inquiryMessages.offerId))
    .where(eq(inquiryMessages.inquiryId, inquiry.id))
    .orderBy(asc(inquiryMessages.createdAt));

  const [liveOffer] = await database
    .select()
    .from(listingOffers)
    .where(and(eq(listingOffers.inquiryId, inquiry.id), eq(listingOffers.status, 'PROPOSED')))
    .limit(1);

  const [liveHandover] = await database
    .select()
    .from(inquiryHandoverProposals)
    .where(
      and(eq(inquiryHandoverProposals.inquiryId, inquiry.id), eq(inquiryHandoverProposals.status, 'PROPOSED')),
    )
    .limit(1);

  const [block] = await database
    .select({ reasonFa: inquiryBlocks.reasonFa })
    .from(inquiryBlocks)
    .where(eq(inquiryBlocks.inquiryId, inquiry.id))
    .limit(1);

  return {
    inquiry,
    role,
    listingTitleFa: listing?.nameFa ?? 'بدون نام',
    counterpartMobile,
    liveOffer: liveOffer ?? null,
    liveHandover: liveHandover ?? null,
    blockedByFa: block?.reasonFa ?? null,
    writable: role !== 'MODERATOR' && isThreadWritable(inquiry.status as InquiryStatus) && block === undefined,
    messages: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      // A hidden message keeps its row and its place in the order; what it said
      // is not rendered to either party, and the reason is.
      bodyFa: row.hiddenAt === null ? row.bodyFa : null,
      redactedNoteFa: row.hiddenAt === null ? row.redactedNoteFa : null,
      fileId: row.hiddenAt === null ? row.fileId : null,
      hiddenReasonFa: row.hiddenReasonFa,
      offerAmountToman: row.offerAmountToman,
      offerParty: row.offerParty,
      offerStatus: row.offerStatus,
      mine: row.senderAccountId === actor.accountId,
      createdAt: row.createdAt,
    })),
  };
}

export interface InquirySummary {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitleFa: string;
  readonly status: string;
  readonly finalPriceToman: bigint | null;
  readonly depositAmountToman: bigint | null;
  readonly paymentDeadlineAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
}

/** What this buyer has asked for. */
export async function buyerInquiries(database: DbClient, actor: Actor): Promise<readonly InquirySummary[]> {
  return summaries(database, eq(listingInquiries.buyerAccountId, actor.accountId));
}

/** What has been asked of this seller, newest first, for one advert or all of them. */
export async function sellerInquiries(
  database: DbClient,
  actor: Actor,
  listingId?: string,
): Promise<readonly InquirySummary[]> {
  const scope = listingId
    ? and(eq(listingInquiries.sellerAccountId, actor.accountId), eq(listingInquiries.listingId, listingId))!
    : eq(listingInquiries.sellerAccountId, actor.accountId);
  return summaries(database, scope);
}

async function summaries(database: DbClient, scope: SQL): Promise<readonly InquirySummary[]> {
  const rows = await database
    .select({
      id: listingInquiries.id,
      listingId: listingInquiries.listingId,
      status: listingInquiries.status,
      finalPriceToman: listingInquiries.finalPriceToman,
      depositAmountToman: listingInquiries.depositAmountToman,
      paymentDeadlineAt: listingInquiries.paymentDeadlineAt,
      version: listingInquiries.version,
      createdAt: listingInquiries.createdAt,
      titleFa: animals.name,
    })
    .from(listingInquiries)
    .innerJoin(animalListings, eq(animalListings.id, listingInquiries.listingId))
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(scope)
    .orderBy(desc(listingInquiries.createdAt));

  return rows.map((row) => ({
    id: row.id,
    listingId: row.listingId,
    listingTitleFa: row.titleFa ?? 'بدون نام',
    status: row.status,
    finalPriceToman: row.finalPriceToman,
    depositAmountToman: row.depositAmountToman,
    paymentDeadlineAt: row.paymentDeadlineAt,
    version: row.version,
    createdAt: row.createdAt,
  }));
}

/**
 * May this account read this attachment?
 *
 * Asked as a question about one record rather than added to the purpose table,
 * so being a party to one deal never becomes access to a whole class of files.
 */
export async function mayReadInquiryAttachment(
  database: DbClient,
  accountId: string,
  fileId: string,
): Promise<boolean> {
  const rows = await database
    .select({ id: listingInquiries.id })
    .from(inquiryMessages)
    .innerJoin(listingInquiries, eq(listingInquiries.id, inquiryMessages.inquiryId))
    .where(
      and(
        eq(inquiryMessages.fileId, fileId),
        or(
          eq(listingInquiries.buyerAccountId, accountId),
          eq(listingInquiries.sellerAccountId, accountId),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Guard for the moderator surfaces that read a reported thread. */
export function assertMayModerateThreads(actor: Actor): void {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
}
