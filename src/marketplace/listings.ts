/**
 * The animal listing aggregate — PROMPT-003.
 *
 * Three rules shape everything here.
 *
 * One: identity is never copied. Date of birth, sex, breed, the identifiers and
 * the current owner are read from the animal record every time they are shown,
 * so a correction made through the process that owns them reaches the advert
 * immediately and a stale duplicate can never contradict it (§10).
 *
 * Two: eligibility is not a fact about the past. It is re-asked at publication
 * and at every edit that changes what a buyer decides on, because a membership
 * can lapse, a kennel can be suspended and an animal can change hands between
 * the draft and the advert.
 *
 * Three: nothing is ever overwritten silently. Every create, edit and state
 * change appends a revision, so «آگهی نوشته بود…» has an answer.
 */
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds, storedFiles } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { kennels } from '../db/schema/kennels.ts';
import { microchips } from '../db/schema/clinical.ts';
import { pedigrees } from '../db/schema/pedigree.ts';
import { parentageResults } from '../db/schema/genetics.ts';
import {
  animalListingDeliveries,
  animalListingMedia,
  animalListingRevisions,
  animalListings,
} from '../db/schema/marketplace.ts';
import { recordAudit } from '../audit/service.ts';
import { findFile, putPrivateFile, resolveWithinRoot } from '../files/storage.ts';
import { conflict, notConfigured, notFound, validation } from '../domain/errors.ts';
import { readInt, snapshotSetting } from '../settings/service.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability } from './model.ts';
import { assertFlagEnabled } from './flags.ts';
import { sellerEligibility, SELLER_KIND_FA, type SellerEligibility } from './listing-eligibility.ts';
import {
  canMove,
  handoverAge,
  isDeliveryMethod,
  isDisclosure,
  isEditable,
  isPriceMode,
  isPublic,
  LIVE_LISTING_STATUSES,
  publicationBlockers,
  type DeliveryMethod,
  type ListingMover,
  type ListingStatus,
} from './listing-model.ts';

export const MIN_PHOTOS_KEY = 'market.animal.min_listing_photos';
export const DURATION_KEY = 'market.animal.listing_duration_days';
export const MIN_AGE_KEY = 'market.animal.min_handover_age_days';
export const MAX_LISTINGS_OWNER_KEY = 'market.animal.max_active_listings_owner';
export const MAX_LISTINGS_KENNEL_KEY = 'market.animal.max_active_listings_kennel';

export type ListingRow = typeof animalListings.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a database error is this unique index being enforced.
 *
 * The driver's error is wrapped by the query builder, so the constraint name
 * lives on the cause rather than the message. Walked explicitly, because
 * matching the outer message silently stops working the day the wrapper's
 * wording changes — and a concurrency guard that stops working is exactly the
 * kind of failure nobody notices until two adverts exist for one animal.
 */
function violates(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    const candidate = current as { constraint?: string; message?: string; cause?: unknown };
    if (candidate.constraint === constraint) return true;
    if (typeof candidate.message === 'string' && candidate.message.includes(constraint)) return true;
    current = candidate.cause;
  }
  return false;
}

// ── revisions ──────────────────────────────────────────────────────────────

async function appendRevision(
  tx: DbClient,
  actor: Actor | null,
  listing: ListingRow,
  action: string,
  reasonFa: string | null,
): Promise<void> {
  const [last] = await tx
    .select({ number: animalListingRevisions.number })
    .from(animalListingRevisions)
    .where(eq(animalListingRevisions.listingId, listing.id))
    .orderBy(desc(animalListingRevisions.number))
    .limit(1);

  const deliveries = await tx
    .select({ method: animalListingDeliveries.method })
    .from(animalListingDeliveries)
    .where(eq(animalListingDeliveries.listingId, listing.id));
  const media = await tx
    .select({ id: animalListingMedia.id, kind: animalListingMedia.kind })
    .from(animalListingMedia)
    .where(eq(animalListingMedia.listingId, listing.id));

  await tx.insert(animalListingRevisions).values({
    listingId: listing.id,
    number: (last?.number ?? 0) + 1,
    action,
    reasonFa,
    createdByAccountId: actor?.accountId ?? null,
    snapshot: {
      status: listing.status,
      sellerKind: listing.sellerKind,
      priceMode: listing.priceMode,
      // Money as an exact decimal string: JSON has no bigint and the figure
      // must read back the same way it was written.
      priceToman: listing.priceToman === null ? null : listing.priceToman.toString(),
      descriptionFa: listing.descriptionFa,
      reasonForSaleFa: listing.reasonForSaleFa,
      provinceCode: listing.provinceCode,
      cityId: listing.cityId,
      vaccinationStatus: listing.vaccinationStatus,
      neuterStatus: listing.neuterStatus,
      healthNoteFa: listing.healthNoteFa,
      deliveryMethods: deliveries.map((d) => d.method).sort(),
      imageCount: media.filter((m) => m.kind === 'IMAGE').length,
      hasVideo: media.some((m) => m.kind === 'VIDEO'),
      version: listing.version,
    },
  });
}

