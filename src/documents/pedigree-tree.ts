/**
 * The three-generation ancestor list a pedigree prints (DS PedigreeTree).
 *
 * Parents come from the issued document, which froze them at issuance; the
 * grandparents are read from those parents' own records. An ancestor that is
 * not in Hamzist is shown as «نامشخص» with the reason, never as a dash.
 */
import { eq, inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { generationLabel } from '../domain/lineage.ts';
import type { PedigreeNode, PedigreeSheet } from './render.ts';

const SEX_FA: Record<string, string> = { MALE: 'نر', FEMALE: 'ماده' };

type AnimalRow = typeof animals.$inferSelect;

function node(roleFa: string, id: string | null, rows: ReadonlyMap<string, AnimalRow>): PedigreeNode {
  const row = id ? rows.get(id) : undefined;
  if (!row) return { roleFa, nameFa: null, unknownFa: id ? 'پرونده در همزیست در دسترس نیست' : 'در همزیست ثبت نشده' };
  return { roleFa, nameFa: row.name ?? 'بدون نام', metaFa: generationLabel(row.generation) };
}

export async function pedigreeSheetOf(
  database: DbClient,
  input: { animalId: string; sireAnimalId: string | null; damAnimalId: string | null },
): Promise<PedigreeSheet> {
  const [subject] = await database.select().from(animals).where(eq(animals.id, input.animalId));
  const parentIds = [input.sireAnimalId, input.damAnimalId].filter((v): v is string => v !== null);
  const parents = parentIds.length ? await database.select().from(animals).where(inArray(animals.id, parentIds)) : [];
  const byId = new Map<string, AnimalRow>(parents.map((row) => [row.id, row]));
  const sire = input.sireAnimalId ? byId.get(input.sireAnimalId) : undefined;
  const dam = input.damAnimalId ? byId.get(input.damAnimalId) : undefined;
  const grandIds = [sire?.sireAnimalId, sire?.damAnimalId, dam?.sireAnimalId, dam?.damAnimalId].filter((v): v is string => !!v);
  const grands = grandIds.length ? await database.select().from(animals).where(inArray(animals.id, grandIds)) : [];
  for (const row of grands) byId.set(row.id, row);

  const [breed] = subject?.breedId
    ? await database.select().from(referenceBreeds).where(eq(referenceBreeds.id, subject.breedId))
    : [];
  const meta = [breed?.nameFa, subject?.sex ? SEX_FA[subject.sex] : null, subject ? generationLabel(subject.generation) : null]
    .filter((v): v is string => !!v)
    .join(' · ');

  return {
    subject: { nameFa: subject?.name ?? 'بدون نام', metaFa: meta },
    parents: [node('پدر', input.sireAnimalId, byId), node('مادر', input.damAnimalId, byId)],
    grandparents: [
      node('پدرِ پدر', sire?.sireAnimalId ?? null, byId),
      node('مادرِ پدر', sire?.damAnimalId ?? null, byId),
      node('پدرِ مادر', dam?.sireAnimalId ?? null, byId),
      node('مادرِ مادر', dam?.damAnimalId ?? null, byId),
    ],
  };
}
