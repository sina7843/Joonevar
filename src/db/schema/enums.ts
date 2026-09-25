import { pgEnum } from 'drizzle-orm/pg-core';

/** The six actor contexts of §4. Operational contexts are separate shells (D11). */
export const actorContext = pgEnum('actor_context', [
  'USER',
  'BREEDER',
  'TRUSTED_VET',
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
  // Phase 2 content environments (P2-D11, DEC-0158).
  'AUTHOR',
  'CONTENT_ADMIN',
  // Phase 2 review operator (DEC-0165).
  'REVIEW_OPERATOR',
  /*
   * Phase 3 marketplace operations (DEC-0204). Six separate contexts rather
   * than one "marketplace operator", because the work really is separate: the
   * person who hides an abusive listing is not the person who moves money, and
   * support answers questions without deciding anything.
   */
  'MARKETPLACE_ADMIN',
  'LISTING_MODERATOR',
  'SELLER_REVIEWER',
  'FINANCE_OPERATOR',
  'DISPUTE_REVIEWER',
  'SUPPORT_AGENT',
]);

/** Roles that can be granted to an account. USER is implicit for every account. */
export const accountRole = pgEnum('account_role_name', [
  'BREEDER',
  'TRUSTED_VET',
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
  'AUTHOR',
  'CONTENT_ADMIN',
  'REVIEW_OPERATOR',
  // Phase 3 marketplace operations (DEC-0204).
  'MARKETPLACE_ADMIN',
  'LISTING_MODERATOR',
  'SELLER_REVIEWER',
  'FINANCE_OPERATOR',
  'DISPUTE_REVIEWER',
  'SUPPORT_AGENT',
]);

