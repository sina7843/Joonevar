/**
 * The commission formula, as published versions — PROMPT-006.
 *
 * PRODUCT_DECISIONS §5 says the formula is a fixed amount plus a percentage of
 * the locked final price, "by animal kind and seller kind". A single pair of
 * global settings cannot express that, so the formula lives in rows: one
 * published rule per species, optionally narrowed to a seller kind.
 *
 * Publishing is versioned and immutable, like a club's rule version. A deal
 * freezes the id of the rule it was priced by, which is what makes "this is the
 * formula you agreed to" answerable after the tariff has moved on.
 *
 * Nothing is seeded. With no published rule the product falls back to the
 * global managed settings of PROMPT-002, and if those are unset too the deposit
 * path stays shut and says so.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animalCommissionRules } from '../db/schema/deals.ts';
import { recordAudit } from '../audit/service.ts';
import { readSetting, snapshotSetting } from '../settings/service.ts';
import { conflict, notConfigured, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertMarketplaceCapability } from './model.ts';
import type { CommissionInputs } from './inquiry-model.ts';

export type CommissionRuleRow = typeof animalCommissionRules.$inferSelect;

export const COMMISSION_FIXED_KEY = 'market.animal.commission_fixed_toman';
export const COMMISSION_PERCENT_KEY = 'market.animal.commission_percent_bp';
export const COMMISSION_MIN_KEY = 'market.animal.commission_min_toman';
export const COMMISSION_MAX_KEY = 'market.animal.commission_max_toman';

export interface ResolvedCommission {
  readonly inputs: CommissionInputs;
  /** The rule this came from, or null when it came from the global settings. */
  readonly ruleId: string | null;
  /** Human-readable origin, recorded on the deal beside the frozen figures. */
  readonly sourceFa: string;
  /** Which setting versions or rule version produced the numbers. */
  readonly versions: string;
}

/**
 * Which formula applies to this sale.
 *
 * Most specific first: a rule for this species and this seller kind, then one
 * for the species and any seller, then the global settings. Anything else would
 * make an operator's narrow exception silently lose to a broad rule.
 */
export async function resolveCommission(
  database: DbClient,
  scope: { speciesCode: string; sellerKind: 'OWNER' | 'KENNEL' },
): Promise<ResolvedCommission> {
  const [exact] = await database
    .select()
    .from(animalCommissionRules)
    .where(
      and(
        eq(animalCommissionRules.speciesCode, scope.speciesCode),
        eq(animalCommissionRules.sellerKind, scope.sellerKind),
        eq(animalCommissionRules.status, 'PUBLISHED'),
      ),
    )
    .limit(1);

  const [anyKind] = exact
    ? []
    : await database
        .select()
        .from(animalCommissionRules)
        .where(
          and(
            eq(animalCommissionRules.speciesCode, scope.speciesCode),
            isNull(animalCommissionRules.sellerKind),
            eq(animalCommissionRules.status, 'PUBLISHED'),
          ),
        )
        .limit(1);

  const rule = exact ?? anyKind;
  if (rule) {
    return {
      inputs: {
        fixedToman: rule.fixedToman,
        percentBp: rule.percentBp,
        minToman: rule.minToman,
        maxToman: rule.maxToman,
      },
      ruleId: rule.id,
      sourceFa:
        'قاعده کارمزد منتشرشده برای ' +
        scope.speciesCode +
        (rule.sellerKind === null ? ' (همه فروشندگان)' : ' و فروشنده ' + rule.sellerKind) +
        ' — نسخه ' +
        rule.version.toLocaleString('fa-IR'),
      versions: JSON.stringify({ commissionRuleId: rule.id, commissionRuleVersion: rule.version }),
    };
  }

  // No rule for this scope: the global managed values of PROMPT-002, which the
  // deposit path already refuses to open without.
  const fixed = await snapshotSetting(database, COMMISSION_FIXED_KEY);
  const percent = await snapshotSetting(database, COMMISSION_PERCENT_KEY);
  const min = await readSetting(database, COMMISSION_MIN_KEY);
  const max = await readSetting(database, COMMISSION_MAX_KEY);

  const percentBp = Number(percent.value);
  if (!Number.isInteger(percentBp) || percentBp < 0 || percentBp > 10_000) throw notConfigured(COMMISSION_PERCENT_KEY);

  return {
    inputs: {
      fixedToman: BigInt(String(fixed.value)),
      percentBp,
      minToman: min.configured ? BigInt(String(min.value)) : null,
      maxToman: max.configured ? BigInt(String(max.value)) : null,
    },
    ruleId: null,
    sourceFa: 'تنظیمات عمومی کارمزد بازار حیوان (بدون قاعده اختصاصی برای این گونه)',
    versions: JSON.stringify({
      [COMMISSION_FIXED_KEY]: fixed.version,
      [COMMISSION_PERCENT_KEY]: percent.version,
      [COMMISSION_MIN_KEY]: min.configured ? min.version : null,
      [COMMISSION_MAX_KEY]: max.configured ? max.version : null,
    }),
  };
}

