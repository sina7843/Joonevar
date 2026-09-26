/**
 * Central authorization policy.
 *
 * §21.4 is explicit that holding an operational shell is not the same as being
 * allowed to change everything in it, so settings permissions are granted per
 * setting group rather than per operator.
 */
import { forbidden } from '../domain/errors.ts';
import type { Actor, ActorContextName } from './actor.ts';

export const SETTING_GROUPS = [
  'DEADLINES',
  'FEES',
  'GENETICS_CENTRE',
  'REFERENCE_DATA',
  'GUIDE_TEXT',
  'OTP_TECHNICAL',
  'BREEDING_POLICY',
  'INTEGRATIONS',
  'MODERATION',
  'ADVERTISING',
  // Phase 3 (DEC-0204).
  'ANIMAL_MARKET',
  'COMMERCE',
  'SETTLEMENT',
  'MARKETPLACE_OPERATIONS',
  // Phase 4 (DEC-0218).
  'MATING_FINDER',
] as const;
export type SettingGroupName = (typeof SETTING_GROUPS)[number];

interface GroupAccess {
  readonly read: readonly ActorContextName[];
  readonly write: readonly ActorContextName[];
}

/**
 * BREEDING_POLICY holds the 14 day / six month cooldown. It is a documented
 * product rule (§17.2), not a workflow knob, so it is readable but writable by
 * nobody through the settings panel; changing it needs a product decision and a
 * migration, which keeps the rule from drifting silently.
 */
const ACCESS: Record<SettingGroupName, GroupAccess> = {
  DEADLINES: { read: ['SUPERADMIN', 'ASSOCIATION_OPERATOR'], write: ['SUPERADMIN'] },
  // Which provider each adapter uses, and its key. Only the superadmin may
  // change one, because switching a provider changes what really happens to a
  // payment or a message.
  INTEGRATIONS: { read: ['SUPERADMIN'], write: ['SUPERADMIN'] },
  FEES: { read: ['SUPERADMIN', 'ASSOCIATION_OPERATOR'], write: ['SUPERADMIN'] },
  GENETICS_CENTRE: { read: ['SUPERADMIN', 'GENETICS_OPERATOR'], write: ['SUPERADMIN'] },
  REFERENCE_DATA: { read: ['SUPERADMIN', 'ASSOCIATION_OPERATOR'], write: ['SUPERADMIN', 'ASSOCIATION_OPERATOR'] },
  GUIDE_TEXT: {
    read: ['SUPERADMIN', 'ASSOCIATION_OPERATOR', 'GENETICS_OPERATOR'],
    write: ['SUPERADMIN', 'ASSOCIATION_OPERATOR'],
  },
  OTP_TECHNICAL: { read: ['SUPERADMIN'], write: ['SUPERADMIN'] },
  BREEDING_POLICY: { read: ['SUPERADMIN', 'ASSOCIATION_OPERATOR'], write: [] },
  // The content admin sees the report limit it works under; only the superadmin changes it.
  MODERATION: { read: ['SUPERADMIN', 'CONTENT_ADMIN'], write: ['SUPERADMIN'] },
  // Package prices. The review operator reads them to answer a manager's
  // question; changing what is charged stays with the superadmin (§14, P2-D03).
  ADVERTISING: { read: ['SUPERADMIN', 'REVIEW_OPERATOR'], write: ['SUPERADMIN'] },

  /*
   * Phase 3 (DEC-0204). Read is wider than write on purpose: a moderator and a
   * dispute reviewer have to know the window they are judging against, and
   * support has to be able to answer "how long do I have to return this"
   * without being able to change the answer.
   */
  ANIMAL_MARKET: {
    read: ['SUPERADMIN', 'MARKETPLACE_ADMIN', 'LISTING_MODERATOR', 'DISPUTE_REVIEWER', 'SUPPORT_AGENT'],
    write: ['SUPERADMIN', 'MARKETPLACE_ADMIN'],
  },
  COMMERCE: {
    read: ['SUPERADMIN', 'MARKETPLACE_ADMIN', 'SELLER_REVIEWER', 'DISPUTE_REVIEWER', 'SUPPORT_AGENT'],
    write: ['SUPERADMIN', 'MARKETPLACE_ADMIN'],
  },
  /*
   * Settlement cadence, hold period and minimum payout decide when somebody
   * else's money becomes withdrawable. The finance operator runs settlement and
   * reads these; changing them stays with the superadmin, so the person who
   * moves the money is not the person who sets the rules for moving it.
   */
  SETTLEMENT: {
    read: ['SUPERADMIN', 'MARKETPLACE_ADMIN', 'FINANCE_OPERATOR'],
    write: ['SUPERADMIN'],
  },
  /*
   * The kill switches. Every marketplace context reads them, because knowing a
   * flow is closed is what stops a wrong answer to a user; only the two admins
   * throw them, and throwing one is audited like any other setting change.
   */
  MARKETPLACE_OPERATIONS: {
    read: [
      'SUPERADMIN',
      'MARKETPLACE_ADMIN',
      'LISTING_MODERATOR',
      'SELLER_REVIEWER',
      'FINANCE_OPERATOR',
      'DISPUTE_REVIEWER',
      'SUPPORT_AGENT',
    ],
    write: ['SUPERADMIN', 'MARKETPLACE_ADMIN'],
  },
  /*
   * Phase 4 mating finder (DEC-0218). Plans, capacities, bounds and kill
   * switches are the superadmin's (PRODUCT_DECISIONS §12). The operators who
   * moderate, support or report on the finder read them, because they have to
   * know the rule they are answering about.
   */
  MATING_FINDER: {
    read: ['SUPERADMIN', 'MARKETPLACE_ADMIN', 'LISTING_MODERATOR', 'SUPPORT_AGENT', 'DISPUTE_REVIEWER', 'FINANCE_OPERATOR'],
    write: ['SUPERADMIN'],
  },
};

