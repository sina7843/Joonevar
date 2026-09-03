/**
 * Baseline seed.
 *
 * The seed is additive and idempotent: it inserts a setting only when the key
 * does not exist yet. A value an operator has already changed — or deliberately
 * cleared back to NOT_CONFIGURED — is never overwritten by a redeploy, which is
 * what D16 requires of managed data.
 *
 * One narrow exception: a row that still carries the baseline version 1 and has
 * never been given a value receives the starting figure when the catalogue
 * later gains one. That row is untouched by any operator — its version would be
 * above 1 otherwise — so filling it changes nobody's decision, and it is what
 * lets an existing database pick up a newly supplied default instead of staying
 * empty forever.
 */
import { eq } from 'drizzle-orm';
import type { DbClient } from '../client.ts';
import { productSettings, referenceBreeds } from '../schema/core.ts';
import { SETTING_DEFINITIONS } from '../../settings/keys.ts';

export interface SeedReport {
  readonly settingsInserted: readonly string[];
  readonly settingsFilled: readonly string[];
  readonly settingsPreserved: readonly string[];
  readonly breedsInserted: number;
  readonly issuersInserted: number;
}

/**
 * The ten breeds shown in the approved prototype breed dropdown (F04,
 * 414:10472…414:12366). Reference data, editable from the admin panel; this is
 * a starting list, not a closed set.
 */
const BASELINE_BREEDS: ReadonlyArray<{ fa: string; en: string }> = [
  { fa: 'ژرمن شپرد', en: 'German Shepherd' },
  { fa: 'لابرادور رتریور', en: 'Labrador Retriever' },
  { fa: 'گلدن رتریور', en: 'Golden Retriever' },
  { fa: 'هاسکی سیبری', en: 'Siberian Husky' },
  { fa: 'روتوایلر', en: 'Rottweiler' },
  { fa: 'دوبرمن پینشر', en: 'Doberman Pinscher' },
  { fa: 'پودل', en: 'Poodle' },
  { fa: 'بیگل', en: 'Beagle' },
  { fa: 'شیتزو', en: 'Shih Tzu' },
  { fa: 'سگ سرابی', en: 'Sarabi Dog' },
];

export async function seedBaseline(database: DbClient): Promise<SeedReport> {
  const inserted: string[] = [];
  const filled: string[] = [];
  const preserved: string[] = [];

  for (const definition of SETTING_DEFINITIONS) {
    const [existing] = await database
      .select({ id: productSettings.id, value: productSettings.value, version: productSettings.version })
      .from(productSettings)
      .where(eq(productSettings.key, definition.key))
      .limit(1);

    if (existing) {
      if (existing.value === null && existing.version === 1 && definition.seedValue !== null) {
        await database
          .update(productSettings)
          .set({ value: definition.seedValue as never })
          .where(eq(productSettings.id, existing.id));
        filled.push(definition.key);
      } else {
        preserved.push(definition.key);
      }
      continue;
    }

    await database.insert(productSettings).values({
      key: definition.key,
      scopeType: 'GLOBAL',
      scopeId: '',
      group: definition.group,
      kind: definition.kind,
      source: definition.source,
      value: definition.seedValue === null ? null : (definition.seedValue as never),
      labelFa: definition.labelFa,
      noteFa: definition.noteFa ?? null,
      version: 1,
    });
    inserted.push(definition.key);
  }

  let breedsInserted = 0;
  for (const [index, breed] of BASELINE_BREEDS.entries()) {
    const result = await database
      .insert(referenceBreeds)
      .values({ nameFa: breed.fa, nameEn: breed.en, sortOrder: index })
      .onConflictDoNothing({ target: referenceBreeds.nameEn })
      .returning({ id: referenceBreeds.id });
    breedsInserted += result.length;
  }

  // The approved-issuer registry (D14) starts empty on purpose: no issuer name
  // is invented here. An empty registry does not remove the review path, it
  // only means no foreign pedigree can be approved until the association
  // supplies the real list.
  return {
    settingsInserted: inserted,
    settingsFilled: filled,
    settingsPreserved: preserved,
    breedsInserted,
    issuersInserted: 0,
  };
}
