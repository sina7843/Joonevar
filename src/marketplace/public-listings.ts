/**
 * What the public may see of the animal marketplace — PROMPT-004.
 *
 * The visibility rule lives here once and is used by the list, the detail page,
 * the sitemap and the media route. Four things hide an advert, and a visitor
 * cannot tell them apart:
 *
 *  - its own status is not PUBLISHED or RESERVED;
 *  - the market's kill switch is closed;
 *  - the species is no longer open for animal sale;
 *  - the seller is under an active publisher restriction.
 *
 * The last one is what «suspended seller» means in practice: the account keeps
 * its adverts and its history, and none of them is served while the restriction
 * is in force.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { kennels } from '../db/schema/kennels.ts';
import { publisherRestrictions } from '../db/schema/moderation.ts';
import {
  animalListingDeliveries,
  animalListingMedia,
  animalListings,
  marketplaceSpecies,
} from '../db/schema/marketplace.ts';
import { pageOf, type Page } from '../domain/pagination.ts';
import { notFound } from '../domain/errors.ts';
import { flagEnabled } from './flags.ts';
import { livePromotedListingIds } from './promotions.ts';
import { derivedAnimalFacts, type DerivedAnimalFacts } from './listings.ts';
import {
  DELIVERY_METHOD_FA,
  handoverAge,
  NEUTER_FA,
  PRICE_MODE_FA,
  VACCINATION_FA,
  type DeliveryMethod,
  type Disclosure,
} from './listing-model.ts';
import { placePromoted, type ListingFilter } from './discovery-model.ts';
import { readInt } from '../settings/service.ts';
import { MIN_AGE_KEY } from './listings.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Statuses a visitor may reach. A reserved advert stays readable; it is no longer available. */
export const PUBLIC_STATUSES = ['PUBLISHED', 'RESERVED'] as const;

/**
 * The one visibility condition, as SQL.
 *
 * Written as a single expression rather than as a filter applied afterwards, so
 * a caller that forgets to filter gets no rows instead of too many.
 */
export function publicListingCondition(now: Date): SQL {
  return and(
    inArray(animalListings.status, [...PUBLIC_STATUSES]),
    // The species has to be open for animal sale right now, not when the
    // advert was published.
    sql`exists (
      select 1 from marketplace_species ms
      where ms.market = 'ANIMAL_SALE' and ms.species_code = ${animals.species} and ms.enabled
    )`,
    // No publisher restriction in force for the seller.
    sql`not exists (
      select 1 from publisher_restriction pr
      where pr.account_id = ${animalListings.sellerAccountId}
        and pr.lifted_at is null
        and pr.starts_at <= ${now}
        and (pr.ends_at is null or pr.ends_at > ${now})
    )`,
  )!;
}

export interface PublicListingCard {
  readonly id: string;
  readonly path: string;
  readonly titleFa: string;
  readonly breedFa: string | null;
  readonly sex: string | null;
  readonly birthDate: string | null;
  readonly priceMode: string | null;
  readonly priceToman: bigint | null;
  readonly placeFa: string | null;
  readonly sellerKind: string;
  readonly pedigreeIssued: boolean;
  readonly parentageFinal: boolean;
  readonly coverFileId: string | null;
  readonly coverAltFa: string | null;
  readonly publishedAt: Date | null;
  readonly reserved: boolean;
  /** Placement only. Nothing in the product reads this as a quality signal. */
  readonly promoted: boolean;
}

export interface PublicListingPage extends Page<PublicListingCard> {
  readonly marketOpen: boolean;
}

const EMPTY_PAGE = (filter: ListingFilter, marketOpen: boolean): PublicListingPage => ({
  ...pageOf<PublicListingCard>([], 0, { page: filter.page, pageSize: filter.pageSize }),
  marketOpen,
});

/** Age in whole months, computed in SQL so it can be filtered rather than fetched. */
const ageMonths = sql<number>`
  extract(year from age(now(), ${animals.birthDate}))::int * 12
  + extract(month from age(now(), ${animals.birthDate}))::int
`;

