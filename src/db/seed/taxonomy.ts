/**
 * Versioned taxonomy seed — Requirements-Phase-2 §23.
 *
 * Migrations 0017, 0020 and 0022 installed the first generation of every
 * taxonomy with plain INSERT statements. That works once. It cannot add the
 * entry a later generation needs, it cannot restore one that was removed by
 * hand, and nothing records which generation a database actually holds — so
 * "the taxonomies are seeded" was a claim no command could check.
 *
 * The catalogues below are that first generation, transcribed from those
 * migrations exactly: same codes, same Persian names, same order. Nothing is
 * invented here — a taxonomy entry is product data, and a plausible-looking
 * specialty or centre type nobody approved is a fabricated fact. A test
 * compares this file against what the migrations actually installed, so the two
 * cannot drift apart silently.
 *
 * Two rules govern re-running:
 *
 *   - Only a missing entry is inserted. An existing row is never updated, never
 *     renamed and never re-activated: an operator who renamed an entry or
 *     switched it off made a decision, and a redeploy that quietly undid it
 *     would be the seed overruling a person.
 *   - The generation is recorded per taxonomy, so catalogues advance
 *     independently and `taxonomy_seed` answers what is installed.
 *
 * Raising a catalogue's version is how a new entry ships: add the row, bump the
 * number, and the next seed run installs it without a migration.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '../client.ts';
import { breedGroups, species } from '../schema/core.ts';
import { cities, provinces } from '../schema/geography.ts';
import { centreFacilities, centreServices, centreTypes, vetSpecialties } from '../schema/vets.ts';
import { taxonomySeeds } from '../schema/taxonomy.ts';
import { citySlug } from '../../geo/model.ts';

export interface TaxonomySeedResult {
  readonly name: string;
  readonly version: number;
  /** Entries this run added because they were missing. */
  readonly inserted: number;
  /** Entries already present, left exactly as they are. */
  readonly preserved: number;
}

/** Species the product recognises (migration 0017 and 0020). */
export const SPECIES_CATALOGUE: ReadonlyArray<{ code: string; nameFa: string; nameEn: string; sortOrder: number }> = [
  { code: 'DOG', nameFa: 'سگ', nameEn: 'Dog', sortOrder: 0 },
  { code: 'CAT', nameFa: 'گربه', nameEn: 'Cat', sortOrder: 1 },
];

/** The published FCI nomenclature (migration 0017, DEC-0154). */
export const BREED_GROUP_CATALOGUE: ReadonlyArray<{
  speciesCode: string;
  fciGroup: number;
  nameFa: string;
  nameEn: string;
}> = [
  { speciesCode: 'DOG', fciGroup: 1, nameFa: 'سگ‌های گله و دام (به‌جز سگ‌های دام سوئیسی)', nameEn: 'Sheepdogs and Cattledogs (except Swiss Cattledogs)' },
  { speciesCode: 'DOG', fciGroup: 2, nameFa: 'پینشر و شناوزر، مولوسوئیدها و سگ‌های کوهستان و دام سوئیسی', nameEn: 'Pinscher and Schnauzer - Molossoid and Swiss Mountain and Cattledogs' },
  { speciesCode: 'DOG', fciGroup: 3, nameFa: 'تریرها', nameEn: 'Terriers' },
  { speciesCode: 'DOG', fciGroup: 4, nameFa: 'داکسهوندها', nameEn: 'Dachshunds' },
  { speciesCode: 'DOG', fciGroup: 5, nameFa: 'اشپیتز و نژادهای ابتدایی', nameEn: 'Spitz and primitive types' },
  { speciesCode: 'DOG', fciGroup: 6, nameFa: 'سگ‌های شکاری ردیاب و نژادهای وابسته', nameEn: 'Scent hounds and related breeds' },
  { speciesCode: 'DOG', fciGroup: 7, nameFa: 'سگ‌های شکاری نشانگر', nameEn: 'Pointing Dogs' },
  { speciesCode: 'DOG', fciGroup: 8, nameFa: 'رتریورها، سگ‌های بیرون‌ران و سگ‌های آبی', nameEn: 'Retrievers - Flushing Dogs - Water Dogs' },
  { speciesCode: 'DOG', fciGroup: 9, nameFa: 'سگ‌های همراه و اسباب‌بازی', nameEn: 'Companion and Toy Dogs' },
  { speciesCode: 'DOG', fciGroup: 10, nameFa: 'سگ‌های تازی', nameEn: 'Sighthounds' },
];

