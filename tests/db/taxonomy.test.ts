/**
 * The versioned taxonomy seed — Requirements-Phase-2 §23, PROMPT-019.
 *
 * Two things are proven here. First, that the catalogue in code is exactly what
 * the migrations installed: if this file invented a specialty or lost a
 * province, the product would ship a fact nobody approved. Second, that
 * re-running the seed puts back what is missing without overruling an operator
 * who renamed or switched off an entry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db.ts';
import { seedBaseline } from '../../src/db/seed/index.ts';
import {
  CENTRE_FACILITY_CATALOGUE,
  CENTRE_SERVICE_CATALOGUE,
  CENTRE_TYPE_CATALOGUE,
  CITY_CATALOGUE,
  PROVINCE_CATALOGUE,
  SPECIES_CATALOGUE,
  TAXONOMY_CATALOGUES,
  VET_SPECIALTY_CATALOGUE,
  installedTaxonomyVersion,
  seedTaxonomies,
} from '../../src/db/seed/taxonomy.ts';
import { species } from '../../src/db/schema/core.ts';
import { cities, provinces } from '../../src/db/schema/geography.ts';
import { centreFacilities, centreServices, centreTypes, vetSpecialties } from '../../src/db/schema/vets.ts';
import { citySlug } from '../../src/geo/model.ts';

test('the catalogue in code is exactly what the migrations installed', async () => {
  const testDb = await createTestDb();
  try {
    // Nothing is seeded yet: these rows are the migrations' own INSERTs.
    const [speciesRows, provinceRows, cityRows, specialtyRows, typeRows, serviceRows, facilityRows] = await Promise.all([
      testDb.db.select({ code: species.code, nameFa: species.nameFa }).from(species),
      testDb.db.select({ code: provinces.code, nameFa: provinces.nameFa }).from(provinces),
      testDb.db.select({ provinceCode: cities.provinceCode, nameFa: cities.nameFa }).from(cities),
      testDb.db.select({ code: vetSpecialties.code, nameFa: vetSpecialties.nameFa }).from(vetSpecialties),
      testDb.db.select({ code: centreTypes.code, nameFa: centreTypes.nameFa }).from(centreTypes),
      testDb.db.select({ code: centreServices.code, nameFa: centreServices.nameFa }).from(centreServices),
      testDb.db.select({ code: centreFacilities.code, nameFa: centreFacilities.nameFa }).from(centreFacilities),
    ]);

    const byCode = (rows: { code: string; nameFa: string }[]) =>
      rows.map((row) => row.code + '=' + row.nameFa).sort();
    const fromCatalogue = (entries: readonly { code: string; nameFa: string }[]) =>
      entries.map((entry) => entry.code + '=' + entry.nameFa).sort();

    assert.deepEqual(byCode(speciesRows), fromCatalogue(SPECIES_CATALOGUE));
    assert.deepEqual(byCode(provinceRows), fromCatalogue(PROVINCE_CATALOGUE));
    assert.deepEqual(byCode(specialtyRows), fromCatalogue(VET_SPECIALTY_CATALOGUE));
    assert.deepEqual(byCode(typeRows), fromCatalogue(CENTRE_TYPE_CATALOGUE));
    assert.deepEqual(byCode(serviceRows), fromCatalogue(CENTRE_SERVICE_CATALOGUE));
    assert.deepEqual(byCode(facilityRows), fromCatalogue(CENTRE_FACILITY_CATALOGUE));
    assert.deepEqual(
      cityRows.map((row) => row.provinceCode + '=' + row.nameFa).sort(),
      CITY_CATALOGUE.map((entry) => entry.provinceCode + '=' + entry.nameFa).sort(),
    );
  } finally {
    await testDb.drop();
  }
});

test('seeding a database the migrations already filled adds nothing and records the generation', async () => {
  const testDb = await createTestDb();
  try {
    const report = await seedTaxonomies(testDb.db);
    assert.equal(report.length, TAXONOMY_CATALOGUES.length);
    for (const entry of report) {
      assert.equal(entry.inserted, 0, entry.name + ' was inserted twice');
      assert.ok(entry.preserved > 0);
      assert.equal(await installedTaxonomyVersion(testDb.db, entry.name), entry.version);
    }
    // Version 1 is what migrations 0017, 0020 and 0022 installed.
    assert.equal(await installedTaxonomyVersion(testDb.db, 'province'), 1);
    assert.equal(await installedTaxonomyVersion(testDb.db, 'centre_facility'), 1);
    // A taxonomy nobody declared has no recorded generation, rather than a zero.
    assert.equal(await installedTaxonomyVersion(testDb.db, 'not_a_taxonomy'), null);
  } finally {
    await testDb.drop();
  }
});

test('a missing entry comes back on the next run, with the city address rule of its own migration', async () => {
  const testDb = await createTestDb();
  try {
    await testDb.db.delete(centreFacilities).where(eq(centreFacilities.code, 'AMBULANCE'));
    await testDb.db.delete(cities).where(eq(cities.nameFa, 'خرم‌آباد'));

    const report = await seedTaxonomies(testDb.db);
    const facilities = report.find((entry) => entry.name === 'centre_facility');
    const city = report.find((entry) => entry.name === 'city');
    assert.equal(facilities?.inserted, 1);
    assert.equal(city?.inserted, 1);

    const [restored] = await testDb.db
      .select({ nameFa: centreFacilities.nameFa })
      .from(centreFacilities)
      .where(eq(centreFacilities.code, 'AMBULANCE'));
    assert.equal(restored?.nameFa, 'آمبولانس');

    // The seeded address must match what migration 0027 backfills, or the same
    // city would answer at two spellings depending on how it arrived.
    const [restoredCity] = await testDb.db
      .select({ slug: cities.slug })
      .from(cities)
      .where(eq(cities.nameFa, 'خرم‌آباد'));
    assert.equal(restoredCity?.slug, citySlug('خرم‌آباد'));
  } finally {
    await testDb.drop();
  }
});

test('the seed never overrules an operator who renamed or switched off an entry', async () => {
  const testDb = await createTestDb();
  try {
    await testDb.db
      .update(centreTypes)
      .set({ nameFa: 'کلینیک شبانه‌روزی' })
      .where(eq(centreTypes.code, 'CLINIC'));
    await testDb.db.update(vetSpecialties).set({ isActive: false }).where(eq(vetSpecialties.code, 'ONCOLOGY'));

    await seedTaxonomies(testDb.db);

    const [renamed] = await testDb.db
      .select({ nameFa: centreTypes.nameFa })
      .from(centreTypes)
      .where(eq(centreTypes.code, 'CLINIC'));
    assert.equal(renamed?.nameFa, 'کلینیک شبانه‌روزی', 'a redeploy renamed the entry back');

    const [switchedOff] = await testDb.db
      .select({ isActive: vetSpecialties.isActive })
      .from(vetSpecialties)
      .where(eq(vetSpecialties.code, 'ONCOLOGY'));
    assert.equal(switchedOff?.isActive, false, 'a redeploy switched the entry back on');
  } finally {
    await testDb.drop();
  }
});

test('the baseline seed reports the taxonomies alongside the settings', async () => {
  const testDb = await createTestDb();
  try {
    const report = await seedBaseline(testDb.db);
    assert.equal(report.taxonomies.length, TAXONOMY_CATALOGUES.length);
    assert.deepEqual(
      report.taxonomies.map((entry) => entry.name),
      TAXONOMY_CATALOGUES.map((entry) => entry.name),
    );
  } finally {
    await testDb.drop();
  }
});
