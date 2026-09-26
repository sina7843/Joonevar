/**
 * Versioned breed-and-sex rules — PROMPT-002 (DEC-0218).
 *
 * The same write-once shape as the plans: publishing writes a new version and
 * archives the previous one for that (species, breed, sex). A null breed is the
 * species default. The baseline seeded here is only what the product confirmed:
 * male 14 days, female 6 months, warning only. Ages and a kinship threshold stay
 * unset until a superadmin publishes them (DEC-0217 §13).
 */
import { and, asc, desc, eq, isNull, max, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { finderBreedRules } from '../db/schema/finder.ts';
import { referenceBreeds, species } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import { violates } from '../db/constraint.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderCapability, BASELINE_RULES, FINDER_LAUNCH_SPECIES, isRuleMode, ruleProblem } from './model.ts';

export type RuleRow = typeof finderBreedRules.$inferSelect;

const sameKey = (speciesCode: string, breedId: string | null, sex: 'MALE' | 'FEMALE') =>
  and(
    eq(finderBreedRules.speciesCode, speciesCode),
    breedId === null ? isNull(finderBreedRules.breedId) : eq(finderBreedRules.breedId, breedId),
    eq(finderBreedRules.sex, sex),
  );

/**
 * Seed the confirmed baseline for the launch species, once. A (species, sex)
 * that already has any rule — published or archived — is left alone, so a
 * redeploy never overrules a superadmin.
 */
export async function ensureFinderRules(database: DbClient): Promise<number> {
  let inserted = 0;
  for (const rule of BASELINE_RULES) {
    const [existing] = await database
      .select({ id: finderBreedRules.id })
      .from(finderBreedRules)
      .where(sameKey(FINDER_LAUNCH_SPECIES, null, rule.sex))
      .limit(1);
    if (existing) continue;
    await database.insert(finderBreedRules).values({
      speciesCode: FINDER_LAUNCH_SPECIES,
      breedId: null,
      sex: rule.sex,
      version: 1,
      cooldownDays: rule.cooldownDays,
      cooldownMonths: rule.cooldownMonths,
      cooldownMode: 'WARN',
      kinshipMode: 'WARN',
      reasonFa: 'حالت پایه تأییدشده محصول: نر ۱۴ روز، ماده ۶ ماه، فقط هشدار (PRODUCT_DECISIONS §۴).',
    });
    inserted += 1;
  }
  return inserted;
}

export interface PublishRuleInput {
  readonly speciesCode: string;
  readonly breedId: string | null;
  readonly sex: string;
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly cooldownDays: number | null;
  readonly cooldownMonths: number | null;
  readonly cooldownMode: string;
  readonly kinshipMaxDegree: number | null;
  readonly kinshipMode: string;
  readonly warningFa: string | null;
  readonly reasonFa: string;
  /** The version the operator saw for this key; 0 when it had none. */
  readonly expectedCurrentVersion: number;
}

const STALE = 'این قاعده در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.';

export async function publishRule(database: Database, actor: Actor, input: PublishRuleInput): Promise<RuleRow> {
  assertFinderCapability(actor, 'FINDER_CONFIG_WRITE');
  if (input.sex !== 'MALE' && input.sex !== 'FEMALE') throw validation('جنس را انتخاب کنید.');
  if (!isRuleMode(input.cooldownMode) || !isRuleMode(input.kinshipMode)) throw validation('رفتار قاعده را انتخاب کنید.');
  const problem = ruleProblem(input);
  if (problem) throw validation(problem);
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل انتشار این قاعده را بنویسید؛ در تاریخچه ثبت می‌شود.');
  const sex = input.sex;

  const [speciesRow] = await database.select({ code: species.code }).from(species).where(eq(species.code, input.speciesCode)).limit(1);
  if (!speciesRow) throw notFound('این گونه پیدا نشد.');
  if (input.breedId !== null) {
    const [breed] = await database
      .select({ speciesCode: referenceBreeds.speciesCode })
      .from(referenceBreeds)
      .where(eq(referenceBreeds.id, input.breedId))
      .limit(1);
    if (!breed) throw notFound('این نژاد پیدا نشد.');
    if (breed.speciesCode !== input.speciesCode) throw validation('این نژاد به گونه انتخاب‌شده تعلق ندارد.');
  }

  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(finderBreedRules)
        .where(and(sameKey(input.speciesCode, input.breedId, sex), eq(finderBreedRules.status, 'PUBLISHED')))
        .for('update')
        .limit(1);
      if ((current?.version ?? 0) !== input.expectedCurrentVersion) {
        throw conflict(STALE, { expectedVersion: input.expectedCurrentVersion, actualVersion: current?.version ?? 0 });
      }
      const at = new Date();
      if (current) {
        await tx.update(finderBreedRules).set({ status: 'ARCHIVED', archivedAt: at }).where(eq(finderBreedRules.id, current.id));
      }
      const [top] = await tx
        .select({ v: max(finderBreedRules.version) })
        .from(finderBreedRules)
        .where(sameKey(input.speciesCode, input.breedId, sex));
      const [row] = await tx
        .insert(finderBreedRules)
        .values({
          speciesCode: input.speciesCode,
          breedId: input.breedId,
          sex,
          version: (top?.v ?? 0) + 1,
          minAgeMonths: input.minAgeMonths,
          maxAgeMonths: input.maxAgeMonths,
          cooldownDays: input.cooldownDays,
          cooldownMonths: input.cooldownMonths,
          cooldownMode: input.cooldownMode as 'WARN' | 'BLOCK',
          kinshipMaxDegree: input.kinshipMaxDegree,
          kinshipMode: input.kinshipMode as 'WARN' | 'BLOCK',
          warningFa: input.warningFa?.trim() || null,
          reasonFa,
          publishedByAccountId: actor.accountId,
          publishedAt: at,
        })
        .returning();
      await recordAudit(tx, actor, {
        action: 'FINDER_RULE_PUBLISHED',
        targetType: 'FINDER_RULE',
        targetId: input.speciesCode + ':' + (input.breedId ?? '*') + ':' + sex,
        targetVersion: row!.version,
        before: current ? ruleAuditView(current) : null,
        after: ruleAuditView(row!),
        reason: reasonFa,
      });
      return row!;
    });
  } catch (error) {
    if (violates(error, 'finder_rule_one_published_key') || violates(error, 'finder_rule_version_key')) throw conflict(STALE);
    throw error;
  }
}