// ── reads ──────────────────────────────────────────────────────────────────

/** Facts that belong to the animal record, read fresh every time (§10). */
export interface DerivedAnimalFacts {
  readonly animalId: string;
  readonly nameFa: string | null;
  readonly species: string;
  readonly breedFa: string | null;
  readonly sex: string | null;
  readonly birthDate: string | null;
  readonly birthDateApproximate: boolean;
  readonly petId: string | null;
  readonly pedigreeCode: string | null;
  readonly ownerAccountId: string;
  /** Whether a chip is registered — never the number itself, which is not public. */
  readonly microchipRegistered: boolean;
  readonly pedigreeIssued: boolean;
  readonly parentageFinal: boolean;
  readonly identityVerified: boolean;
}

export async function derivedAnimalFacts(database: DbClient, animalId: string): Promise<DerivedAnimalFacts> {
  const [row] = await database
    .select({
      id: animals.id,
      name: animals.name,
      species: animals.species,
      breedFa: referenceBreeds.nameFa,
      sex: animals.sex,
      birthDate: animals.birthDate,
      birthDateApproximate: animals.birthDateApproximate,
      petId: animals.petId,
      pedigreeCode: animals.pedigreeCode,
      ownerAccountId: animals.ownerAccountId,
      identityVerifiedAt: animals.identityVerifiedAt,
    })
    .from(animals)
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .where(eq(animals.id, animalId))
    .limit(1);
  if (!row) throw notFound('این حیوان پیدا نشد.');

  const [chip] = await database
    .select({ id: microchips.id })
    .from(microchips)
    .where(eq(microchips.animalId, animalId))
    .limit(1);
  const [pedigree] = await database
    .select({ id: pedigrees.id })
    .from(pedigrees)
    .where(eq(pedigrees.animalId, animalId))
    .limit(1);
  const [parentage] = await database
    .select({ id: parentageResults.id })
    .from(parentageResults)
    .where(and(eq(parentageResults.animalId, animalId), eq(parentageResults.status, 'FINAL')))
    .limit(1);

  return {
    animalId: row.id,
    nameFa: row.name,
    species: row.species,
    breedFa: row.breedFa,
    sex: row.sex,
    birthDate: row.birthDate,
    birthDateApproximate: row.birthDateApproximate,
    petId: row.petId,
    pedigreeCode: row.pedigreeCode,
    ownerAccountId: row.ownerAccountId,
    microchipRegistered: chip !== undefined,
    pedigreeIssued: pedigree !== undefined,
    parentageFinal: parentage !== undefined,
    identityVerified: row.identityVerifiedAt !== null,
  };
}

export interface ListingMediaView {
  readonly id: string;
  readonly fileId: string;
  readonly kind: 'IMAGE' | 'VIDEO';
  readonly altFa: string;
  readonly sortOrder: number;
}

export interface ListingDetail {
  readonly listing: ListingRow;
  readonly animal: DerivedAnimalFacts;
  readonly sellerKindFa: string;
  readonly kennelNameFa: string | null;
  readonly provinceFa: string | null;
  readonly cityFa: string | null;
  readonly deliveryMethods: readonly DeliveryMethod[];
  readonly media: readonly ListingMediaView[];
  readonly imageCount: number;
  /** Null until the animal has a date of birth; never guessed. */
  readonly handover: ReturnType<typeof handoverAge>;
  readonly blockers: readonly string[];
  readonly revisions: readonly { number: number; action: string; reasonFa: string | null; createdAt: Date }[];
}