/** The provinces of Iran (migration 0020), each keyed by its stable latin code. */
export const PROVINCE_CATALOGUE: ReadonlyArray<{ code: string; nameFa: string; nameEn: string; sortOrder: number }> = [
  { code: 'east-azerbaijan', nameFa: 'آذربایجان شرقی', nameEn: 'East Azerbaijan', sortOrder: 1 },
  { code: 'west-azerbaijan', nameFa: 'آذربایجان غربی', nameEn: 'West Azerbaijan', sortOrder: 2 },
  { code: 'ardabil', nameFa: 'اردبیل', nameEn: 'Ardabil', sortOrder: 3 },
  { code: 'isfahan', nameFa: 'اصفهان', nameEn: 'Isfahan', sortOrder: 4 },
  { code: 'alborz', nameFa: 'البرز', nameEn: 'Alborz', sortOrder: 5 },
  { code: 'ilam', nameFa: 'ایلام', nameEn: 'Ilam', sortOrder: 6 },
  { code: 'bushehr', nameFa: 'بوشهر', nameEn: 'Bushehr', sortOrder: 7 },
  { code: 'tehran', nameFa: 'تهران', nameEn: 'Tehran', sortOrder: 8 },
  { code: 'chaharmahal-bakhtiari', nameFa: 'چهارمحال و بختیاری', nameEn: 'Chaharmahal and Bakhtiari', sortOrder: 9 },
  { code: 'south-khorasan', nameFa: 'خراسان جنوبی', nameEn: 'South Khorasan', sortOrder: 10 },
  { code: 'razavi-khorasan', nameFa: 'خراسان رضوی', nameEn: 'Razavi Khorasan', sortOrder: 11 },
  { code: 'north-khorasan', nameFa: 'خراسان شمالی', nameEn: 'North Khorasan', sortOrder: 12 },
  { code: 'khuzestan', nameFa: 'خوزستان', nameEn: 'Khuzestan', sortOrder: 13 },
  { code: 'zanjan', nameFa: 'زنجان', nameEn: 'Zanjan', sortOrder: 14 },
  { code: 'semnan', nameFa: 'سمنان', nameEn: 'Semnan', sortOrder: 15 },
  { code: 'sistan-baluchestan', nameFa: 'سیستان و بلوچستان', nameEn: 'Sistan and Baluchestan', sortOrder: 16 },
  { code: 'fars', nameFa: 'فارس', nameEn: 'Fars', sortOrder: 17 },
  { code: 'qazvin', nameFa: 'قزوین', nameEn: 'Qazvin', sortOrder: 18 },
  { code: 'qom', nameFa: 'قم', nameEn: 'Qom', sortOrder: 19 },
  { code: 'kurdistan', nameFa: 'کردستان', nameEn: 'Kurdistan', sortOrder: 20 },
  { code: 'kerman', nameFa: 'کرمان', nameEn: 'Kerman', sortOrder: 21 },
  { code: 'kermanshah', nameFa: 'کرمانشاه', nameEn: 'Kermanshah', sortOrder: 22 },
  { code: 'kohgiluyeh-boyer-ahmad', nameFa: 'کهگیلویه و بویراحمد', nameEn: 'Kohgiluyeh and Boyer-Ahmad', sortOrder: 23 },
  { code: 'golestan', nameFa: 'گلستان', nameEn: 'Golestan', sortOrder: 24 },
  { code: 'gilan', nameFa: 'گیلان', nameEn: 'Gilan', sortOrder: 25 },
  { code: 'lorestan', nameFa: 'لرستان', nameEn: 'Lorestan', sortOrder: 26 },
  { code: 'mazandaran', nameFa: 'مازندران', nameEn: 'Mazandaran', sortOrder: 27 },
  { code: 'markazi', nameFa: 'مرکزی', nameEn: 'Markazi', sortOrder: 28 },
  { code: 'hormozgan', nameFa: 'هرمزگان', nameEn: 'Hormozgan', sortOrder: 29 },
  { code: 'hamadan', nameFa: 'همدان', nameEn: 'Hamadan', sortOrder: 30 },
  { code: 'yazd', nameFa: 'یزد', nameEn: 'Yazd', sortOrder: 31 },
];

