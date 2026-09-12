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
]);

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
export const reportTargetKind = pgEnum('report_target_kind', ['CONTENT']);

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