async function loadListing(database: DbClient, listingId: string): Promise<ListingRow> {
  if (!UUID.test(listingId)) throw notFound('این آگهی پیدا نشد.');
  const [row] = await database.select().from(animalListings).where(eq(animalListings.id, listingId)).limit(1);
  if (!row) throw notFound('این آگهی پیدا نشد.');
  return row;
}

async function mediaOf(database: DbClient, listingId: string): Promise<ListingMediaView[]> {
  const rows = await database
    .select({
      id: animalListingMedia.id,
      fileId: animalListingMedia.fileId,
      kind: animalListingMedia.kind,
      altFa: animalListingMedia.altFa,
      sortOrder: animalListingMedia.sortOrder,
    })
    .from(animalListingMedia)
    .where(eq(animalListingMedia.listingId, listingId))
    .orderBy(asc(animalListingMedia.kind), asc(animalListingMedia.sortOrder), asc(animalListingMedia.createdAt));
  return rows as ListingMediaView[];
}

async function detailOf(database: DbClient, listing: ListingRow): Promise<ListingDetail> {
  const animal = await derivedAnimalFacts(database, listing.animalId);
  const media = await mediaOf(database, listing.id);
  const deliveries = await database
    .select({ method: animalListingDeliveries.method })
    .from(animalListingDeliveries)
    .where(eq(animalListingDeliveries.listingId, listing.id));
  const revisions = await database
    .select({
      number: animalListingRevisions.number,
      action: animalListingRevisions.action,
      reasonFa: animalListingRevisions.reasonFa,
      createdAt: animalListingRevisions.createdAt,
    })
    .from(animalListingRevisions)
    .where(eq(animalListingRevisions.listingId, listing.id))
    .orderBy(desc(animalListingRevisions.number));

  const [province] = listing.provinceCode
    ? await database
        .select({ nameFa: provinces.nameFa })
        .from(provinces)
        .where(eq(provinces.code, listing.provinceCode))
        .limit(1)
    : [];
  const [city] = listing.cityId
    ? await database.select({ nameFa: cities.nameFa }).from(cities).where(eq(cities.id, listing.cityId)).limit(1)
    : [];
  const [kennel] = listing.kennelId
    ? await database.select({ nameFa: kennels.nameFa }).from(kennels).where(eq(kennels.id, listing.kennelId)).limit(1)
    : [];

  const imageCount = media.filter((m) => m.kind === 'IMAGE').length;
  const minimumImages = await readInt(database, MIN_PHOTOS_KEY);
  const minimumAgeDays = await readInt(database, MIN_AGE_KEY);

  return {
    listing,
    animal,
    sellerKindFa: SELLER_KIND_FA[listing.sellerKind as 'OWNER' | 'KENNEL'],
    kennelNameFa: kennel?.nameFa ?? null,
    provinceFa: province?.nameFa ?? null,
    cityFa: city?.nameFa ?? null,
    deliveryMethods: deliveries.map((d) => d.method) as DeliveryMethod[],
    media,
    imageCount,
    handover: handoverAge(animal.birthDate, minimumAgeDays, new Date()),
    blockers: publicationBlockers(
      {
        priceMode: listing.priceMode,
        priceToman: listing.priceToman,
        descriptionFa: listing.descriptionFa,
        reasonForSaleFa: listing.reasonForSaleFa,
        provinceCode: listing.provinceCode,
        cityId: listing.cityId,
        vaccinationStatus: listing.vaccinationStatus,
        neuterStatus: listing.neuterStatus,
        deliveryMethods: deliveries.map((d) => d.method),
        imageCount,
      },
      minimumImages,
    ),
    revisions,
  };
}

