/**
 * Places and what is published in them — Requirements-Phase-2 §2, §19, §20
 * (PROMPT-015).
 *
 * A local page counts only what a visitor could already find: a published
 * record with a place its owner made public. Nothing here reads a private
 * address, and a record that is not published does not exist for these counts.
 */
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { cities, provinces } from '../db/schema/geography.ts';
import { centres, vetLocations, vetProfiles } from '../db/schema/vets.ts';
import { communities } from '../db/schema/communities.ts';
import { mapApiKey } from '../adapters/integration-settings.ts';
import { readSetting } from '../settings/service.ts';
import { citySlug, isIndexablePlace, placePath, placeTotal, type PlaceCounts } from './model.ts';

/**
 * What a page needs to draw a map: the operator's embed template and the key.
 * Absent template means no map is drawn at all (DEC-0175).
 */
export async function mapConfig(database: DbClient): Promise<{ template: string | null; apiKey: string | null }> {
  const [{ apiKey }, template] = await Promise.all([
    mapApiKey(database),
    readSetting(database, 'integration.map.embed_url_template'),
  ]);
  return { template: template.value === null ? null : String(template.value), apiKey };
}

export interface ProvinceRow {
  readonly code: string;
  readonly nameFa: string;
}

export interface CityRow {
  readonly id: string;
  readonly provinceCode: string;
  readonly nameFa: string;
  readonly slug: string;
}

/** The slug a city is published at; older rows fall back to their name. */
export const slugOf = (row: { nameFa: string; slug: string | null }): string => row.slug ?? citySlug(row.nameFa);

type Bucket = Map<string, PlaceCounts>;

const add = (bucket: Bucket, key: string | null, field: keyof PlaceCounts, n: number): void => {
  if (key === null || n === 0) return;
  const current = bucket.get(key) ?? { vets: 0, centres: 0, communities: 0 };
  bucket.set(key, { ...current, [field]: current[field] + n });
};

/**
 * How many published records each place holds, counted in three grouped
 * queries rather than by walking every province.
 */
async function counts(database: DbClient): Promise<{ byProvince: Bucket; byCity: Bucket }> {
  const [vetRows, centreRows, communityRows] = await Promise.all([
    // A veterinarian is counted where they let their place be shown.
    database
      .select({
        provinceCode: vetLocations.provinceCode,
        cityId: vetLocations.cityId,
        value: sql<number>`count(distinct ${vetProfiles.id})`,
      })
      .from(vetLocations)
      .innerJoin(vetProfiles, eq(vetProfiles.accountId, vetLocations.vetAccountId))
      .where(
        and(
          eq(vetLocations.isPublic, true),
          eq(vetLocations.isActive, true),
          eq(vetProfiles.publicStatus, 'PUBLISHED'),
          isNotNull(vetLocations.provinceCode),
        ),
      )
      .groupBy(vetLocations.provinceCode, vetLocations.cityId),
    database
      .select({
        provinceCode: vetLocations.provinceCode,
        cityId: vetLocations.cityId,
        value: sql<number>`count(distinct ${centres.id})`,
      })
      .from(vetLocations)
      .innerJoin(centres, eq(centres.id, vetLocations.centreId))
      .where(
        and(
          eq(vetLocations.isPublic, true),
          eq(vetLocations.isActive, true),
          eq(centres.publicStatus, 'PUBLISHED'),
          isNotNull(vetLocations.provinceCode),
        ),
      )
      .groupBy(vetLocations.provinceCode, vetLocations.cityId),
    database
      .select({
        provinceCode: communities.provinceCode,
        cityId: communities.cityId,
        value: sql<number>`count(*)`,
      })
      .from(communities)
      .where(and(eq(communities.publicStatus, 'PUBLISHED'), isNotNull(communities.provinceCode)))
      .groupBy(communities.provinceCode, communities.cityId),
  ]);

  const byProvince: Bucket = new Map();
  const byCity: Bucket = new Map();
  for (const row of vetRows) {
    add(byProvince, row.provinceCode, 'vets', Number(row.value));
    add(byCity, row.cityId, 'vets', Number(row.value));
  }
  for (const row of centreRows) {
    add(byProvince, row.provinceCode, 'centres', Number(row.value));
    add(byCity, row.cityId, 'centres', Number(row.value));
  }
  for (const row of communityRows) {
    add(byProvince, row.provinceCode, 'communities', Number(row.value));
    add(byCity, row.cityId, 'communities', Number(row.value));
  }
  return { byProvince, byCity };
}

