/**
 * Finder kill switches — reading side (PROMPT-002).
 *
 * Writing is the ordinary settings update, so throwing a switch is versioned,
 * audited and restricted to the MATING_FINDER group's writers. An unset switch
 * reads as closed.
 */
import { inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { productSettings } from '../db/schema/core.ts';
import { readFlag } from '../settings/service.ts';
import { conflict } from '../domain/errors.ts';
import { FINDER_FLAGS, finderFlag, type FinderFlagKey } from './model.ts';

export const finderFlagEnabled = (database: DbClient, key: FinderFlagKey): Promise<boolean> => readFlag(database, key);

/** CONFLICT, not FORBIDDEN: the person may do this, the flow is simply shut right now. */
export async function assertFinderFlag(database: DbClient, key: FinderFlagKey): Promise<void> {
  if (await readFlag(database, key)) return;
  throw conflict(finderFlag(key)?.closedFa ?? 'این بخش در حال حاضر بسته است.');
}

export interface FinderFlagState {
  readonly key: FinderFlagKey;
  readonly labelFa: string;
  readonly enabled: boolean;
  readonly version: number;
}

export async function finderFlagStates(database: DbClient): Promise<readonly FinderFlagState[]> {
  const rows = await database
    .select({ key: productSettings.key, value: productSettings.value, version: productSettings.version })
    .from(productSettings)
    .where(inArray(productSettings.key, FINDER_FLAGS.map((f) => f.key)));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return FINDER_FLAGS.map((flag) => ({
    key: flag.key,
    labelFa: flag.labelFa,
    enabled: byKey.get(flag.key)?.value === true,
    version: byKey.get(flag.key)?.version ?? 1,
  }));
}
