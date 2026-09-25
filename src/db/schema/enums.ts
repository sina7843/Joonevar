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
  /** Licence, identity or bank proof of a seller application; the store and its reviewers only (PROMPT-008). */
  'SELLER_DOCUMENT',
  /** A store's logo; served publicly only while that store is active (PROMPT-008). */
  'SELLER_LOGO',
  /** A product picture; served publicly only while its product is published (PROMPT-009). */
  'PRODUCT_IMAGE',
  /** What a buyer or a shop showed about a return (PROMPT-011). */
  'RETURN_EVIDENCE',
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
  /** What buyers write in public, from PROMPT-012. */
  'REVIEW',
  'QUESTION',
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

// ── the merchandise shop's sellers (PROMPT-008) ────────────────────────────

/**
 * Who may sell goods.
 *
 * PRODUCT_DECISIONS §8 names pet shops and verified businesses, and says
 * Hamzist itself is an ordinary seller tenant in the same model — so the
 * platform's own store is a kind here rather than a privileged exception
 * somewhere in the code.
 */
export const commerceSellerKind = pgEnum('commerce_seller_kind', [
  'PET_SHOP',
  'VERIFIED_BUSINESS',
  'PLATFORM',
]);

/** The whole life of a store, from a draft form to a terminated tenant. */
export const commerceSellerStatus = pgEnum('commerce_seller_status', [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_CORRECTION',
  'APPROVED',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'TERMINATED',
]);

/** What somebody may do inside one store, and nowhere else. */
export const commerceSellerRole = pgEnum('commerce_seller_role', ['OWNER', 'ADMIN', 'STAFF']);

export const commerceMemberStatus = pgEnum('commerce_member_status', ['INVITED', 'ACTIVE', 'REMOVED']);

/** What a document attached to a seller application is. */
export const sellerDocumentKind = pgEnum('seller_document_kind', [
  'BUSINESS_LICENCE',
  'REPRESENTATIVE_ID',
  'BANK_PROOF',
  'OTHER',
]);

export const sellerPlanStatus = pgEnum('seller_plan_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const sellerSubscriptionStatus = pgEnum('seller_subscription_status', [
  'PENDING_PAYMENT',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
]);

// ── the catalogue (PROMPT-009) ─────────────────────────────────────────────

/**
 * Whether a category may be sold in the public shop at all.
 *
 * Medicine is not an ordinary category that happens to be switched off:
 * PRODUCT_DECISIONS says public pharmaceutical sale is outside this phase and
 * that enabling it later needs a separate legal and product decision. The
 * prohibition is therefore a value on the taxonomy, with its reason attached,
 * rather than a flag somebody could flip.
 */
export const categorySalePolicy = pgEnum('category_sale_policy', [
  'ALLOWED',
  'BLOCKED_PHARMACEUTICAL',
]);

/** A shared base product, or one a single seller proposed. */
export const productKind = pgEnum('product_kind', ['SHARED', 'SELLER_EXCLUSIVE']);

export const productStatus = pgEnum('product_status', [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  /** Folded into a shared base; its address still resolves (PROMPT-009). */
  'MERGED',
]);

/** What a seller is selling: a new item, a used one, or a refurbished one. */
export const offerCondition = pgEnum('offer_condition', ['NEW', 'USED', 'REFURBISHED']);