function filterConditions(filter: ListingFilter): SQL[] {
  const conditions: SQL[] = [];

  if (filter.species) conditions.push(eq(animals.species, filter.species));
  if (filter.breedId) conditions.push(eq(animals.breedId, filter.breedId));
  if (filter.provinceCode) conditions.push(eq(animalListings.provinceCode, filter.provinceCode));
  if (filter.cityId) conditions.push(eq(animalListings.cityId, filter.cityId));
  if (filter.priceMode) conditions.push(eq(animalListings.priceMode, filter.priceMode));
  // A price bound only ever selects adverts that have a price at all: a
  // negotiable advert is not "cheap", it is unpriced.
  if (filter.minPriceToman !== null) conditions.push(gte(animalListings.priceToman, filter.minPriceToman));
  if (filter.maxPriceToman !== null) conditions.push(lte(animalListings.priceToman, filter.maxPriceToman));
  if (filter.sex) conditions.push(eq(animals.sex, filter.sex));
  if (filter.minAgeMonths !== null) conditions.push(sql`${ageMonths} >= ${filter.minAgeMonths}`);
  if (filter.maxAgeMonths !== null) conditions.push(sql`${ageMonths} <= ${filter.maxAgeMonths}`);
  if (filter.sellerKind) conditions.push(eq(animalListings.sellerKind, filter.sellerKind));
  if (filter.vaccination) conditions.push(eq(animalListings.vaccinationStatus, filter.vaccination));
  if (filter.neuter) conditions.push(eq(animalListings.neuterStatus, filter.neuter));

  if (filter.pedigree !== null) {
    const has = sql`exists (select 1 from pedigree p where p.animal_id = ${animals.id})`;
    conditions.push(filter.pedigree ? has : sql`not ${has}`);
  }
  if (filter.parentage !== null) {
    const has = sql`exists (
      select 1 from parentage_result r where r.animal_id = ${animals.id} and r.status = 'FINAL'
    )`;
    conditions.push(filter.parentage ? has : sql`not ${has}`);
  }
  if (filter.delivery) {
    conditions.push(sql`exists (
      select 1 from animal_listing_delivery d
      where d.listing_id = ${animalListings.id} and d.method = ${filter.delivery}
    )`);
  }
  if (filter.term) {
    // Bound as a parameter. The term never reaches SQL as text, and the wildcard
    // characters are escaped so a search for "%" is a search for a per cent sign.
    const needle = '%' + filter.term.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    conditions.push(sql`(
      coalesce(${animals.name}, '') ilike ${needle} escape '\\'
      or coalesce(${animalListings.descriptionFa}, '') ilike ${needle} escape '\\'
      or coalesce(${referenceBreeds.nameFa}, '') ilike ${needle} escape '\\'
    )`);
  }

  return conditions;
}

function orderFor(sort: ListingFilter['sort']): SQL[] {
  switch (sort) {
    case 'PRICE_ASC':
      // Nulls last in both directions: an unpriced advert is not the cheapest
      // and not the dearest. The id is the tie-break that makes paging stable.
      return [sql`${animalListings.priceToman} asc nulls last`, asc(animalListings.id)];
    case 'PRICE_DESC':
      return [sql`${animalListings.priceToman} desc nulls last`, asc(animalListings.id)];
    case 'NEWEST':
    default:
      return [desc(animalListings.publishedAt), asc(animalListings.id)];
  }
}

/**
 * One page of the public marketplace.
 *
 * Paging is stable because every order ends with the id: two adverts published
 * in the same second cannot swap places between page one and page two and make
 * one of them invisible.
 */
export async function publicListings(
  database: DbClient,
  filter: ListingFilter,
  now: Date = new Date(),
): Promise<PublicListingPage> {
  const marketOpen = await flagEnabled(database, 'market.flag.animal_market_enabled');
  if (!marketOpen) return EMPTY_PAGE(filter, false);

  const where = and(publicListingCondition(now), ...filterConditions(filter))!;

  const [counted] = await database
    .select({ total: sql<string>`count(*)` })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .where(where);
  const total = Number(counted?.total ?? 0);
  if (total === 0) return EMPTY_PAGE(filter, true);

  const rows = await database
    .select({
      id: animalListings.id,
      status: animalListings.status,
      nameFa: animals.name,
      breedFa: referenceBreeds.nameFa,
      sex: animals.sex,
      birthDate: animals.birthDate,
      priceMode: animalListings.priceMode,
      priceToman: animalListings.priceToman,
      provinceFa: provinces.nameFa,
      cityFa: cities.nameFa,
      sellerKind: animalListings.sellerKind,
      publishedAt: animalListings.publishedAt,
      pedigreeIssued: sql<boolean>`exists (select 1 from pedigree p where p.animal_id = ${animals.id})`,
      parentageFinal: sql<boolean>`exists (
        select 1 from parentage_result r where r.animal_id = ${animals.id} and r.status = 'FINAL'
      )`,
      coverFileId: sql<string | null>`(
        select m.file_id from animal_listing_media m
        where m.listing_id = ${animalListings.id} and m.kind = 'IMAGE'
        order by m.sort_order asc, m.created_at asc limit 1
      )`,
      coverAltFa: sql<string | null>`(
        select m.alt_fa from animal_listing_media m
        where m.listing_id = ${animalListings.id} and m.kind = 'IMAGE'
        order by m.sort_order asc, m.created_at asc limit 1
      )`,
    })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
    .leftJoin(provinces, eq(provinces.code, animalListings.provinceCode))
    .leftJoin(cities, eq(cities.id, animalListings.cityId))
    .where(where)
    .orderBy(...orderFor(filter.sort))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize);

  const promoted = await livePromotedListingIds(
    database,
    rows.map((row) => row.id),
    now,
  );

  const cards: PublicListingCard[] = rows.map((row) => ({
    id: row.id,
    path: '/animals-market/' + row.id,
    titleFa: row.nameFa ?? 'بدون نام',
    breedFa: row.breedFa,
    sex: row.sex,
    birthDate: row.birthDate,
    priceMode: row.priceMode,
    priceToman: row.priceToman,
    placeFa: [row.provinceFa, row.cityFa].filter(Boolean).join('، ') || null,
    sellerKind: row.sellerKind,
    pedigreeIssued: row.pedigreeIssued,
    parentageFinal: row.parentageFinal,
    coverFileId: row.coverFileId,
    coverAltFa: row.coverAltFa,
    publishedAt: row.publishedAt,
    reserved: row.status === 'RESERVED',
    promoted: promoted.has(row.id),
  }));

  return {
    ...pageOf(placePromoted(cards), total, { page: filter.page, pageSize: filter.pageSize }),
    marketOpen: true,
  };
}

