/**
 * May this person sell this animal — PROMPT-003.
 *
 * Every fact here is read from the service that owns it. Nothing is copied,
 * re-derived or cached: KYC comes from the identity case, membership from the
 * one membership rule, ownership from the animal record, the chip from the
 * microchip register and the kennel from the kennel lifecycle. That is what
 * keeps a locked button and a refused action in agreement, and it is why this
 * is re-run at publication and at every sensitive edit rather than trusted from
 * the moment the draft was created.
 *
 * Two seller kinds, from PRODUCT_DECISIONS §2:
 *  - OWNER: the KYC-approved current owner **with a valid association
 *    membership**;
 *  - KENNEL: the same account when it also holds an approved, active kennel.
 *    The kennel path deliberately does not ask for a live membership, because
 *    the product decision names an active verified kennel as its own
 *    qualification. Selling as a kennel is therefore checked as a fact about
 *    the kennel, not as a second membership rule (DEC-0205).
 */
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { microchips } from '../db/schema/clinical.ts';
import { kennels } from '../db/schema/kennels.ts';
import { findCase } from '../identity/kyc.ts';
import { hasValidMembership } from '../billing/membership.ts';
import { speciesEnabled } from './species.ts';
import type { Database } from '../db/client.ts';

export type SellerKind = 'OWNER' | 'KENNEL';

export const SELLER_KIND_FA: Record<SellerKind, string> = {
  OWNER: 'مالک حیوان',
  KENNEL: 'کنل تأییدشده',
};

/** A named obstacle with the page that clears it, so a refusal is always actionable. */
export interface EligibilityBlocker {
  readonly code: string;
  readonly messageFa: string;
  readonly href?: string;
  readonly ctaFa?: string;
}

export interface SellerEligibility {
  readonly allowed: boolean;
  /** The strongest qualification this account has for this animal, when it has one. */
  readonly sellerKind: SellerKind | null;
  readonly kennelId: string | null;
  readonly blockers: readonly EligibilityBlocker[];
  /** The facts the answer was computed from, so a screen can explain itself. */
  readonly facts: EligibilityFacts;
}

export interface EligibilityFacts {
  readonly kycApproved: boolean;
  readonly membershipValid: boolean;
  readonly ownsAnimal: boolean;
  readonly animalRegistered: boolean;
  readonly animalTransferable: boolean;
  readonly speciesOpen: boolean;
  readonly microchipRegistered: boolean;
  readonly kennelApproved: boolean;
}

const NO_FACTS: EligibilityFacts = {
  kycApproved: false,
  membershipValid: false,
  ownsAnimal: false,
  animalRegistered: false,
  animalTransferable: false,
  speciesOpen: false,
  microchipRegistered: false,
  kennelApproved: false,
};

/**
 * Whether the animal record itself allows a transfer of ownership.
 *
 * An archived record is a record somebody has closed, and a draft is not yet an
 * animal in Hamzist's sense (§9.2). Death is not a state of the animal record
 * in this product — a puppy that died is withdrawn at its own profile — so what
 * is checkable here is exactly this: the record is registered and not archived.
 * Anything stronger would be a claim the data does not support.
 */
const transferable = (status: string): boolean => status === 'REGISTERED';

