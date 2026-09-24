/**
 * Species enablement — PROMPT-002.
 *
 * The architecture is species-neutral; the launch is not. The dog is the only
 * species open for animal sale, while the shop is open for every species from
 * the start (PRODUCT_DECISIONS §1, §7). That difference lives in data rather
 * than in a constant, so opening a second species later is an audited decision
 * somebody takes with a reason, not a code change nobody can point at.
 *
 * Opening a species for animal sale is also a legal question this package is
 * not allowed to answer, which is why a species the taxonomy gains later starts
 * closed in both markets until someone says otherwise.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { species } from '../db/schema/core.ts';
import { marketplaceSpecies } from '../db/schema/marketplace.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability, isMarket, MARKET_FA, type MarketName } from './model.ts';

export interface MarketSpeciesRow {
  readonly id: string;
  readonly market: MarketName;
  readonly speciesCode: string;
  readonly nameFa: string;
  readonly enabled: boolean;
  readonly reasonFa: string | null;
  readonly version: number;
  readonly updatedAt: Date;
}

/**
 * What each market is open for at launch.
 *
 * Both lines are product decisions, not invented defaults: the dog only for
 * animal sale (§7), every species for the shop (§1). A species that is not
 * named here starts closed in that market.
 */
export const LAUNCH_ENABLED: Record<MarketName, (speciesCode: string) => boolean> = {
  ANIMAL_SALE: (code) => code === 'DOG',
  MERCHANDISE: () => true,
};

/**
 * Create the missing rows, additively, and never overrule a decision somebody
 * already recorded: a row whose version is above 1 has been switched by hand.
 */
export async function ensureMarketSpecies(database: DbClient): Promise<number> {
  const codes = await database.select({ code: species.code }).from(species).orderBy(asc(species.sortOrder));
  let inserted = 0;
  for (const market of ['ANIMAL_SALE', 'MERCHANDISE'] as const) {
    for (const row of codes) {
      const result = await database
        .insert(marketplaceSpecies)
        .values({
          market,
          speciesCode: row.code,
          enabled: LAUNCH_ENABLED[market](row.code),
          reasonFa: 'وضعیت اولیه عرضه طبق تصمیم محصول فاز ۳',
        })
        .onConflictDoNothing({ target: [marketplaceSpecies.market, marketplaceSpecies.speciesCode] })
        .returning({ id: marketplaceSpecies.id });
      inserted += result.length;
    }
  }
  return inserted;
}

export async function marketSpecies(database: DbClient, market?: MarketName): Promise<readonly MarketSpeciesRow[]> {
  const rows = await database
    .select({
      id: marketplaceSpecies.id,
      market: marketplaceSpecies.market,
      speciesCode: marketplaceSpecies.speciesCode,
      nameFa: species.nameFa,
      enabled: marketplaceSpecies.enabled,
      reasonFa: marketplaceSpecies.reasonFa,
      version: marketplaceSpecies.version,
      updatedAt: marketplaceSpecies.updatedAt,
      sortOrder: species.sortOrder,
    })
    .from(marketplaceSpecies)
    .innerJoin(species, eq(species.code, marketplaceSpecies.speciesCode))
    .where(market ? eq(marketplaceSpecies.market, market) : undefined)
    .orderBy(asc(marketplaceSpecies.market), asc(species.sortOrder));
  return rows.map(({ sortOrder: _sortOrder, ...row }) => row as MarketSpeciesRow);
}

/** Read used by the flows of the later prompts. An unknown pair is closed. */
export async function speciesEnabled(
  database: DbClient,
  market: MarketName,
  speciesCode: string,
): Promise<boolean> {
  const [row] = await database
    .select({ enabled: marketplaceSpecies.enabled })
    .from(marketplaceSpecies)
    .where(and(eq(marketplaceSpecies.market, market), eq(marketplaceSpecies.speciesCode, speciesCode)))
    .limit(1);
  return row?.enabled === true;
}

export async function assertSpeciesEnabled(
  database: DbClient,
  market: MarketName,
  speciesCode: string,
): Promise<void> {
  if (await speciesEnabled(database, market, speciesCode)) return;
  throw conflict('این گونه هنوز در ' + MARKET_FA[market] + ' فعال نشده است.');
}

export interface SetSpeciesInput {
  readonly market: string;
  readonly speciesCode: string;
  readonly enabled: boolean;
  readonly reasonFa: string;
  /** Optimistic guard against a decision taken from a stale panel. */
  readonly expectedVersion: number;
}

/**
 * Open or close one species in one market.
 *
 * A reason is required in both directions. Opening a market for a species is a
 * legal and commercial decision, and closing one stops people trading; neither
 * should be readable later as "somebody clicked something".
 */
export async function setSpeciesEnabled(
  database: Database,
  actor: Actor,
  input: SetSpeciesInput,
): Promise<MarketSpeciesRow> {
  assertMarketplaceCapability(actor, 'MARKET_SPECIES_WRITE');
  if (!isMarket(input.market)) throw validation('بازار انتخاب‌شده معتبر نیست.');
  const market = input.market;
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل این تغییر را بنویسید؛ در تاریخچه ثبت می‌شود.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(marketplaceSpecies)
      .where(and(eq(marketplaceSpecies.market, market), eq(marketplaceSpecies.speciesCode, input.speciesCode)))
      .limit(1);
    if (!row) throw notFound('این گونه در فهرست بازار پیدا نشد.');
    if (row.version !== input.expectedVersion) {
      throw conflict('وضعیت این گونه در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.', {
        expectedVersion: input.expectedVersion,
        actualVersion: row.version,
      });
    }
    if (row.enabled === input.enabled) {
      throw validation(input.enabled ? 'این گونه همین حالا فعال است.' : 'این گونه همین حالا غیرفعال است.');
    }

    const [updated] = await tx
      .update(marketplaceSpecies)
      .set({
        enabled: input.enabled,
        reasonFa,
        version: row.version + 1,
        updatedByAccountId: actor.accountId,
        updatedAt: new Date(),
      })
      .where(and(eq(marketplaceSpecies.id, row.id), eq(marketplaceSpecies.version, row.version)))
      .returning();
    if (!updated) throw conflict('وضعیت این گونه هم‌زمان تغییر کرد؛ دوباره تلاش کنید.');

    await recordAudit(tx, actor, {
      action: input.enabled ? 'MARKET_SPECIES_ENABLED' : 'MARKET_SPECIES_DISABLED',
      targetType: 'MARKETPLACE_SPECIES',
      targetId: market + ':' + input.speciesCode,
      targetVersion: updated.version,
      before: { enabled: row.enabled, version: row.version },
      after: { enabled: updated.enabled, version: updated.version },
      reason: reasonFa,
    });

    const [name] = await tx
      .select({ nameFa: species.nameFa })
      .from(species)
      .where(eq(species.code, input.speciesCode))
      .limit(1);

    return {
      id: updated.id,
      market,
      speciesCode: updated.speciesCode,
      nameFa: name?.nameFa ?? updated.speciesCode,
      enabled: updated.enabled,
      reasonFa: updated.reasonFa,
      version: updated.version,
      updatedAt: updated.updatedAt,
    };
  });
}