/** One listing of this seller. A listing of somebody else answers "not found". */
export async function sellerListing(
  database: DbClient,
  actor: Actor,
  listingId: string,
): Promise<ListingDetail> {
  const listing = await loadListing(database, listingId);
  if (listing.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  return detailOf(database, listing);
}

export interface SellerListingRow {
  readonly id: string;
  readonly animalId: string;
  readonly status: ListingStatus;
  readonly animalNameFa: string | null;
  readonly priceMode: string | null;
  readonly priceToman: bigint | null;
  readonly publishedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly imageCount: number;
}

export async function sellerListings(database: DbClient, actor: Actor): Promise<readonly SellerListingRow[]> {
  const rows = await database
    .select({
      id: animalListings.id,
      animalId: animalListings.animalId,
      status: animalListings.status,
      animalNameFa: animals.name,
      priceMode: animalListings.priceMode,
      priceToman: animalListings.priceToman,
      publishedAt: animalListings.publishedAt,
      expiresAt: animalListings.expiresAt,
      imageCount: sql<number>`(
        select count(*) from animal_listing_media m
        where m.listing_id = ${animalListings.id} and m.kind = 'IMAGE'
      )`,
    })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(eq(animalListings.sellerAccountId, actor.accountId))
    .orderBy(desc(animalListings.updatedAt));
  return rows.map((row) => ({ ...row, imageCount: Number(row.imageCount) })) as SellerListingRow[];
}

// ── create ────────────────────────────────────────────────────────────────

async function assertUnderCap(
  database: DbClient,
  accountId: string,
  sellerKind: 'OWNER' | 'KENNEL',
): Promise<void> {
  /*
   * The cap is managed data and starts unset. An unset cap is not "zero" and it
   * is not "unlimited by decision" either: it is a limit nobody has chosen yet,
   * so nothing is enforced and the readiness report says the figure is missing.
   * Inventing a number here would be exactly the fabricated default the rules
   * forbid.
   */
  const key = sellerKind === 'KENNEL' ? MAX_LISTINGS_KENNEL_KEY : MAX_LISTINGS_OWNER_KEY;
  let cap: number;
  try {
    cap = await readInt(database, key);
  } catch {
    return;
  }
  const rows = await database
    .select({ id: animalListings.id })
    .from(animalListings)
    .where(
      and(
        eq(animalListings.sellerAccountId, accountId),
        inArray(animalListings.status, [...LIVE_LISTING_STATUSES]),
      ),
    );
  if (rows.length >= cap) {
    throw conflict('به سقف آگهی فعال هم‌زمان (' + cap.toLocaleString('fa-IR') + ') رسیده‌اید.');
  }
}

export async function createListing(
  database: Database,
  actor: Actor,
  input: { animalId: string },
): Promise<ListingRow> {
  await assertFlagEnabled(database, 'market.flag.animal_market_enabled');
  await assertFlagEnabled(database, 'market.flag.animal_listing_creation_enabled');

  const eligibility = await sellerEligibility(database, actor.accountId, input.animalId);
  if (!eligibility.allowed || eligibility.sellerKind === null) {
    throw validation(eligibility.blockers[0]?.messageFa ?? 'ثبت آگهی برای این حیوان ممکن نیست.');
  }
  await assertUnderCap(database, actor.accountId, eligibility.sellerKind);

  return database.transaction(async (tx) => {
    let created: ListingRow;
    try {
      const [row] = await tx
        .insert(animalListings)
        .values({
          animalId: input.animalId,
          sellerAccountId: actor.accountId,
          sellerKind: eligibility.sellerKind!,
          kennelId: eligibility.kennelId,
          status: 'DRAFT',
          statusChangedAt: new Date(),
          statusChangedByAccountId: actor.accountId,
        })
        .returning();
      created = row!;
    } catch (error) {
      // The partial unique index is the real guard against two people — or two
      // tabs — starting an advert for the same animal at the same moment.
      if (violates(error, 'animal_listing_live_key')) {
        throw conflict('برای این حیوان همین حالا یک آگهی فعال وجود دارد.');
      }
      throw error;
    }

    await appendRevision(tx, actor, created, 'CREATED', null);
    await recordAudit(tx, actor, {
      action: 'ANIMAL_LISTING_CREATED',
      targetType: 'ANIMAL_LISTING',
      targetId: created.id,
      targetVersion: created.version,
      after: { animalId: created.animalId, sellerKind: created.sellerKind },
    });
    return created;
  });
}

// ── edit ──────────────────────────────────────────────────────────────────

export interface ListingContentInput {
  readonly listingId: string;
  readonly expectedVersion: number;
  readonly priceMode: string;
  readonly priceToman: string;
  readonly descriptionFa: string;
  readonly reasonForSaleFa: string;
  readonly provinceCode: string;
  readonly cityId: string;
  readonly vaccinationStatus: string;
  readonly neuterStatus: string;
  readonly healthNoteFa: string;
  readonly deliveryMethods: readonly string[];
}

function parsePrice(mode: string, raw: string): bigint | null {
  if (mode !== 'EXACT') return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) throw validation('مبلغ را فقط با رقم و بدون جداکننده وارد کنید.');
  const value = BigInt(trimmed);
  if (value <= 0n) throw validation('مبلغ باید بزرگ‌تر از صفر باشد.');
  return value;
}