export interface PublicListingDetail {
  readonly id: string;
  readonly path: string;
  readonly titleFa: string;
  readonly descriptionFa: string | null;
  readonly reasonForSaleFa: string | null;
  readonly healthNoteFa: string | null;
  readonly priceMode: string | null;
  readonly priceModeFa: string | null;
  readonly priceToman: bigint | null;
  readonly placeFa: string | null;
  readonly sellerKind: string;
  readonly kennelNameFa: string | null;
  readonly vaccinationFa: string | null;
  readonly neuterFa: string | null;
  readonly deliveryFa: readonly string[];
  readonly deliveryMethods: readonly DeliveryMethod[];
  readonly mediaFileIds: readonly { id: string; fileId: string; altFa: string; kind: 'IMAGE' | 'VIDEO' }[];
  readonly animal: DerivedAnimalFacts;
  readonly reserved: boolean;
  readonly promoted: boolean;
  readonly publishedAt: Date | null;
  readonly handoverFromFa: string | null;
  readonly listingRevision: number;
}

/**
 * One advert, or null.
 *
 * Null for every reason equally — not a UUID, not published, species closed,
 * seller restricted, market shut — so a visitor cannot use this page to learn
 * that an advert exists but is hidden.
 */
export async function publicListing(
  database: DbClient,
  id: string,
  now: Date = new Date(),
): Promise<PublicListingDetail | null> {
  if (!UUID.test(id)) return null;
  if (!(await flagEnabled(database, 'market.flag.animal_market_enabled'))) return null;

  const [row] = await database
    .select({
      id: animalListings.id,
      animalId: animalListings.animalId,
      status: animalListings.status,
      version: animalListings.version,
      descriptionFa: animalListings.descriptionFa,
      reasonForSaleFa: animalListings.reasonForSaleFa,
      healthNoteFa: animalListings.healthNoteFa,
      priceMode: animalListings.priceMode,
      priceToman: animalListings.priceToman,
      vaccinationStatus: animalListings.vaccinationStatus,
      neuterStatus: animalListings.neuterStatus,
      sellerKind: animalListings.sellerKind,
      kennelNameFa: kennels.nameFa,
      provinceFa: provinces.nameFa,
      cityFa: cities.nameFa,
      publishedAt: animalListings.publishedAt,
      nameFa: animals.name,
    })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .leftJoin(kennels, eq(kennels.id, animalListings.kennelId))
    .leftJoin(provinces, eq(provinces.code, animalListings.provinceCode))
    .leftJoin(cities, eq(cities.id, animalListings.cityId))
    .where(and(eq(animalListings.id, id), publicListingCondition(now)))
    .limit(1);
  if (!row) return null;

  const facts = await derivedAnimalFacts(database, row.animalId);
  const media = await database
    .select({
      id: animalListingMedia.id,
      fileId: animalListingMedia.fileId,
      altFa: animalListingMedia.altFa,
      kind: animalListingMedia.kind,
    })
    .from(animalListingMedia)
    .where(eq(animalListingMedia.listingId, row.id))
    .orderBy(asc(animalListingMedia.kind), asc(animalListingMedia.sortOrder), asc(animalListingMedia.createdAt));
  const deliveries = await database
    .select({ method: animalListingDeliveries.method })
    .from(animalListingDeliveries)
    .where(eq(animalListingDeliveries.listingId, row.id));

  const promoted = await livePromotedListingIds(database, [row.id], now);
  const minAgeDays = await readInt(database, MIN_AGE_KEY);
  const handover = handoverAge(facts.birthDate, minAgeDays, now);

  return {
    id: row.id,
    path: '/animals-market/' + row.id,
    titleFa: row.nameFa ?? 'بدون نام',
    descriptionFa: row.descriptionFa,
    reasonForSaleFa: row.reasonForSaleFa,
    healthNoteFa: row.healthNoteFa,
    priceMode: row.priceMode,
    priceModeFa: row.priceMode ? PRICE_MODE_FA[row.priceMode as 'EXACT' | 'NEGOTIABLE'] : null,
    priceToman: row.priceToman,
    placeFa: [row.provinceFa, row.cityFa].filter(Boolean).join('، ') || null,
    sellerKind: row.sellerKind,
    kennelNameFa: row.kennelNameFa,
    vaccinationFa: row.vaccinationStatus ? VACCINATION_FA[row.vaccinationStatus as Disclosure] : null,
    neuterFa: row.neuterStatus ? NEUTER_FA[row.neuterStatus as Disclosure] : null,
    deliveryFa: deliveries.map((d) => DELIVERY_METHOD_FA[d.method as DeliveryMethod]),
    deliveryMethods: deliveries.map((d) => d.method) as DeliveryMethod[],
    mediaFileIds: media as { id: string; fileId: string; altFa: string; kind: 'IMAGE' | 'VIDEO' }[],
    animal: facts,
    reserved: row.status === 'RESERVED',
    promoted: promoted.has(row.id),
    publishedAt: row.publishedAt,
    handoverFromFa:
      handover.from === null
        ? null
        : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(handover.from),
    listingRevision: row.version,
  };
}

