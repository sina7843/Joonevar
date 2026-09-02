import { pgEnum } from 'drizzle-orm/pg-core';

/** The six actor contexts of §4. Operational contexts are separate shells (D11). */
export const actorContext = pgEnum('actor_context', [
  'USER',
  'BREEDER',
  'TRUSTED_VET',
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
]);

/** Roles that can be granted to an account. USER is implicit for every account. */
export const accountRole = pgEnum('account_role_name', [
  'BREEDER',
  'TRUSTED_VET',
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
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
]);

export const settingScopeType = pgEnum('setting_scope_type', ['GLOBAL']);

/** Purpose decides the accepted file types and the size ceiling. */
export const filePurpose = pgEnum('file_purpose', [
  'KYC_NATIONAL_ID',
  'FOREIGN_PEDIGREE_FRONT',
  'FOREIGN_PEDIGREE_BACK',
  'GENETICS_RECEIPT',
  'ANIMAL_PHOTO',
]);

export const notificationChannel = pgEnum('notification_channel', ['IN_APP', 'SMS']);

export const deliveryStatus = pgEnum('delivery_status', ['PENDING', 'SENT', 'FAILED', 'SUPPRESSED']);