export function canReadSettingGroup(actor: Actor, group: SettingGroupName): boolean {
  return ACCESS[group].read.includes(actor.context);
}

export function canWriteSettingGroup(actor: Actor, group: SettingGroupName): boolean {
  return ACCESS[group].write.includes(actor.context);
}

export function assertCanReadSettingGroup(actor: Actor, group: SettingGroupName): void {
  if (!canReadSettingGroup(actor, group)) {
    throw forbidden('Context ' + actor.context + ' may not read settings group ' + group);
  }
}

export function assertCanWriteSettingGroup(actor: Actor, group: SettingGroupName): void {
  if (!canWriteSettingGroup(actor, group)) {
    throw forbidden('Context ' + actor.context + ' may not change settings group ' + group);
  }
}

/** Groups an actor may see at all, so the admin panel renders only real options. */
export function readableSettingGroups(actor: Actor): readonly SettingGroupName[] {
  return SETTING_GROUPS.filter((g) => canReadSettingGroup(actor, g));
}

/**
 * File access. A private identity document is readable by its owner and by the
 * operational context whose review actually needs it — never by a whole shell
 * just because it is an operational shell.
 */
export type FilePurposeName =
  | 'KYC_NATIONAL_ID'
  | 'FOREIGN_PEDIGREE_FRONT'
  | 'FOREIGN_PEDIGREE_BACK'
  | 'GENETICS_RECEIPT'
  | 'ANIMAL_PHOTO'
  | 'CONTENT_IMAGE'
  | 'VET_APPLICATION_DOCUMENT'
  | 'CENTRE_CLAIM_DOCUMENT'
  | 'BREED_IMAGE'
  | 'CENTRE_IMAGE'
  | 'VET_PROFILE_IMAGE'
  | 'COMMUNITY_IMAGE'
  | 'VET_PROFESSIONAL_DOCUMENT'
  | 'ANIMAL_LISTING_IMAGE'
  | 'ANIMAL_LISTING_VIDEO'
  | 'INQUIRY_ATTACHMENT'
  | 'DISPUTE_EVIDENCE'
  | 'SELLER_DOCUMENT'
  | 'SELLER_LOGO'
  | 'PRODUCT_IMAGE'
  | 'RETURN_EVIDENCE';