/**
 * The provincial capitals (migration 0020). Every other city is data the
 * superadmin adds, so this list stays the capitals and grows no further.
 */
export const CITY_CATALOGUE: ReadonlyArray<{ provinceCode: string; nameFa: string }> = [
  { provinceCode: 'east-azerbaijan', nameFa: 'تبریز' },
  { provinceCode: 'west-azerbaijan', nameFa: 'ارومیه' },
  { provinceCode: 'ardabil', nameFa: 'اردبیل' },
  { provinceCode: 'isfahan', nameFa: 'اصفهان' },
  { provinceCode: 'alborz', nameFa: 'کرج' },
  { provinceCode: 'ilam', nameFa: 'ایلام' },
  { provinceCode: 'bushehr', nameFa: 'بوشهر' },
  { provinceCode: 'tehran', nameFa: 'تهران' },
  { provinceCode: 'chaharmahal-bakhtiari', nameFa: 'شهرکرد' },
  { provinceCode: 'south-khorasan', nameFa: 'بیرجند' },
  { provinceCode: 'razavi-khorasan', nameFa: 'مشهد' },
  { provinceCode: 'north-khorasan', nameFa: 'بجنورد' },
  { provinceCode: 'khuzestan', nameFa: 'اهواز' },
  { provinceCode: 'zanjan', nameFa: 'زنجان' },
  { provinceCode: 'semnan', nameFa: 'سمنان' },
  { provinceCode: 'sistan-baluchestan', nameFa: 'زاهدان' },
  { provinceCode: 'fars', nameFa: 'شیراز' },
  { provinceCode: 'qazvin', nameFa: 'قزوین' },
  { provinceCode: 'qom', nameFa: 'قم' },
  { provinceCode: 'kurdistan', nameFa: 'سنندج' },
  { provinceCode: 'kerman', nameFa: 'کرمان' },
  { provinceCode: 'kermanshah', nameFa: 'کرمانشاه' },
  { provinceCode: 'kohgiluyeh-boyer-ahmad', nameFa: 'یاسوج' },
  { provinceCode: 'golestan', nameFa: 'گرگان' },
  { provinceCode: 'gilan', nameFa: 'رشت' },
  { provinceCode: 'lorestan', nameFa: 'خرم‌آباد' },
  { provinceCode: 'mazandaran', nameFa: 'ساری' },
  { provinceCode: 'markazi', nameFa: 'اراک' },
  { provinceCode: 'hormozgan', nameFa: 'بندرعباس' },
  { provinceCode: 'hamadan', nameFa: 'همدان' },
  { provinceCode: 'yazd', nameFa: 'یزد' },
];

/** Areas of practice a profile may list (migration 0020). A listing is a statement, not a certification. */
export const VET_SPECIALTY_CATALOGUE: ReadonlyArray<{ code: string; nameFa: string; sortOrder: number }> = [
  { code: 'SMALL_ANIMAL_MEDICINE', nameFa: 'داخلی حیوانات کوچک', sortOrder: 1 },
  { code: 'SURGERY', nameFa: 'جراحی', sortOrder: 2 },
  { code: 'ORTHOPEDICS', nameFa: 'ارتوپدی', sortOrder: 3 },
  { code: 'DERMATOLOGY', nameFa: 'پوست', sortOrder: 4 },
  { code: 'DENTISTRY', nameFa: 'دندان‌پزشکی', sortOrder: 5 },
  { code: 'OPHTHALMOLOGY', nameFa: 'چشم‌پزشکی', sortOrder: 6 },
  { code: 'CARDIOLOGY', nameFa: 'قلب', sortOrder: 7 },
  { code: 'DIAGNOSTIC_IMAGING', nameFa: 'تصویربرداری تشخیصی', sortOrder: 8 },
  { code: 'ANESTHESIA', nameFa: 'بیهوشی', sortOrder: 9 },
  { code: 'EMERGENCY_CRITICAL_CARE', nameFa: 'اورژانس و مراقبت‌های ویژه', sortOrder: 10 },
  { code: 'REPRODUCTION', nameFa: 'مامایی و تولیدمثل', sortOrder: 11 },
  { code: 'ONCOLOGY', nameFa: 'سرطان‌شناسی', sortOrder: 12 },
  { code: 'NUTRITION', nameFa: 'تغذیه', sortOrder: 13 },
  { code: 'BEHAVIOR', nameFa: 'رفتارشناسی', sortOrder: 14 },
  { code: 'LABORATORY_PATHOLOGY', nameFa: 'آزمایشگاه و آسیب‌شناسی', sortOrder: 15 },
];