export async function saveListing(
  database: Database,
  actor: Actor,
  input: ListingContentInput,
): Promise<ListingRow> {
  const current = await loadListing(database, input.listingId);
  if (current.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  if (!isEditable(current.status as ListingStatus)) {
    throw conflict('آگهی در وضعیت «' + current.status + '» قابل ویرایش نیست.');
  }

  /*
   * A published advert is what a buyer is reading right now, so editing one is
   * a sensitive edit: the whole eligibility question is asked again before the
   * new text replaces the old. A draft is private and needs no such check.
   */
  if (isPublic(current.status as ListingStatus)) {
    const again = await sellerEligibility(database, actor.accountId, current.animalId);
    if (!again.allowed) {
      throw conflict(
        'شرایط فروش این حیوان دیگر برقرار نیست: ' + (again.blockers[0]?.messageFa ?? 'شرایط تغییر کرده است.'),
      );
    }
  }

  const priceMode = input.priceMode;
  if (!isPriceMode(priceMode)) throw validation('نوع قیمت معتبر نیست.');
  const vaccinationStatus = input.vaccinationStatus;
  if (!isDisclosure(vaccinationStatus)) throw validation('وضعیت واکسیناسیون را مشخص کنید.');
  const neuterStatus = input.neuterStatus;
  if (!isDisclosure(neuterStatus)) throw validation('وضعیت عقیم‌سازی را مشخص کنید.');
  const methods = [...new Set(input.deliveryMethods)].filter(isDeliveryMethod);
  if (methods.length !== new Set(input.deliveryMethods).size) throw validation('روش تحویل معتبر نیست.');

  const description = input.descriptionFa.trim();
  if (description.length > 4000) throw validation('توضیح آگهی بیش از حد طولانی است.');
  const reason = input.reasonForSaleFa.trim();
  if (reason.length > 500) throw validation('دلیل فروش بیش از حد طولانی است.');
  const healthNote = input.healthNoteFa.trim();
  if (healthNote.length > 2000) throw validation('یادداشت سلامت بیش از حد طولانی است.');

  const price = parsePrice(priceMode, input.priceToman);

  if (input.cityId !== '') {
    const [city] = await database
      .select({ id: cities.id, provinceCode: cities.provinceCode })
      .from(cities)
      .where(eq(cities.id, input.cityId))
      .limit(1);
    if (!city) throw validation('شهر انتخاب‌شده معتبر نیست.');
    if (city.provinceCode !== input.provinceCode) throw validation('شهر با استان انتخاب‌شده هم‌خوان نیست.');
  }

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animalListings)
      .set({
        priceMode,
        priceToman: price,
        descriptionFa: description === '' ? null : description,
        reasonForSaleFa: reason === '' ? null : reason,
        provinceCode: input.provinceCode === '' ? null : input.provinceCode,
        cityId: input.cityId === '' ? null : input.cityId,
        vaccinationStatus,
        neuterStatus,
        healthNoteFa: healthNote === '' ? null : healthNote,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(animalListings.id, current.id), eq(animalListings.version, input.expectedVersion)))
      .returning();
    if (!updated) throw conflict('این آگهی در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await tx.delete(animalListingDeliveries).where(eq(animalListingDeliveries.listingId, current.id));
    if (methods.length > 0) {
      await tx
        .insert(animalListingDeliveries)
        .values(methods.map((method) => ({ listingId: current.id, method })));
    }

    await appendRevision(tx, actor, updated, 'EDITED', null);
    await recordAudit(tx, actor, {
      action: 'ANIMAL_LISTING_EDITED',
      targetType: 'ANIMAL_LISTING',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { priceMode: current.priceMode, status: current.status },
      after: { priceMode: updated.priceMode, status: updated.status },
    });
    return updated;
  });
}

// ── media ─────────────────────────────────────────────────────────────────

