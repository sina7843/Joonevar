/**
 * The derived last mating — PHASE-4 PROMPT-003 (R5, DEC-0217 §7).
 *
 * One read model, `animal_last_mating`, computed from mutually CONFIRMED dates
 * only. Nothing sets it directly: the transaction that confirms a date calls
 * `refreshLastMating` for both animals, and `rebuildLastMating` recomputes it
 * from the sources for any set of animals — both run the same query, so the
 * incremental and the rebuilt answer cannot drift apart.
 *
 * Sources: `mating_date_declaration` rows with status CONFIRMED, whether they
 * belong to an official permit (OFFICIAL) or to a contract-backed personal
 * mating (FINDER_PERSONAL, PROMPT-006). Never a source: PROPOSED, CONFLICTED,
 * SUPERSEDED, and any legacy personal declaration or note — those live in other
 * tables and this query does not read them.
 */
import { inArray, sql } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { animalLastMatings } from '../db/schema/finder.ts';

export interface LastMatingRow {
  readonly animalId: string;
  readonly lastMatedOn: string;
  readonly source: 'OFFICIAL' | 'FINDER_PERSONAL';
  readonly sourceId: string;
  readonly confirmedCount: number;
}

/** The newest confirmed event per animal, with the count, straight from the sources. */
async function computeFromSources(tx: DbClient, animalIds: readonly string[] | null) {
  const filter = animalIds === null ? sql`true` : sql`x.animal_id in (${sql.join(animalIds.map((id) => sql`${id}::uuid`), sql`, `)})`;
  const result = await tx.execute<{
    animal_id: string;
    mated_on: string;
    id: string;
    source: 'OFFICIAL' | 'FINDER_PERSONAL';
    confirmed_at: Date | null;
    confirmed_count: number;
  }>(sql`
    select distinct on (x.animal_id)
      x.animal_id, x.mated_on, x.id, x.source, x.confirmed_at, (count(*) over (partition by x.animal_id))::int as confirmed_count
    from (
      select d.id, d.mated_on, d.confirmed_at, 'OFFICIAL' as source, a.animal_id
        from mating_date_declaration d
        join mating_permit p on p.id = d.permit_id
        cross join lateral (values (p.sire_animal_id), (p.dam_animal_id)) a(animal_id)
        where d.status = 'CONFIRMED'
      union all
      select d.id, d.mated_on, d.confirmed_at, 'FINDER_PERSONAL' as source, a.animal_id
        from mating_date_declaration d
        join finder_personal_mating m on m.id = d.personal_mating_id
        cross join lateral (values (m.sire_animal_id), (m.dam_animal_id)) a(animal_id)
        where d.status = 'CONFIRMED'
    ) x
    where ${filter}
    order by x.animal_id, x.mated_on desc, x.confirmed_at desc nulls last, x.id desc
  `);
  return result.rows;
}

type SourceRow = Awaited<ReturnType<typeof computeFromSources>>[number];

/** A raw row as the projection stores it; the driver hands timestamps back as text here. */
const toValues = (row: SourceRow) => ({
  animalId: row.animal_id,
  lastMatedOn: String(row.mated_on).slice(0, 10),
  source: row.source,
  sourceId: row.id,
  confirmedAt: row.confirmed_at === null ? null : new Date(row.confirmed_at),
  confirmedCount: Number(row.confirmed_count),
});

/**
 * Recompute the projection for these animals inside the caller's transaction.
 * A per-animal advisory lock, taken in id order, serialises two confirmations
 * touching the same animal, so the second one reads the first one's row.
 */
export async function refreshLastMating(tx: DbClient, animalIds: readonly string[]): Promise<void> {
  const ids = [...new Set(animalIds)].sort();
  if (ids.length === 0) return;
  for (const id of ids) await tx.execute(sql`select pg_advisory_xact_lock(hashtext('animal_last_mating:' || ${id}))`);
  const rows = await computeFromSources(tx, ids);
  await tx.delete(animalLastMatings).where(inArray(animalLastMatings.animalId, ids));
  if (rows.length === 0) return;
  await tx.insert(animalLastMatings).values(
rows.map(toValues),
  );
}

/** Rebuild the whole projection (or some animals) from the sources. Idempotent. */
export async function rebuildLastMating(database: DbClient, animalIds: readonly string[] | null = null): Promise<number> {
  if (animalIds !== null) {
    await refreshLastMating(database, animalIds);
    return animalIds.length;
  }
  const rows = await computeFromSources(database, null);
  await database.delete(animalLastMatings);
  if (rows.length > 0) {
    await database.insert(animalLastMatings).values(
rows.map(toValues),
    );
  }
  return rows.length;
}

export async function lastMatingsOf(database: DbClient, animalIds: readonly string[]): Promise<Map<string, LastMatingRow>> {
  if (animalIds.length === 0) return new Map();
  const rows = await database.select().from(animalLastMatings).where(inArray(animalLastMatings.animalId, [...animalIds]));
  return new Map(
    rows.map((row) => [
      row.animalId,
      { animalId: row.animalId, lastMatedOn: row.lastMatedOn, source: row.source, sourceId: row.sourceId, confirmedCount: row.confirmedCount },
    ]),
  );
}