export const offerStatus2 = pgEnum('commerce_offer_status', ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']);

/**
 * Every way stock moves.
 *
 * The ledger is append-only, so these are the only verbs that exist and each
 * row says which one happened, by how much, why and who did it.
 */
export const inventoryMoveKind = pgEnum('inventory_move_kind', [
  'RECEIVE',
  'ADJUST',
  'RESERVE',
  'RELEASE',
  'SELL',
  'RETURN',
]);

export const reservationStatus = pgEnum('reservation_status', [
  'ACTIVE',
  'RELEASED',
  'CONSUMED',
  'EXPIRED',
]);

/**
 * A basket. One is open per account at a time; checking out closes it, so the
 * lines that became an order stay attached to the order rather than moving.
 */
export const cartStatus = pgEnum('cart_status', ['ACTIVE', 'CHECKED_OUT', 'ABANDONED']);

/**
 * The parent order — Phase 3, PROMPT-010.
 *
 * It holds the one payment and nothing else that can move on its own. Whether
 * goods were accepted, shipped or returned belongs to each seller's sub-order,
 * because two sellers in one basket have nothing to do with each other.
 */
export const commerceOrderStatus = pgEnum('commerce_order_status', [
  'PENDING_PAYMENT',
  'PAID',
  /** Never paid: abandoned, cancelled by the buyer, or its holds expired. */
  'CANCELLED',
  /** Paid, and every sub-order in it ended in money going back. */
  'REFUNDED',
]);

/** One seller's part of one order, which lives its own life from PAID onwards. */
export const commerceSubOrderStatus = pgEnum('commerce_suborder_status', [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED_BY_SELLER',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'RETURN_REQUESTED',
  'RETURNED',
  'CANCELLED',
  'REFUNDED',
  'DISPUTED',
]);

/** How a shop gets goods to a buyer, and where the money for it comes from. */
export const shippingMethodKind = pgEnum('shipping_method_kind', ['COURIER', 'POST', 'PICKUP']);

/** A fixed charge per order, or one that follows the weight of what is in it. */
export const shippingPricingKind = pgEnum('shipping_pricing_kind', ['FIXED', 'WEIGHT_BASED']);

/** Everywhere, or only the provinces the shop named. */
export const shippingCoverageKind = pgEnum('shipping_coverage_kind', ['WHOLE_COUNTRY', 'PROVINCES']);

/**
 * What a category does to the platform's return right — PROMPT-011.
 *
 * The right itself is the platform's and a shop cannot take it away. A
 * category can narrow it where the goods make returning them unreasonable,
 * and each narrowing carries its own reason.
 */
export const returnRuleKind = pgEnum('return_rule_kind', [
  /** The platform's ordinary window applies. */
  'STANDARD',
  /** Returnable only unopened and unused, e.g. food and hygiene goods. */
  'SEALED_ONLY',
  /** Not returnable at all, e.g. goods that perish. */
  'NOT_RETURNABLE',
]);

export const returnStatus = pgEnum('order_return_status', [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'SHIPPED_BACK',
  'RECEIVED',
  'REFUNDED',
  'DISPUTED',
]);

/** What the shop found when the parcel came back. */
export const returnedCondition = pgEnum('returned_condition', [
  'AS_SOLD',
  'OPENED',
  'DAMAGED',
  'NOT_AS_DESCRIBED',
  'MISSING',
]);

/**
 * Which balance a ledger entry moves — PROMPT-011.
 *
 * PENDING is money taken but not yet earned; HELD is earned but not yet
 * clear of the return window or of an argument; AVAILABLE is settleable;
 * DEBT is what the shop owes the platform. Every balance is the sum of its
 * entries and is never stored as a number anybody writes.
 */
export const ledgerBucket = pgEnum('seller_ledger_bucket', ['PENDING', 'HELD', 'AVAILABLE', 'DEBT']);

/** Why an entry exists. The bucket says where it lands; this says what happened. */
export const ledgerEntryKind = pgEnum('seller_ledger_kind', [
  'SALE',
  'COMMISSION',
  'REFUND',
  'PROMOTION_CHARGE',
  'PENALTY',
  'ADJUSTMENT',
  'RELEASE',
  'PAYOUT',
  'DEBT_RECOVERY',
]);

/** How often a shop's settleable money is gathered into a batch. */
export const settlementCadence = pgEnum('settlement_cadence', ['WEEKLY', 'MONTHLY']);

export const settlementBatchStatus = pgEnum('settlement_batch_status', [
  'DRAFT',
  'READY',
  'PAID',
  'RECONCILED',
  'FAILED',
  'CANCELLED',
]);

// ── trust and growth — PROMPT-012 ─────────────────────────────────────────

/** What a review is about. The dimensions differ, so the subject has to be known. */
export const reviewSubject = pgEnum('review_subject', ['ANIMAL_DEAL', 'COMMERCE_SUBORDER']);

export const reviewStatus = pgEnum('review_status', ['PUBLISHED', 'HIDDEN', 'REMOVED']);

/** A question is asked of a shop or about one product. */
export const questionSubject = pgEnum('question_subject', ['SELLER', 'PRODUCT']);

export const questionStatus = pgEnum('question_status', [
  'PENDING',
  'PUBLISHED',
  'REJECTED',
  /** Answered and published; the answer is part of the record. */
  'ANSWERED',
]);

/** What somebody kept for later, or is following. */
export const savedSubject = pgEnum('saved_subject', ['ANIMAL_LISTING', 'COMMERCE_PRODUCT']);
export const followSubject = pgEnum('follow_subject', ['COMMERCE_SELLER', 'KENNEL']);

/**
 * The five ways a price comes down — PROMPT-012.
 *
 * A shop's own reduction and its own code are the shop's money; a platform
 * code and a category campaign are Hamzist's; free delivery is either,
 * depending on who declared it. Which one paid for a discount decides who is
 * charged for it, which is why the kind is on the rule rather than inferred.
 */
export const discountKind = pgEnum('discount_kind', [
  'SELLER_DISCOUNT',
  'SELLER_CODE',
  'PLATFORM_CODE',
  'CATEGORY_CAMPAIGN',
  'FREE_SHIPPING',
]);

export const discountStatus = pgEnum('discount_status', ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']);

/** Points are not money: they are earned, spent, expire, and are corrected. */
export const loyaltyKind = pgEnum('loyalty_kind', ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST']);