export interface AttachMediaInput {
  readonly listingId: string;
  readonly kind: 'IMAGE' | 'VIDEO';
  readonly bytes: Uint8Array;
  readonly originalName: string | null;
  readonly altFa: string;
}

export async function attachListingMedia(
  database: Database,
  storageRoot: string,
  actor: Actor,
  input: AttachMediaInput,
): Promise<{ mediaId: string; fileId: string }> {
  const altFa = input.altFa.trim();
  if (altFa === '') throw validation('متن جایگزین را بنویسید؛ برای کسی که تصویر را نمی‌بیند لازم است.');

  const listing = await loadListing(database, input.listingId);
  if (listing.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  if (!isEditable(listing.status as ListingStatus)) throw conflict('رسانه این آگهی قابل تغییر نیست.');

  const purpose = input.kind === 'VIDEO' ? 'ANIMAL_LISTING_VIDEO' : 'ANIMAL_LISTING_IMAGE';

  return database.transaction(async (tx) => {
    const stored = await putPrivateFile(tx, storageRoot, actor, {
      ownerAccountId: actor.accountId,
      purpose,
      bytes: input.bytes,
      originalName: input.originalName,
    });

    const [last] = await tx
      .select({ sortOrder: animalListingMedia.sortOrder })
      .from(animalListingMedia)
      .where(and(eq(animalListingMedia.listingId, listing.id), eq(animalListingMedia.kind, input.kind)))
      .orderBy(desc(animalListingMedia.sortOrder))
      .limit(1);

    let mediaId: string;
    try {
      const [row] = await tx
        .insert(animalListingMedia)
        .values({
          listingId: listing.id,
          fileId: stored.id,
          kind: input.kind,
          altFa,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        })
        .returning({ id: animalListingMedia.id });
      mediaId = row!.id;
    } catch (error) {
      if (violates(error, 'animal_listing_single_video_key')) {
        throw conflict('هر آگهی فقط یک ویدئو می‌پذیرد؛ ابتدا ویدئوی قبلی را حذف کنید.');
      }
      throw error;
    }

    await recordAudit(tx, actor, {
      action: 'ANIMAL_LISTING_MEDIA_ATTACHED',
      targetType: 'ANIMAL_LISTING',
      targetId: listing.id,
      after: { kind: input.kind, mime: stored.mime, sizeBytes: stored.sizeBytes },
    });
    return { mediaId, fileId: stored.id };
  });
}

export async function removeListingMedia(
  database: Database,
  actor: Actor,
  input: { listingId: string; mediaId: string },
): Promise<void> {
  const listing = await loadListing(database, input.listingId);
  if (listing.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  if (!isEditable(listing.status as ListingStatus)) throw conflict('رسانه این آگهی قابل تغییر نیست.');

  await database.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: animalListingMedia.id, kind: animalListingMedia.kind })
      .from(animalListingMedia)
      .where(and(eq(animalListingMedia.id, input.mediaId), eq(animalListingMedia.listingId, listing.id)))
      .limit(1);
    if (!row) throw notFound('این رسانه پیدا نشد.');

    /*
     * A published advert must keep meeting the minimum, so the picture that
     * would take it below the line cannot be removed while it is public. The
     * seller pauses it first, which is an honest state, rather than the advert
     * quietly becoming non-compliant.
     */
    if (isPublic(listing.status as ListingStatus) && row.kind === 'IMAGE') {
      const remaining = await tx
        .select({ id: animalListingMedia.id })
        .from(animalListingMedia)
        .where(and(eq(animalListingMedia.listingId, listing.id), eq(animalListingMedia.kind, 'IMAGE')));
      const minimum = await readInt(tx, MIN_PHOTOS_KEY);
      if (remaining.length - 1 < minimum) {
        throw conflict(
          'آگهی منتشرشده باید حداقل ' +
            minimum.toLocaleString('fa-IR') +
            ' تصویر داشته باشد؛ ابتدا آگهی را متوقف کنید.',
        );
      }
    }

    await tx.delete(animalListingMedia).where(eq(animalListingMedia.id, row.id));
    await recordAudit(tx, actor, {
      action: 'ANIMAL_LISTING_MEDIA_REMOVED',
      targetType: 'ANIMAL_LISTING',
      targetId: listing.id,
      before: { mediaId: row.id, kind: row.kind },
    });
  });
}

