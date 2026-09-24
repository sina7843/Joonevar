/**
 * Kill switches — PROMPT-002.
 *
 * A flag is a BOOL product setting, so throwing one is versioned, audited and
 * permission-checked by machinery that already exists (DEC-0204). This module
 * is only the reading side and the refusal text.
 *
 * Two rules it keeps:
 *  - an unset flag is closed, never open, so a value nobody entered can never
 *    open a flow;
 *  - a closed flow refuses in Persian with the reason, rather than rendering an
 *    empty page that looks broken.
 */
import { inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { productSettings } from '../db/schema/core.ts';
import { conflict } from '../domain/errors.ts';
import { MARKET_FLAGS, MARKET_FLAG_KEYS, marketFlag, type MarketFlagKey } from './model.ts';

export interface FlagState {
  readonly key: MarketFlagKey;
  readonly labelFa: string;
  readonly noteFa: string | null;
  readonly enabled: boolean;
  /** A flag nobody has ever set reads as closed, and the panel says which it is. */
  readonly configured: boolean;
  readonly version: number;
  readonly updatedAt: Date;
}

/** Every switch and its current state, in catalogue order. */
export async function flagStates(database: DbClient): Promise<readonly FlagState[]> {
  const rows = await database
    .select({
      key: productSettings.key,
      value: productSettings.value,
      noteFa: productSettings.noteFa,
      version: productSettings.version,
      updatedAt: productSettings.updatedAt,
    })
    .from(productSettings)
    .where(inArray(productSettings.key, [...MARKET_FLAG_KEYS]));

  const byKey = new Map(rows.map((row) => [row.key, row]));
  return MARKET_FLAGS.map((flag) => {
    const row = byKey.get(flag.key);
    return {
      key: flag.key,
      labelFa: flag.labelFa,
      noteFa: row?.noteFa ?? null,
      enabled: row?.value === true,
      configured: row !== undefined && row.value !== null,
      version: row?.version ?? 1,
      updatedAt: row?.updatedAt ?? new Date(0),
    };
  });
}

export async function flagEnabled(database: DbClient, key: MarketFlagKey): Promise<boolean> {
  const [row] = await database
    .select({ value: productSettings.value })
    .from(productSettings)
    .where(inArray(productSettings.key, [key]))
    .limit(1);
  return row?.value === true;
}

/**
 * Gate used by every flow this prompt's successors build.
 *
 * `CONFLICT` rather than `FORBIDDEN`: the person is not doing anything they are
 * not allowed to do, the flow is simply shut at the moment.
 */
export async function assertFlagEnabled(database: DbClient, key: MarketFlagKey): Promise<void> {
  if (await flagEnabled(database, key)) return;
  throw conflict(marketFlag(key)?.closedFa ?? 'این بخش در حال حاضر بسته است.');
}