function ruleAuditView(row: RuleRow) {
  return {
    id: row.id,
    version: row.version,
    minAgeMonths: row.minAgeMonths,
    maxAgeMonths: row.maxAgeMonths,
    cooldownDays: row.cooldownDays,
    cooldownMonths: row.cooldownMonths,
    cooldownMode: row.cooldownMode,
    kinshipMaxDegree: row.kinshipMaxDegree,
    kinshipMode: row.kinshipMode,
  };
}

/**
 * The rule in force for a breed and sex: the breed's own published version, or
 * else the species default, or null when neither exists (NOT_CONFIGURED). The
 * caller records the returned id and version on whatever it decides.
 */
export async function activeRule(
  database: DbClient,
  speciesCode: string,
  breedId: string | null,
  sex: 'MALE' | 'FEMALE',
): Promise<RuleRow | null> {
  const rows = await database
    .select()
    .from(finderBreedRules)
    .where(
      and(
        eq(finderBreedRules.speciesCode, speciesCode),
        eq(finderBreedRules.sex, sex),
        eq(finderBreedRules.status, 'PUBLISHED'),
        breedId === null
          ? isNull(finderBreedRules.breedId)
          : sql`(${finderBreedRules.breedId} = ${breedId} or ${finderBreedRules.breedId} is null)`,
      ),
    );
  return rows.find((r) => r.breedId !== null) ?? rows[0] ?? null;
}

export interface RuleListRow extends RuleRow {
  readonly breedNameFa: string | null;
}

export async function ruleHistory(database: DbClient): Promise<readonly RuleListRow[]> {
  const rows = await database
    .select({ rule: finderBreedRules, breedNameFa: referenceBreeds.nameFa })
    .from(finderBreedRules)
    .leftJoin(referenceBreeds, eq(referenceBreeds.id, finderBreedRules.breedId))
    .orderBy(asc(finderBreedRules.speciesCode), asc(referenceBreeds.nameFa), asc(finderBreedRules.sex), desc(finderBreedRules.version));
  return rows.map((r) => ({ ...r.rule, breedNameFa: r.breedNameFa }));
}