export interface PublishRuleInput {
  readonly speciesCode: string;
  readonly sellerKind: 'OWNER' | 'KENNEL' | null;
  readonly fixedToman: bigint;
  readonly percentBp: number;
  readonly minToman: bigint | null;
  readonly maxToman: bigint | null;
  readonly noteFa: string;
}

/**
 * Publish a formula.
 *
 * The previous published rule for the same scope is archived in the same
 * transaction, so there is never a moment with two live formulas and never a
 * moment with none. Deals already struck keep pointing at the archived row.
 */
export async function publishCommissionRule(
  database: Database,
  actor: Actor,
  input: PublishRuleInput,
): Promise<CommissionRuleRow> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const noteFa = input.noteFa.trim();
  if (noteFa === '') throw validation('دلیل یا توضیح این نسخه را بنویسید؛ در تاریخچه ثبت می‌شود.');
  if (input.fixedToman < 0n) throw validation('بخش ثابت کارمزد نمی‌تواند منفی باشد.');
  if (!Number.isInteger(input.percentBp) || input.percentBp < 0 || input.percentBp > 10_000) {
    throw validation('درصد کارمزد باید عددی بین ۰ تا ۱۰۰۰۰ در واحد basis point باشد.');
  }
  if (input.minToman !== null && input.maxToman !== null && input.maxToman < input.minToman) {
    throw validation('سقف کارمزد نمی‌تواند کمتر از کف آن باشد.');
  }

  return database.transaction(async (tx) => {
    const scope = and(
      eq(animalCommissionRules.speciesCode, input.speciesCode),
      input.sellerKind === null
        ? isNull(animalCommissionRules.sellerKind)
        : eq(animalCommissionRules.sellerKind, input.sellerKind),
    );

    const [live] = await tx
      .select()
      .from(animalCommissionRules)
      .where(and(scope, eq(animalCommissionRules.status, 'PUBLISHED')))
      .limit(1);

    const [previous] = await tx
      .select({ version: animalCommissionRules.version })
      .from(animalCommissionRules)
      .where(scope)
      .orderBy(desc(animalCommissionRules.version))
      .limit(1);

    if (live) {
      await tx
        .update(animalCommissionRules)
        .set({ status: 'ARCHIVED', archivedAt: new Date() })
        .where(and(eq(animalCommissionRules.id, live.id), eq(animalCommissionRules.status, 'PUBLISHED')));
    }

    const [created] = await tx
      .insert(animalCommissionRules)
      .values({
        speciesCode: input.speciesCode,
        sellerKind: input.sellerKind,
        fixedToman: input.fixedToman,
        percentBp: input.percentBp,
        minToman: input.minToman,
        maxToman: input.maxToman,
        status: 'PUBLISHED',
        version: (previous?.version ?? 0) + 1,
        noteFa,
        createdByAccountId: actor.accountId,
        publishedAt: new Date(),
      })
      .returning();

    await recordAudit(tx, actor, {
      action: 'ANIMAL_COMMISSION_RULE_PUBLISHED',
      targetType: 'ANIMAL_COMMISSION_RULE',
      targetId: created!.id,
      before: live
        ? { ruleId: live.id, version: live.version, fixedToman: live.fixedToman.toString(), percentBp: live.percentBp }
        : undefined,
      after: {
        speciesCode: input.speciesCode,
        sellerKind: input.sellerKind,
        version: created!.version,
        fixedToman: input.fixedToman.toString(),
        percentBp: input.percentBp,
        minToman: input.minToman?.toString() ?? null,
        maxToman: input.maxToman?.toString() ?? null,
      },
      reason: noteFa,
    });
    return created!;
  });
}

/** Every rule ever published for this market, newest first. */
export async function commissionRuleHistory(
  database: DbClient,
  actor: Actor,
): Promise<readonly CommissionRuleRow[]> {
  assertMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW');
  return database
    .select()
    .from(animalCommissionRules)
    .orderBy(desc(animalCommissionRules.createdAt));
}

/** The rule a deal was priced by, for the screen that explains a deposit. */
export async function commissionRule(database: DbClient, ruleId: string): Promise<CommissionRuleRow> {
  const [row] = await database
    .select()
    .from(animalCommissionRules)
    .where(eq(animalCommissionRules.id, ruleId))
    .limit(1);
  if (!row) throw notFound('این قاعده کارمزد پیدا نشد.');
  return row;
}

/** Guard for the screens that may only be reached while the market is open. */
export function assertRuleScope(sellerKind: string | null): asserts sellerKind is 'OWNER' | 'KENNEL' | null {
  if (sellerKind !== null && sellerKind !== 'OWNER' && sellerKind !== 'KENNEL') {
    throw conflict('نوع فروشنده انتخاب‌شده معتبر نیست.');
  }
}