/** Kinds of centre (migration 0022). */
export const CENTRE_TYPE_CATALOGUE: ReadonlyArray<{ code: string; nameFa: string; sortOrder: number }> = [
  { code: 'HOSPITAL', nameFa: 'بیمارستان دامپزشکی', sortOrder: 1 },
  { code: 'CLINIC', nameFa: 'کلینیک دامپزشکی', sortOrder: 2 },
  { code: 'POLYCLINIC', nameFa: 'درمانگاه دامپزشکی', sortOrder: 3 },
  { code: 'OFFICE', nameFa: 'مطب دامپزشکی', sortOrder: 4 },
  { code: 'LABORATORY', nameFa: 'آزمایشگاه دامپزشکی', sortOrder: 5 },
  { code: 'IMAGING', nameFa: 'مرکز تصویربرداری', sortOrder: 6 },
  { code: 'PHARMACY', nameFa: 'داروخانه دامپزشکی', sortOrder: 7 },
  { code: 'GENETICS', nameFa: 'مرکز ژنتیک', sortOrder: 8 },
  { code: 'REHABILITATION', nameFa: 'مرکز توان‌بخشی', sortOrder: 9 },
  { code: 'OTHER', nameFa: 'سایر مراکز', sortOrder: 10 },
];

/** Services a centre states it offers (migration 0022). The listing is the centre's statement. */
export const CENTRE_SERVICE_CATALOGUE: ReadonlyArray<{ code: string; nameFa: string; sortOrder: number }> = [
  { code: 'EXAMINATION', nameFa: 'ویزیت و معاینه', sortOrder: 1 },
  { code: 'VACCINATION', nameFa: 'واکسیناسیون', sortOrder: 2 },
  { code: 'SURGERY', nameFa: 'جراحی', sortOrder: 3 },
  { code: 'DENTISTRY', nameFa: 'دندان‌پزشکی', sortOrder: 4 },
  { code: 'HOSPITALIZATION', nameFa: 'بستری', sortOrder: 5 },
  { code: 'EMERGENCY', nameFa: 'اورژانس', sortOrder: 6 },
  { code: 'LABORATORY', nameFa: 'آزمایشگاه', sortOrder: 7 },
  { code: 'IMAGING', nameFa: 'تصویربرداری', sortOrder: 8 },
  { code: 'PHARMACY', nameFa: 'داروخانه', sortOrder: 9 },
  { code: 'MICROCHIP', nameFa: 'کاشت میکروچیپ', sortOrder: 10 },
  { code: 'SAMPLING', nameFa: 'نمونه‌گیری', sortOrder: 11 },
  { code: 'PHYSIOTHERAPY', nameFa: 'فیزیوتراپی', sortOrder: 12 },
  { code: 'NUTRITION_COUNSELLING', nameFa: 'مشاوره تغذیه', sortOrder: 13 },
  { code: 'GROOMING', nameFa: 'آرایش و بهداشت', sortOrder: 14 },
];