export async function sellerEligibility(
  database: DbClient,
  accountId: string,
  animalId: string,
): Promise<SellerEligibility> {
  const blockers: EligibilityBlocker[] = [];

  const [animal] = await database
    .select({
      id: animals.id,
      ownerAccountId: animals.ownerAccountId,
      status: animals.status,
      species: animals.species,
    })
    .from(animals)
    .where(eq(animals.id, animalId))
    .limit(1);

  if (!animal) {
    return {
      allowed: false,
      sellerKind: null,
      kennelId: null,
      facts: NO_FACTS,
      blockers: [{ code: 'ANIMAL_NOT_FOUND', messageFa: 'این حیوان پیدا نشد.' }],
    };
  }

  const kyc = await findCase(database, accountId);
  const [chip] = await database
    .select({ id: microchips.id })
    .from(microchips)
    .where(eq(microchips.animalId, animalId))
    .limit(1);
  const [kennel] = await database
    .select({ id: kennels.id, status: kennels.status })
    .from(kennels)
    .where(and(eq(kennels.ownerAccountId, accountId), eq(kennels.status, 'APPROVED')))
    .limit(1);

  const facts: EligibilityFacts = {
    kycApproved: kyc?.status === 'APPROVED',
    // The membership rule lives in one place and is read, never restated.
    membershipValid: await hasValidMembership(database as Database, accountId),
    ownsAnimal: animal.ownerAccountId === accountId,
    animalRegistered: animal.status === 'REGISTERED',
    animalTransferable: transferable(animal.status),
    speciesOpen: await speciesEnabled(database, 'ANIMAL_SALE', animal.species),
    microchipRegistered: chip !== undefined,
    kennelApproved: kennel !== undefined,
  };

  if (!facts.ownsAnimal) {
    // Said the same way whether the animal belongs to somebody else or the
    // account simply may not see it, so one owner cannot probe for another's.
    blockers.push({ code: 'NOT_OWNER', messageFa: 'این حیوان در فهرست حیوان‌های شما نیست.' });
  }

  if (!facts.kycApproved) {
    blockers.push({
      code: 'KYC_REQUIRED',
      messageFa: 'برای ثبت آگهی فروش، احراز هویت تأییدشده لازم است.',
      href: '/account/kyc',
      ctaFa: 'تکمیل احراز هویت',
    });
  }

  if (!facts.animalRegistered) {
    blockers.push({
      code: 'ANIMAL_NOT_REGISTERED',
      messageFa: 'فقط حیوان ثبت‌شده در همزیست قابل آگهی است.',
      href: '/animals',
      ctaFa: 'حیوان‌های من',
    });
  } else if (!facts.animalTransferable) {
    blockers.push({ code: 'ANIMAL_NOT_TRANSFERABLE', messageFa: 'پرونده این حیوان قابل انتقال نیست.' });
  }

  if (!facts.speciesOpen) {
    blockers.push({
      code: 'SPECIES_CLOSED',
      messageFa: 'فروش این گونه هنوز در همزیست فعال نشده است؛ در عرضه اولیه فقط سگ فعال است.',
    });
  }

  if (!facts.microchipRegistered) {
    blockers.push({
      code: 'MICROCHIP_REQUIRED',
      messageFa: 'برای انتشار آگهی، میکروچیپ ثبت‌شده لازم است. شماره خوداظهاری کافی نیست.',
      href: '/requests',
      ctaFa: 'درخواست مراجعه دامپزشک',
    });
  }

  /*
   * The kennel is the stronger qualification, so it is tried first: an approved
   * kennel qualifies on its own and a lapsed membership does not close that
   * door. Only when there is no kennel does the ordinary owner path apply, and
   * that one does need a live membership.
   */
  let sellerKind: SellerKind | null = null;
  if (facts.kennelApproved) {
    sellerKind = 'KENNEL';
  } else if (facts.membershipValid) {
    sellerKind = 'OWNER';
  } else {
    blockers.push({
      code: 'MEMBERSHIP_REQUIRED',
      messageFa: 'برای ثبت آگهی به‌عنوان مالک، عضویت معتبر انجمن لازم است؛ یا از راه کنل تأییدشده اقدام کنید.',
      href: '/membership',
      ctaFa: 'وضعیت عضویت',
    });
  }

  return {
    allowed: blockers.length === 0 && sellerKind !== null,
    sellerKind,
    kennelId: sellerKind === 'KENNEL' ? (kennel?.id ?? null) : null,
    blockers,
    facts,
  };
}

/**
 * The animals this account could offer, with the reason for each one that it
 * cannot. The dashboard shows both lists rather than a silently short one.
 */
export interface SellableAnimal {
  readonly animalId: string;
  readonly name: string | null;
  readonly species: string;
  readonly eligibility: SellerEligibility;
}

export async function sellableAnimals(
  database: DbClient,
  accountId: string,
): Promise<readonly SellableAnimal[]> {
  const rows = await database
    .select({ id: animals.id, name: animals.name, species: animals.species })
    .from(animals)
    .where(and(eq(animals.ownerAccountId, accountId), eq(animals.status, 'REGISTERED')));

  const out: SellableAnimal[] = [];
  for (const row of rows) {
    out.push({
      animalId: row.id,
      name: row.name,
      species: row.species,
      eligibility: await sellerEligibility(database, accountId, row.id),
    });
  }
  return out;
}