/**
 * The adverts a search engine is told about.
 *
 * Only `PUBLISHED`. A reserved advert stays readable for whoever holds its link
 * but is not something to send new people to, and no filtered permutation of
 * the index is listed — those all point their canonical at the plain index.
 */
export async function listingSitemapEntries(
  database: DbClient,
  now: Date = new Date(),
): Promise<readonly { path: string; lastModified?: Date }[]> {
  if (!(await flagEnabled(database, 'market.flag.animal_market_enabled'))) return [];
  const rows = await database
    .select({ id: animalListings.id, updatedAt: animalListings.updatedAt })
    .from(animalListings)
    .innerJoin(animals, eq(animals.id, animalListings.animalId))
    .where(and(eq(animalListings.status, 'PUBLISHED'), publicListingCondition(now)))
    .orderBy(desc(animalListings.publishedAt));
  return rows.map((row) => ({ path: '/animals-market/' + row.id, lastModified: row.updatedAt }));
}

/** Filter options, read from the same taxonomy every other public page uses. */
export async function listingFilterOptions(database: DbClient) {
  const [speciesRows, breedRows, provinceRows, cityRows] = await Promise.all([
    database
      .select({ code: marketplaceSpecies.speciesCode })
      .from(marketplaceSpecies)
      .where(and(eq(marketplaceSpecies.market, 'ANIMAL_SALE'), eq(marketplaceSpecies.enabled, true))),
    database
      .select({ id: referenceBreeds.id, nameFa: referenceBreeds.nameFa })
      .from(referenceBreeds)
      .orderBy(asc(referenceBreeds.sortOrder), asc(referenceBreeds.nameFa)),
    database.select({ code: provinces.code, nameFa: provinces.nameFa }).from(provinces).orderBy(asc(provinces.sortOrder)),
    database
      .select({ id: cities.id, provinceCode: cities.provinceCode, nameFa: cities.nameFa })
      .from(cities)
      .where(eq(cities.isActive, true)),
  ]);
  return {
    species: speciesRows.map((row) => row.code),
    breeds: breedRows,
    provinces: provinceRows,
    cities: cityRows.sort((a, b) => a.nameFa.localeCompare(b.nameFa, 'fa')),
  };
}

/** Used by the report page: the advert has to be publicly visible to be reportable. */
export async function reportableListing(
  database: DbClient,
  id: string,
  now: Date = new Date(),
): Promise<{ id: string; titleFa: string; revision: number }> {
  const detail = await publicListing(database, id, now);
  if (detail === null) throw notFound('این آگهی پیدا نشد.');
  return { id: detail.id, titleFa: detail.titleFa, revision: detail.listingRevision };
}