/** Amenities of a place (migration 0022). Never a medical claim. */
export const CENTRE_FACILITY_CATALOGUE: ReadonlyArray<{ code: string; nameFa: string; sortOrder: number }> = [
  { code: 'PARKING', nameFa: 'پارکینگ', sortOrder: 1 },
  { code: 'HOSPITALIZATION_WARD', nameFa: 'بخش بستری', sortOrder: 2 },
  { code: 'ISOLATION', nameFa: 'بخش ایزوله', sortOrder: 3 },
  { code: 'AMBULANCE', nameFa: 'آمبولانس', sortOrder: 4 },
  { code: 'WHEELCHAIR_ACCESS', nameFa: 'دسترسی بدون پله', sortOrder: 5 },
  { code: 'WAITING_ROOM', nameFa: 'اتاق انتظار', sortOrder: 6 },
  { code: 'CARD_PAYMENT', nameFa: 'پرداخت کارتی', sortOrder: 7 },
  { code: 'IN_HOUSE_LAB', nameFa: 'آزمایشگاه داخلی', sortOrder: 8 },
  { code: 'IN_HOUSE_IMAGING', nameFa: 'تصویربرداری داخلی', sortOrder: 9 },
  { code: 'IN_HOUSE_PHARMACY', nameFa: 'داروخانه داخلی', sortOrder: 10 },
];

interface Catalogue {
  readonly name: string;
  readonly version: number;
  readonly size: number;
  /** Inserts the entries this database is missing and answers how many it added. */
  ensure(database: DbClient): Promise<number>;
}

/**
 * Every taxonomy, with the generation this code carries.
 *
 * Version 1 is what migrations 0017, 0020 and 0022 installed. Adding an entry
 * later means appending it to its catalogue and raising that catalogue's
 * version — no migration, and no other taxonomy is disturbed.
 */
export const TAXONOMY_CATALOGUES: readonly Catalogue[] = [
  {
    name: 'species',
    version: 1,
    size: SPECIES_CATALOGUE.length,
    async ensure(database) {
      const present = new Set((await database.select({ code: species.code }).from(species)).map((row) => row.code));
      const missing = SPECIES_CATALOGUE.filter((entry) => !present.has(entry.code));
      if (missing.length === 0) return 0;
      const added = await database.insert(species).values([...missing]).onConflictDoNothing().returning({ code: species.code });
      return added.length;
    },
  },
  {
    name: 'breed_group',
    version: 1,
    size: BREED_GROUP_CATALOGUE.length,
    async ensure(database) {
      const rows = await database
        .select({ speciesCode: breedGroups.speciesCode, fciGroup: breedGroups.fciGroup })
        .from(breedGroups);
      const present = new Set(rows.map((row) => row.speciesCode + ':' + row.fciGroup));
      const missing = BREED_GROUP_CATALOGUE.filter((entry) => !present.has(entry.speciesCode + ':' + entry.fciGroup));
      if (missing.length === 0) return 0;
      const added = await database
        .insert(breedGroups)
        .values([...missing])
        .onConflictDoNothing()
        .returning({ id: breedGroups.id });
      return added.length;
    },
  },
  {
    name: 'province',
    version: 1,
    size: PROVINCE_CATALOGUE.length,
    async ensure(database) {
      const present = new Set((await database.select({ code: provinces.code }).from(provinces)).map((row) => row.code));
      const missing = PROVINCE_CATALOGUE.filter((entry) => !present.has(entry.code));
      if (missing.length === 0) return 0;
      const added = await database
        .insert(provinces)
        .values([...missing])
        .onConflictDoNothing()
        .returning({ code: provinces.code });
      return added.length;
    },
  },
  {
    name: 'city',
    version: 1,
    size: CITY_CATALOGUE.length,
    async ensure(database) {
      const rows = await database.select({ provinceCode: cities.provinceCode, nameFa: cities.nameFa }).from(cities);
      const present = new Set(rows.map((row) => row.provinceCode + ':' + row.nameFa));
      const missing = CITY_CATALOGUE.filter((entry) => !present.has(entry.provinceCode + ':' + entry.nameFa));
      if (missing.length === 0) return 0;
      // The address comes from the same citySlug() rule migration 0027 backfilled
      // with, so a capital added here and one added then share one spelling.
      const added = await database
        .insert(cities)
        .values(missing.map((entry) => ({ provinceCode: entry.provinceCode, nameFa: entry.nameFa, slug: citySlug(entry.nameFa) })))
        .onConflictDoNothing()
        .returning({ id: cities.id });
      return added.length;
    },
  },
  {
    name: 'vet_specialty',
    version: 1,
    size: VET_SPECIALTY_CATALOGUE.length,
    async ensure(database) {
      const present = new Set(
        (await database.select({ code: vetSpecialties.code }).from(vetSpecialties)).map((row) => row.code),
      );
      const missing = VET_SPECIALTY_CATALOGUE.filter((entry) => !present.has(entry.code));
      if (missing.length === 0) return 0;
      const added = await database
        .insert(vetSpecialties)
        .values([...missing])
        .onConflictDoNothing()
        .returning({ code: vetSpecialties.code });
      return added.length;
    },
  },
  {
    name: 'centre_type',
    version: 1,
    size: CENTRE_TYPE_CATALOGUE.length,
    async ensure(database) {
      const present = new Set((await database.select({ code: centreTypes.code }).from(centreTypes)).map((row) => row.code));
      const missing = CENTRE_TYPE_CATALOGUE.filter((entry) => !present.has(entry.code));
      if (missing.length === 0) return 0;
      const added = await database
        .insert(centreTypes)
        .values([...missing])
        .onConflictDoNothing()
        .returning({ code: centreTypes.code });
      return added.length;
    },
  },
  {
    name: 'centre_service',
    version: 1,
    size: CENTRE_SERVICE_CATALOGUE.length,
    async ensure(database) {
      const present = new Set(
        (await database.select({ code: centreServices.code }).from(centreServices)).map((row) => row.code),
      );
      const missing = CENTRE_SERVICE_CATALOGUE.filter((entry) => !present.has(entry.code));
      if (missing.length === 0) return 0;
      const added = await database
        .insert(centreServices)
        .values([...missing])
        .onConflictDoNothing()
        .returning({ code: centreServices.code });
      return added.length;
    },
  },
  {
    name: 'centre_facility',
    version: 1,
    size: CENTRE_FACILITY_CATALOGUE.length,
    async ensure(database) {
      const present = new Set(
        (await database.select({ code: centreFacilities.code }).from(centreFacilities)).map((row) => row.code),
      );
      const missing = CENTRE_FACILITY_CATALOGUE.filter((entry) => !present.has(entry.code));
      if (missing.length === 0) return 0;
      const added = await database
        .insert(centreFacilities)
        .values([...missing])
        .onConflictDoNothing()
        .returning({ code: centreFacilities.code });
      return added.length;
    },
  },
];

