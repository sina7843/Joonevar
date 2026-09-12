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
  | 'COMMUNITY_IMAGE';

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
