/**
 * Identifier contract — Requirements §23.2.
 *
 * Every identifier in this product means something different. They are branded
 * so the type system refuses to pass a Referral Code where a Sample Tracking
 * Code belongs, which is the exact mistake §23.2 forbids.
 */
import { randomUUID, randomInt } from 'node:crypto';

declare const brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [brand]: B };

export type AccountId = Branded<string, 'AccountId'>;
export type AnimalId = Branded<string, 'AnimalId'>;
export type PetId = Branded<string, 'PetId'>;
export type MicrochipNumber = Branded<string, 'MicrochipNumber'>;
export type ReferralCode = Branded<string, 'ReferralCode'>;
export type SampleTrackingCode = Branded<string, 'SampleTrackingCode'>;
export type PedigreeCode = Branded<string, 'PedigreeCode'>;
export type MatingCaseId = Branded<string, 'MatingCaseId'>;
export type BirthId = Branded<string, 'BirthId'>;
export type LitterId = Branded<string, 'LitterId'>;
export type PuppyCardNo = Branded<string, 'PuppyCardNo'>;
export type MembershipNo = Branded<string, 'MembershipNo'>;
export type FileId = Branded<string, 'FileId'>;
export type NotificationId = Branded<string, 'NotificationId'>;

export const asAccountId = (v: string) => v as AccountId;
export const asAnimalId = (v: string) => v as AnimalId;
export const asFileId = (v: string) => v as FileId;
export const asReferralCode = (v: string) => v as ReferralCode;
export const asSampleTrackingCode = (v: string) => v as SampleTrackingCode;

export const newUuid = (): string => randomUUID();

/**
 * Human-readable code alphabet. Excludes 0/O/1/I/L so a code read aloud at a
 * clinic desk or typed from a paper slip cannot collide — manual entry is an
 * equal path to QR, not a fallback (§11.2).
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function humanCode(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!;
  return out;
}

/** QR and manual entry are two renderings of this one value (§11.2). */
export function newReferralCode(): ReferralCode {
  return ('HZ-' + humanCode(10)) as ReferralCode;
}

/** Issued only after a sample has actually been taken (§12.4). */
export function newSampleTrackingCode(): SampleTrackingCode {
  return ('SM-' + humanCode(10)) as SampleTrackingCode;
}

/**
 * Identifiers stay readable inside Persian RTL text (§24.3) by isolating them
 * with Unicode FSI/PDI rather than by changing the string itself.
 */
export function ltrIsolate(value: string): string {
  return '⁨' + value + '⁩';
}