export const accountRoleStatus = pgEnum('account_role_status', ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']);

export const accountStatus = pgEnum('account_status', ['PROFILE_INCOMPLETE', 'ACTIVE', 'DISABLED']);

/** Who performed an audited action. SYSTEM covers scheduled and callback-driven effects. */
export const auditActorType = pgEnum('audit_actor_type', ['ACCOUNT', 'SYSTEM']);

/** Value shape of a product setting. MONEY_TOMAN is always an exact integer Toman string. */
export const settingKind = pgEnum('setting_kind', ['INT', 'MONEY_TOMAN', 'STRING', 'TEXT', 'BOOL', 'JSON']);

/**
 * Where a setting's value comes from. This separation is what keeps a technical
 * default from being reported later as an approved product policy (§29.2).
 */
export const settingSource = pgEnum('setting_source', [
  /** Explicit owner decision recorded in Requirements (e.g. 21 days, 300000 Toman). */
  'PRODUCT_DECISION',
  /** Fixed product rule that operators may read but not freely rewrite (14 days / six months). */
  'DOCUMENTED_POLICY',
  /** Claude-chosen reversible default, logged in DECISIONS.md. */
  'TECHNICAL_DEFAULT',
  /** Real operational data that only the responsible team can supply. */
  'OPERATIONAL_DATA',
]);

/** Permission group of a setting; §21.4 scopes access per group, not per operator. */
export const settingGroup = pgEnum('setting_group', [
  'DEADLINES',
  'FEES',
  'GENETICS_CENTRE',
  'REFERENCE_DATA',
  'GUIDE_TEXT',
  'OTP_TECHNICAL',
  'BREEDING_POLICY',
  'INTEGRATIONS',
  /** Anti-abuse limits of user reports (Phase 2, DEC-0161). */
  'MODERATION',
  /** Prices of the advertising packages (Phase 2, §14, P2-D03). */
  'ADVERTISING',
  /*
   * Phase 3 (DEC-0204). Four groups rather than one, because the people are
   * different: the animal market and the shop are run by the marketplace admin,
   * settlement figures move real money and stay with the superadmin, and the
   * kill switches are the one group an operator may need to reach in a hurry.
   */
  'ANIMAL_MARKET',
  'COMMERCE',
  'SETTLEMENT',
  'MARKETPLACE_OPERATIONS',
]);

/** The two Phase 3 markets. They share nothing but the species list (DEC-0203). */
export const marketplaceMarket = pgEnum('marketplace_market', ['ANIMAL_SALE', 'MERCHANDISE']);

export const settingScopeType = pgEnum('setting_scope_type', ['GLOBAL']);

/** Purpose decides the accepted file types and the size ceiling. */
export const filePurpose = pgEnum('file_purpose', [
  'KYC_NATIONAL_ID',
  'FOREIGN_PEDIGREE_FRONT',
  'FOREIGN_PEDIGREE_BACK',
  'GENETICS_RECEIPT',
  'ANIMAL_PHOTO',
  /** Served publicly only while attached to visible content (DEC-0160). */
  'CONTENT_IMAGE',
  /** Council card, licence or identity proof of a veterinarian application; reviewers only (DEC-0165). */
  'VET_APPLICATION_DOCUMENT',
  /** Licence, authorisation letter or identity proof of a centre claim (DEC-0169). */
  'CENTRE_CLAIM_DOCUMENT',
  /** Public images of a directory record, served only while that record is published. */
  'BREED_IMAGE',
  'CENTRE_IMAGE',
  'VET_PROFILE_IMAGE',
  'COMMUNITY_IMAGE',
  /** Student card, council card, licence or certificate of a Phase 2.5 professional case; owner and reviewers only (DEC-0189). */
  'VET_PROFESSIONAL_DOCUMENT',
  /** Photos and the optional video of an animal listing; served publicly only while the listing is published (PROMPT-003). */
  'ANIMAL_LISTING_IMAGE',
  'ANIMAL_LISTING_VIDEO',
  /** An image or document shared inside one transaction thread; never public (PROMPT-005). */
  'INQUIRY_ATTACHMENT',
  /** Evidence attached to a deposit dispute; the two parties and the reviewer only (PROMPT-006). */
  'DISPUTE_EVIDENCE',
]);

export const notificationChannel = pgEnum('notification_channel', ['IN_APP', 'SMS']);

export const deliveryStatus = pgEnum('delivery_status', ['PENDING', 'SENT', 'FAILED', 'SUPPRESSED']);

/** Breed bank attributes (Requirements-Phase-2 §6): closed lists, never free text (DEC-0154). */
export const breedSize = pgEnum('breed_size', ['TOY', 'SMALL', 'MEDIUM', 'LARGE', 'GIANT']);
export const breedCoat = pgEnum('breed_coat', ['HAIRLESS', 'SHORT', 'MEDIUM', 'LONG', 'WIRE', 'CURLY']);
export const breedLevel = pgEnum('breed_level', ['LOW', 'MODERATE', 'HIGH']);

/** Whether a breed has a public page — independent of whether forms offer it (DEC-0155). */
export const breedProfileStatus = pgEnum('breed_profile_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/** CMS content types — Requirements-Phase-2 §12. */
export const contentKind = pgEnum('content_kind', ['ARTICLE', 'NEWS', 'ANNOUNCEMENT', 'CLUB_POST']);

/** What a user report is about. Profiles join when their prompts publish them (006, 008, 010). */
/**
 * What a user report is about.
 *
 * Phase 3 adds the three things a marketplace gets reported for: the advert
 * itself, one picture in it, and the seller behind it. They are separate
 * because the answer is different — a wrong photo is not a dishonest seller —
 * and because a moderator has to be able to act on the smallest thing that is
 * actually wrong (PROMPT-004).
 */
export const reportTargetKind = pgEnum('report_target_kind', [
  'CONTENT',
  'CLUB',
  'ANIMAL_LISTING',
  'LISTING_MEDIA',
  'SELLER',
  /** Chat evidence. Its table exists from PROMPT-005, so the target is real. */
  'INQUIRY_MESSAGE',
]);

/**
 * An appeal against a moderation decision.
 *
 * Nothing about a decision is undone by disagreeing with it: the appeal is its
 * own row with its own outcome, so the original decision, the objection and the
 * answer all remain readable afterwards (PROMPT-004).
 */
export const moderationAppealStatus = pgEnum('moderation_appeal_status', ['OPEN', 'UPHELD', 'OVERTURNED']);

/** A paid promotion of one advert. `EXPIRED` is never stored — it is read from the dates. */
export const listingPromotionStatus = pgEnum('listing_promotion_status', [
  'PENDING_PAYMENT',
  'ACTIVE',
  'CANCELLED',
  'PAYMENT_FAILED',
]);

export const reportReason = pgEnum('report_reason', [
  'INCORRECT_INFO',
  'HEALTH_MISINFORMATION',
  'OFFENSIVE',
  'SPAM',
  'COPYRIGHT',
  'PRIVACY',
  'OTHER',
]);

export const reportStatus = pgEnum('report_status', ['OPEN', 'DISMISSED', 'ACTIONED']);

/** The moderation decisions of Requirements-Phase-2 §13. */
export const moderationDecision = pgEnum('moderation_decision', [
  'DISMISS',
  'REQUEST_CORRECTION',
  'HIDE',
  'SOFT_DELETE',
  'RESTRICT_PUBLISHER',
]);

/** CMS status — §12. DELETED is the soft delete of P2-D13; no row is removed. */
export const contentStatus = pgEnum('content_status', ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED', 'DELETED']);

export const breedClaimKind = pgEnum('breed_claim_kind', [
  'HEALTH_NOTE',
  'PREDISPOSED_CONDITION',
  'SUGGESTED_GENETIC_TEST',
]);

/**
 * Animal listing lifecycle — Phase 3, PROMPT-003.
 *
 * DRAFT is private to the seller. PUBLISHED is the only state the public sees.
 * PAUSED is the seller's own pause; SUSPENDED is a moderator's hold and is
 * deliberately a different state, so "I paused it" and "we stopped it" are
 * never confused. RESERVED is reached only by a verified deposit (PROMPT-006)
 * and SOLD only by a completed handover (PROMPT-007).
 */
export const animalListingStatus = pgEnum('animal_listing_status', [
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'RESERVED',
  'SOLD',
  'EXPIRED',
  'SUSPENDED',
  'REMOVED',
]);

/** Exact or negotiable (PRODUCT_DECISIONS §3). A negotiable listing has no price until it is locked. */
export const listingPriceMode = pgEnum('listing_price_mode', ['EXACT', 'NEGOTIABLE']);

/** Who is selling (PRODUCT_DECISIONS §2). Decided by the server from real facts, never from the form. */
export const listingSellerKind = pgEnum('listing_seller_kind', ['OWNER', 'KENNEL']);

/** The delivery options a seller offers; the buyer picks one (PRODUCT_DECISIONS §6). */
export const listingDeliveryMethod = pgEnum('listing_delivery_method', [
  'IN_PERSON',
  'SELLER_LOCATION',
  'VET_CLINIC',
]);

/**
 * A disclosure the seller makes about the animal.
 *
 * Three values on purpose. Identity and ownership are facts Hamzist holds;
 * vaccination and neutering are not, so «نمی‌دانم» has to be sayable instead of
 * being collapsed into «خیر» — a listing that quietly claims "not vaccinated"
 * because nobody answered is a false statement about somebody's animal.
 */
export const listingDisclosure = pgEnum('listing_disclosure', ['YES', 'NO', 'UNKNOWN']);

/** Media of a listing. The video is optional (PRODUCT_DECISIONS §3). */
export const listingMediaKind = pgEnum('listing_media_kind', ['IMAGE', 'VIDEO']);

/**
 * A purchase request on one advert — PROMPT-005.
 *
 * Several may be open at once on the same advert; only one may be ACCEPTED,
 * and only a verified deposit turns that one into CONVERTED. EXPIRED is what a
 * missed payment deadline produces, and it releases the advert for the others.
 */
export const inquiryStatus = pgEnum('inquiry_status', [
  'OPEN',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
  'EXPIRED',
  'CONVERTED',
  /** The animal actually changed hands and the ownership moved (PROMPT-007). */
  'COMPLETED',
  'CLOSED',
]);

/** Who made an offer. A counteroffer is an offer by the other party. */
export const offerParty = pgEnum('offer_party', ['BUYER', 'SELLER']);

/** An offer is never edited: a new one supersedes it, and both stay readable. */
export const offerStatus = pgEnum('offer_status', [
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
  'WITHDRAWN',
]);

/** What one message in a transaction thread is. */
export const inquiryMessageKind = pgEnum('inquiry_message_kind', [
  'TEXT',
  'IMAGE',
  'DOCUMENT',
  'OFFER',
  'HANDOVER',
  'SYSTEM',
]);

export const handoverProposalStatus = pgEnum('handover_proposal_status', [
  'PROPOSED',
  'ACCEPTED',
  'REJECTED',
  'SUPERSEDED',
]);

// ── the deal after the deposit (PROMPT-006) ────────────────────────────────

/** A published commission rule is the formula a deal was priced by (PROMPT-006). */
export const commissionRuleStatus = pgEnum('commission_rule_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/**
 * Why a reserved deal ended.
 *
 * The first two are somebody changing their mind; the next three are claims
 * about the animal or the advert that have to be shown to a reviewer before
 * they change where the money goes; the last two are a handover nobody turned
 * up for.
 */
export const dealCancellationReason = pgEnum('deal_cancellation_reason', [
  'BUYER_CANCELLED',
  'SELLER_CANCELLED',
  'INFO_MISMATCH',
  'FALSE_LISTING',
  'HEALTH_ISSUE',
  'BUYER_NO_SHOW',
  'SELLER_NO_SHOW',
]);

/** What a cancellation does with the deposit, decided from the frozen policy. */
export const dealCancellationOutcome = pgEnum('deal_cancellation_outcome', [
  'FULL_REFUND',
  'PARTIAL_REFUND',
  'NO_REFUND',
  'AWAITING_REVIEW',
]);

/**
 * A refund is a record with a life of its own.
 *
 * `MANUAL_REQUIRED` is the honest state for a provider that has no automated
 * refund here: the money is owed and the record says so, rather than a button
 * claiming it moved.
 */
export const depositRefundStatus = pgEnum('deposit_refund_status', [
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'MANUAL_REQUIRED',
  'CANCELLED',
]);

export const refundAttemptOutcome = pgEnum('refund_attempt_outcome', [
  'REFUNDED',
  'FAILED',
  'UNSUPPORTED',
]);

/** What Hamzist will arbitrate. The remaining price is deliberately absent. */
export const disputeScope = pgEnum('dispute_scope', ['DEPOSIT', 'LISTING_FACTS', 'HANDOVER']);

export const disputeStatus = pgEnum('dispute_status', [
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
  'WITHDRAWN',
]);

/** A reviewer's answer, always with a reason and always audited. */
export const disputeDecision = pgEnum('dispute_decision', [
  'BUYER_FAVOURED',
  'SELLER_FAVOURED',
  'NO_FAULT',
  'OUT_OF_SCOPE',
]);

/** Money a seller owes Hamzist. The ledger proper arrives with the shop. */
export const sellerDebtStatus = pgEnum('seller_debt_status', ['OUTSTANDING', 'SETTLED', 'WAIVED']);

// ── the handover itself (PROMPT-007) ───────────────────────────────────────

/**
 * Where a deal stands at the moment of handing the animal over.
 *
 * `CODE_ISSUED` and `SELLER_ENTERED` are separate because the two sides act at
 * different moments: the seller enters the buyer's code in front of them, and
 * only the buyer's own confirmation completes the transfer.
 */
export const handoverStatus = pgEnum('handover_status', [
  'SCHEDULED',
  'CODE_ISSUED',
  'SELLER_ENTERED',
  'COMPLETED',
  'REFUSED',
  'EXPIRED',
  'CANCELLED',
  'ON_HOLD',
]);

/** Why an animal changed hands. A sale is one of several possible reasons. */
export const ownershipTransferReason = pgEnum('ownership_transfer_reason', [
  'MARKETPLACE_SALE',
  'ADMIN_CORRECTION',
]);