const EMPTY: PlaceCounts = { vets: 0, centres: 0, communities: 0 };

export interface ProvinceSummary {
  readonly province: ProvinceRow;
  readonly counts: PlaceCounts;
  readonly total: number;
  readonly path: string;
}

/** Every province, with what is published in it. Provinces are a fixed list (§2). */
export async function provinceSummaries(database: DbClient): Promise<ProvinceSummary[]> {
  const [rows, tallies] = await Promise.all([
    database.select({ code: provinces.code, nameFa: provinces.nameFa }).from(provinces).orderBy(asc(provinces.sortOrder)),
    counts(database),
  ]);
  return rows.map((province) => {
    const tally = tallies.byProvince.get(province.code) ?? EMPTY;
    return { province, counts: tally, total: placeTotal(tally), path: placePath(province.code) };
  });
}

export interface CitySummary {
  readonly city: CityRow;
  readonly counts: PlaceCounts;
  readonly total: number;
  readonly path: string;
}

export interface ProvincePage {
  readonly province: ProvinceRow;
  readonly counts: PlaceCounts;
  readonly cities: readonly CitySummary[];
  readonly indexable: boolean;
}

/** One province with its cities, or null for an address nobody published. */
export async function provincePage(database: DbClient, code: string): Promise<ProvincePage | null> {
  const [province] = await database
    .select({ code: provinces.code, nameFa: provinces.nameFa })
    .from(provinces)
    .where(eq(provinces.code, code))
    .limit(1);
  if (!province) return null;

  const [cityRows, tallies] = await Promise.all([
    database
      .select({ id: cities.id, provinceCode: cities.provinceCode, nameFa: cities.nameFa, slug: cities.slug })
      .from(cities)
      .where(and(eq(cities.provinceCode, code), eq(cities.isActive, true)))
      .orderBy(asc(cities.nameFa)),
    counts(database),
  ]);

  const tally = tallies.byProvince.get(code) ?? EMPTY;
  return {
    province,
    counts: tally,
    indexable: isIndexablePlace(tally),
    cities: cityRows.map((row) => {
      const cityTally = tallies.byCity.get(row.id) ?? EMPTY;
      const city: CityRow = { id: row.id, provinceCode: row.provinceCode, nameFa: row.nameFa, slug: slugOf(row) };
      return { city, counts: cityTally, total: placeTotal(cityTally), path: placePath(code, city.slug) };
    }),
  };
}

export interface CityPage {
  readonly province: ProvinceRow;
  readonly city: CityRow;
  readonly counts: PlaceCounts;
  readonly indexable: boolean;
}

/** One city by its province and slug, or null when no such place is published. */
export async function cityPage(database: DbClient, provinceCode: string, slug: string): Promise<CityPage | null> {
  const page = await provincePage(database, provinceCode);
  if (page === null) return null;
  const summary = page.cities.find((entry) => entry.city.slug === slug);
  if (!summary) return null;
  return {
    province: page.province,
    city: summary.city,
    counts: summary.counts,
    indexable: isIndexablePlace(summary.counts),
  };
}

/**
 * The local addresses worth offering to a search engine: a place is listed only
 * once it actually holds a published record (§19).
 */
export async function placeSitemapEntries(database: DbClient): Promise<{ path: string }[]> {
  const summaries = await provinceSummaries(database);
  const entries: { path: string }[] = [{ path: '/places' }];
  for (const summary of summaries) {
    if (!isIndexablePlace(summary.counts)) continue;
    entries.push({ path: summary.path });
    const page = await provincePage(database, summary.province.code);
    for (const city of page?.cities ?? []) {
      if (isIndexablePlace(city.counts)) entries.push({ path: city.path });
    }
  }
  return entries;
}