/**
 * The bytes behind a listing media address, or null.
 *
 * Null covers every reason equally — malformed id, not listing media, listing
 * no longer public — so a visitor cannot tell a paused advert from one that
 * never existed. This is the same rule DEC-0160 set for content images.
 */
export async function publicListingMedia(
  database: DbClient,
  storageRoot: string,
  fileId: string,
): Promise<{ mime: string; bytes: Buffer; sha256: string } | null> {
  if (!UUID.test(fileId)) return null;
  const [file] = await database
    .select({ purpose: storedFiles.purpose })
    .from(storedFiles)
    .where(eq(storedFiles.id, fileId))
    .limit(1);
  if (!file) return null;
  if (file.purpose !== 'ANIMAL_LISTING_IMAGE' && file.purpose !== 'ANIMAL_LISTING_VIDEO') return null;

  const [shown] = await database
    .select({ id: animalListings.id })
    .from(animalListingMedia)
    .innerJoin(animalListings, eq(animalListings.id, animalListingMedia.listingId))
    .where(
      and(
        eq(animalListingMedia.fileId, fileId),
        inArray(animalListings.status, ['PUBLISHED', 'RESERVED']),
      ),
    )
    .limit(1);
  if (!shown) return null;

  const record = await findFile(database, fileId);
  const bytes = await fs.readFile(resolveWithinRoot(storageRoot, record.storageKey));
  return { mime: record.mime, bytes, sha256: record.sha256 };
}

// ── publication and lifecycle ─────────────────────────────────────────────