const FILE_REVIEWERS: Record<FilePurposeName, readonly ActorContextName[]> = {
  KYC_NATIONAL_ID: ['ASSOCIATION_OPERATOR'],
  FOREIGN_PEDIGREE_FRONT: ['ASSOCIATION_OPERATOR'],
  FOREIGN_PEDIGREE_BACK: ['ASSOCIATION_OPERATOR'],
  GENETICS_RECEIPT: ['GENETICS_OPERATOR'],
  ANIMAL_PHOTO: [],
  // The public reads a content image through /media only while its content is visible (DEC-0160).
  CONTENT_IMAGE: ['CONTENT_ADMIN'],
  // Council card and identity proof of a veterinarian application: its reviewers only (DEC-0165).
  VET_APPLICATION_DOCUMENT: ['REVIEW_OPERATOR', 'SUPERADMIN'],
  // Proof that a representative may speak for a centre: its reviewers only (DEC-0169).
  CENTRE_CLAIM_DOCUMENT: ['REVIEW_OPERATOR', 'SUPERADMIN'],
  /*
   * Public images of directory records. The private route grants nothing extra:
   * these are read through /media only while the record carrying them is
   * published, and the operator who can edit the record is the one who replaces
   * the image. Listing a reviewer context here would hand a whole shell access
   * to files it has no review to do (DEC-0183).
   */
  BREED_IMAGE: ['SUPERADMIN'],
  CENTRE_IMAGE: ['REVIEW_OPERATOR', 'SUPERADMIN'],
  VET_PROFILE_IMAGE: ['REVIEW_OPERATOR', 'SUPERADMIN'],
  COMMUNITY_IMAGE: ['REVIEW_OPERATOR', 'SUPERADMIN'],
  // Evidence of a professional case: the veterinarian and the reviewers, nobody else; every read is audited (DEC-0189).
  // The association admin (the Phase 1 association operator) reviews student and council cases (DEC-0190).
  VET_PROFESSIONAL_DOCUMENT: ['ASSOCIATION_OPERATOR', 'REVIEW_OPERATOR', 'SUPERADMIN'],
  /*
   * Listing media. The public reads these through /media only while the listing
   * is published, exactly as a content image is read (DEC-0160). The private
   * route grants one context beyond the owner: the listing moderator, who has
   * to be able to look at a picture that was reported before deciding what to
   * do about it. Nobody else, and not a whole shell.
   */
  ANIMAL_LISTING_IMAGE: ['LISTING_MODERATOR', 'SUPERADMIN'],
  ANIMAL_LISTING_VIDEO: ['LISTING_MODERATOR', 'SUPERADMIN'],
  /*
   * Something one side of a deal sent the other inside their thread. The table
   * grants it to the sender and to the moderator who has a reported message in
   * front of them; the person it was actually sent to is granted it by their
   * membership of that one thread, which is a question about the record and is
   * asked there rather than widened into a purpose (PROMPT-005).
   */
  INQUIRY_ATTACHMENT: ['LISTING_MODERATOR', 'SUPERADMIN'],
  /*
   * Evidence in a deposit dispute. The table grants it to whoever filed it and
   * to the superadmin; the other party and the reviewer deciding that one case
   * are granted it by their part in that record, which is asked about the
   * record rather than widened into a purpose (PROMPT-006).
   */
  DISPUTE_EVIDENCE: ['SUPERADMIN'],
  /*
   * A seller's business papers. The reviewer of seller applications may read
   * them, and every such read is audited, because these are a business's
   * licence, identity and bank documents rather than a picture of a product
   * (PROMPT-008).
   */
  SELLER_DOCUMENT: ['SELLER_REVIEWER', 'SUPERADMIN'],
  /*
   * A store's logo, served publicly through /media only while that store is
   * active — the same rule a content image has (DEC-0160).
   */
  SELLER_LOGO: ['SELLER_REVIEWER', 'SUPERADMIN'],
  /*
   * A product picture. The public reads it through /media only while its
   * product is published, exactly as a content image is (DEC-0160); the private
   * route grants the catalogue reviewer, who has to look at a picture before
   * publishing the product it belongs to (PROMPT-009).
   */
  PRODUCT_IMAGE: ['SELLER_REVIEWER', 'SUPERADMIN'],
  // A photograph of somebody's returned goods is theirs, the shop's and the
  // arbiter's — nobody else's, however senior (PROMPT-011).
  RETURN_EVIDENCE: ['DISPUTE_REVIEWER', 'SUPPORT_AGENT', 'SUPERADMIN'],
};

export function canReadFile(
  actor: Actor,
  file: { ownerAccountId: string; purpose: FilePurposeName },
): boolean {
  if (actor.accountId === file.ownerAccountId) return true;
  return FILE_REVIEWERS[file.purpose].includes(actor.context);
}

export function assertCanReadFile(actor: Actor, file: { ownerAccountId: string; purpose: FilePurposeName }): void {
  if (!canReadFile(actor, file)) throw forbidden('Not permitted to read this private file');
}