/** The generation of one taxonomy as this database holds it, or null if it was never recorded. */
export async function installedTaxonomyVersion(database: DbClient, name: string): Promise<number | null> {
  const [row] = await database
    .select({ version: taxonomySeeds.version })
    .from(taxonomySeeds)
    .where(eq(taxonomySeeds.name, name))
    .limit(1);
  return row?.version ?? null;
}

/**
 * Installs any taxonomy entry this database is missing and records the
 * generation each catalogue is now at. Safe to run on every deploy: an existing
 * entry is left exactly as the operator left it.
 */
export async function seedTaxonomies(database: DbClient): Promise<readonly TaxonomySeedResult[]> {
  const results: TaxonomySeedResult[] = [];
  for (const catalogue of TAXONOMY_CATALOGUES) {
    const inserted = await catalogue.ensure(database);
    await database
      .insert(taxonomySeeds)
      .values({ name: catalogue.name, version: catalogue.version })
      .onConflictDoUpdate({
        target: taxonomySeeds.name,
        set: { version: catalogue.version, appliedAt: sql`now()` },
      });
    results.push({
      name: catalogue.name,
      version: catalogue.version,
      inserted,
      preserved: catalogue.size - inserted,
    });
  }
  return results;
}

/** Used by the seed test to read one city back by its natural key. */
export const cityByName = (database: DbClient, provinceCode: string, nameFa: string) =>
  database
    .select({ id: cities.id, slug: cities.slug })
    .from(cities)
    .where(and(eq(cities.provinceCode, provinceCode), eq(cities.nameFa, nameFa)))
    .limit(1);