export async function publishListing(
  database: Database,
  actor: Actor,
  input: { listingId: string; expectedVersion: number },
): Promise<ListingRow> {
  await assertFlagEnabled(database, 'market.flag.animal_market_enabled');

  const listing = await loadListing(database, input.listingId);
  if (listing.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  if (!canMove(listing.status as ListingStatus, 'PUBLISHED', 'SELLER')) {
    throw conflict('آگهی از وضعیت «' + listing.status + '» منتشر نمی‌شود.');
  }

  // Asked again, at the moment it matters: a membership may have lapsed, a
  // kennel been suspended or the animal changed hands since the draft.
  const eligibility = await sellerEligibility(database, actor.accountId, listing.animalId);
  if (!eligibility.allowed || eligibility.sellerKind === null) {
    throw conflict(eligibility.blockers[0]?.messageFa ?? 'شرایط انتشار این آگهی برقرار نیست.');
  }

  const detail = await detailOf(database, listing);
  if (detail.blockers.length > 0) throw validation(detail.blockers[0]!);

  // A listing without an end date is a listing nobody ever revisits, so the
  // duration has to be a real managed value before anything is published.
  const duration = await snapshotSetting(database, DURATION_KEY).catch(() => {
    throw notConfigured(DURATION_KEY);
  });
  const days = Number(duration.value);
  if (!Number.isInteger(days) || days <= 0) throw notConfigured(DURATION_KEY);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animalListings)
      .set({
        status: 'PUBLISHED',
        // The kind is re-decided here, so an account that became a kennel
        // between the draft and the advert is described correctly.
        sellerKind: eligibility.sellerKind!,
        kennelId: eligibility.kennelId,
        publishedAt: now,
        expiresAt,
        durationDays: days,
        durationSettingVersion: duration.version,
        statusReasonFa: null,
        statusChangedAt: now,
        statusChangedByAccountId: actor.accountId,
        version: listing.version + 1,
        updatedAt: now,
      })
      .where(and(eq(animalListings.id, listing.id), eq(animalListings.version, input.expectedVersion)))
      .returning();
    if (!updated) throw conflict('این آگهی در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await appendRevision(tx, actor, updated, 'PUBLISHED', null);
    await recordAudit(tx, actor, {
      action: 'ANIMAL_LISTING_PUBLISHED',
      targetType: 'ANIMAL_LISTING',
      targetId: updated.id,
      targetVersion: updated.version,
      after: {
        sellerKind: updated.sellerKind,
        durationDays: days,
        durationSettingVersion: duration.version,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return updated;
  });
}

/** Seller-driven moves: pause, resume, remove and republish an expired advert. */
export async function moveListing(
  database: Database,
  actor: Actor,
  input: { listingId: string; to: ListingStatus; reasonFa?: string; expectedVersion: number },
): Promise<ListingRow> {
  const listing = await loadListing(database, input.listingId);
  if (listing.sellerAccountId !== actor.accountId) throw notFound('این آگهی پیدا نشد.');
  if (input.to === 'PUBLISHED') return publishListing(database, actor, input);
  if (!canMove(listing.status as ListingStatus, input.to, 'SELLER')) {
    throw conflict('این تغییر وضعیت مجاز نیست.');
  }
  return applyMove(database, actor, listing, input.to, input.reasonFa ?? null, input.expectedVersion, 'SELLER');
}

/** A moderator's hold or release. The capability, not the shell, is what decides (§21.4). */
export async function moderateListing(
  database: Database,
  actor: Actor,
  input: { listingId: string; to: ListingStatus; reasonFa: string; expectedVersion: number },
): Promise<ListingRow> {
  assertMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل این تصمیم را بنویسید؛ برای فروشنده و در تاریخچه ثبت می‌شود.');
  const listing = await loadListing(database, input.listingId);
  if (!canMove(listing.status as ListingStatus, input.to, 'MODERATOR')) {
    throw conflict('این تغییر وضعیت مجاز نیست.');
  }
  return applyMove(database, actor, listing, input.to, reasonFa, input.expectedVersion, 'MODERATOR');
}

async function applyMove(
  database: Database,
  actor: Actor,
  listing: ListingRow,
  to: ListingStatus,
  reasonFa: string | null,
  expectedVersion: number,
  mover: ListingMover,
): Promise<ListingRow> {
  const now = new Date();
  return database.transaction(async (tx) => {
    const [updated] = await tx
      .update(animalListings)
      .set({
        status: to,
        statusReasonFa: reasonFa,
        statusChangedAt: now,
        statusChangedByAccountId: actor.accountId,
        version: listing.version + 1,
        updatedAt: now,
      })
      .where(and(eq(animalListings.id, listing.id), eq(animalListings.version, expectedVersion)))
      .returning();
    if (!updated) throw conflict('این آگهی در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');

    await appendRevision(tx, actor, updated, 'STATUS_' + to, reasonFa);
    await recordAudit(tx, actor, {
      action: 'ANIMAL_LISTING_STATUS_CHANGED',
      targetType: 'ANIMAL_LISTING',
      targetId: updated.id,
      targetVersion: updated.version,
      before: { status: listing.status },
      after: { status: to, mover },
      reason: reasonFa,
    });
    return updated;
  });
}

/**
 * Expire the adverts whose date has passed.
 *
 * Called by an operator or a scheduler; nothing in the product runs it by
 * itself, and that limitation is reported rather than hidden behind a page
 * load that happens to be frequent enough.
 */
export async function expireDueListings(database: Database, now: Date = new Date()): Promise<number> {
  const due = await database
    .select()
    .from(animalListings)
    .where(
      and(
        inArray(animalListings.status, ['PUBLISHED', 'PAUSED']),
        lte(animalListings.expiresAt, now),
      ),
    );

  let expired = 0;
  for (const listing of due) {
    await database.transaction(async (tx) => {
      const [updated] = await tx
        .update(animalListings)
        .set({
          status: 'EXPIRED',
          statusReasonFa: 'مهلت انتشار آگهی به پایان رسید.',
          statusChangedAt: now,
          statusChangedByAccountId: null,
          version: listing.version + 1,
          updatedAt: now,
        })
        .where(and(eq(animalListings.id, listing.id), eq(animalListings.version, listing.version)))
        .returning();
      if (!updated) return;
      await appendRevision(tx, null, updated, 'STATUS_EXPIRED', updated.statusReasonFa);
      await recordAudit(tx, null, {
        action: 'ANIMAL_LISTING_STATUS_CHANGED',
        targetType: 'ANIMAL_LISTING',
        targetId: updated.id,
        targetVersion: updated.version,
        before: { status: listing.status },
        after: { status: 'EXPIRED', mover: 'SYSTEM' },
      });
      expired += 1;
    });
  }
  return expired;
}

/** Re-exported so screens ask the same question the service does. */
export { sellerEligibility };
export type { SellerEligibility };

/** Guard used by the pages that must not be reachable when the market is shut. */
export async function assertMarketOpen(database: DbClient): Promise<void> {
  await assertFlagEnabled(database, 'market.flag.animal_market_enabled');
}
