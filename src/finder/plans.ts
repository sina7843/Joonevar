/**
 * Finder plan versions — PROMPT-002 (DEC-0218).
 *
 * A plan is never edited: publishing writes a new immutable version and archives
 * the one it replaces, in one transaction, under a guard that names the version
 * the operator was looking at. A subscription copies the version it bought, so
 * nothing here can rewrite what somebody already paid for.
 */
import { and, asc, desc, eq, max } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { finderPlanVersions } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { violates } from '../db/constraint.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { toman } from '../domain/money.ts';
import type { Actor } from '../authz/actor.ts';
import {
  assertFinderCapability,
  FINDER_AUDIENCES,
  FINDER_DURATIONS,
  isFinderAudience,
  isFinderDuration,
  isSuspensionPolicy,
  planPurchaseProblem,
  type FinderAudience,
  type FinderDuration,
} from './model.ts';

export type PlanVersionRow = typeof finderPlanVersions.$inferSelect;

export interface PublishPlanInput {
  readonly audience: string;
  readonly durationMonths: number;
  readonly titleFa: string;
  /** Null or empty = price not set yet; the plan is shown but not sold. */
  readonly priceToman: string | null;
  readonly activeAnimalCapacity: number;
  readonly purchasableFrom: Date | null;
  readonly purchasableUntil: Date | null;
  readonly suspensionPolicy: string;
  readonly noteFa: string | null;
  readonly reasonFa: string;
  /** The version the operator saw for this slot; 0 when the slot was empty. */
  readonly expectedCurrentVersion: number;
}

const STALE = 'این طرح در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.';

export async function publishPlan(database: Database, actor: Actor, input: PublishPlanInput): Promise<PlanVersionRow> {
  assertFinderCapability(actor, 'FINDER_CONFIG_WRITE');
  if (!isFinderAudience(input.audience)) throw validation('نوع طرح معتبر نیست.');
  if (!isFinderDuration(input.durationMonths)) throw validation('مدت طرح فقط یک، سه، شش یا دوازده ماه است.');
  if (!isSuspensionPolicy(input.suspensionPolicy)) throw validation('سیاست تعلیق را انتخاب کنید.');
  const titleFa = input.titleFa.trim();
  const reasonFa = input.reasonFa.trim();
  if (titleFa === '') throw validation('عنوان طرح را بنویسید.');
  if (reasonFa === '') throw validation('دلیل انتشار این نسخه را بنویسید؛ در تاریخچه ثبت می‌شود.');
  if (!Number.isInteger(input.activeAnimalCapacity) || input.activeAnimalCapacity < 1) {
    throw validation('ظرفیت حیوان فعال باید عدد صحیح و دست‌کم یک باشد.');
  }
  const rawPrice = input.priceToman?.trim() ?? '';
  if (rawPrice !== '' && !/^\d{1,15}$/.test(rawPrice)) throw validation('قیمت را به تومان و فقط با رقم وارد کنید.');
  const priceToman = rawPrice === '' ? null : toman(rawPrice);
  if (priceToman !== null && priceToman <= 0n) throw validation('قیمت باید بیشتر از صفر باشد؛ برای «هنوز تعیین نشده» خالی بگذارید.');
  if (input.purchasableFrom && input.purchasableUntil && input.purchasableFrom >= input.purchasableUntil) {
    throw validation('شروع بازه فروش باید پیش از پایان آن باشد.');
  }
  const audience = input.audience;
  const durationMonths = input.durationMonths;

  try {
    return await database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(finderPlanVersions)
        .where(
          and(
            eq(finderPlanVersions.audience, audience),
            eq(finderPlanVersions.durationMonths, durationMonths),
            eq(finderPlanVersions.status, 'PUBLISHED'),
          ),
        )
        .for('update')
        .limit(1);
      if ((current?.version ?? 0) !== input.expectedCurrentVersion) {
        throw conflict(STALE, { expectedVersion: input.expectedCurrentVersion, actualVersion: current?.version ?? 0 });
      }
      const at = new Date();
      if (current) {
        const [archived] = await tx
          .update(finderPlanVersions)
          .set({ status: 'ARCHIVED', archivedAt: at, archivedByAccountId: actor.accountId, archiveReasonFa: 'جایگزین با نسخه تازه' })
          .where(and(eq(finderPlanVersions.id, current.id), eq(finderPlanVersions.status, 'PUBLISHED')))
          .returning({ id: finderPlanVersions.id });
        if (!archived) throw conflict(STALE);
      }
      const [top] = await tx
        .select({ v: max(finderPlanVersions.version) })
        .from(finderPlanVersions)
        .where(and(eq(finderPlanVersions.audience, audience), eq(finderPlanVersions.durationMonths, durationMonths)));
      const [row] = await tx
        .insert(finderPlanVersions)
        .values({
          audience,
          durationMonths,
          version: (top?.v ?? 0) + 1,
          titleFa,
          priceToman,
          activeAnimalCapacity: input.activeAnimalCapacity,
          purchasableFrom: input.purchasableFrom,
          purchasableUntil: input.purchasableUntil,
          suspensionPolicy: input.suspensionPolicy as never,
          noteFa: input.noteFa?.trim() || null,
          reasonFa,
          publishedByAccountId: actor.accountId,
          publishedAt: at,
        })
        .returning();

      await recordAudit(tx, actor, {
        action: 'FINDER_PLAN_PUBLISHED',
        targetType: 'FINDER_PLAN',
        targetId: audience + ':' + durationMonths,
        targetVersion: row!.version,
        before: current ? planAuditView(current) : null,
        after: planAuditView(row!),
        reason: reasonFa,
      });
      return row!;
    });
  } catch (error) {
    if (violates(error, 'finder_plan_one_published_key') || violates(error, 'finder_plan_version_key')) {
      throw conflict(STALE);
    }
    throw error;
  }
}

/** Stop selling a slot without replacing it. Periods already bought keep their snapshot. */
export async function withdrawPlan(
  database: Database,
  actor: Actor,
  input: { planVersionId: string; expectedVersion: number; reasonFa: string },
): Promise<void> {
  assertFinderCapability(actor, 'FINDER_CONFIG_WRITE');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa === '') throw validation('دلیل توقف فروش را بنویسید.');
  await database.transaction(async (tx) => {
    const [row] = await tx.select().from(finderPlanVersions).where(eq(finderPlanVersions.id, input.planVersionId)).limit(1);
    if (!row) throw notFound('این طرح پیدا نشد.');
    const [archived] = await tx
      .update(finderPlanVersions)
      .set({ status: 'ARCHIVED', archivedAt: new Date(), archivedByAccountId: actor.accountId, archiveReasonFa: reasonFa })
      .where(
        and(
          eq(finderPlanVersions.id, row.id),
          eq(finderPlanVersions.status, 'PUBLISHED'),
          eq(finderPlanVersions.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!archived) throw conflict(STALE);
    await recordAudit(tx, actor, {
      action: 'FINDER_PLAN_WITHDRAWN',
      targetType: 'FINDER_PLAN',
      targetId: row.audience + ':' + row.durationMonths,
      targetVersion: row.version,
      before: planAuditView(row),
      after: { status: 'ARCHIVED' },
      reason: reasonFa,
    });
  });
}

function planAuditView(row: PlanVersionRow) {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    titleFa: row.titleFa,
    priceToman: row.priceToman === null ? null : row.priceToman.toString(),
    activeAnimalCapacity: row.activeAnimalCapacity,
    purchasableFrom: row.purchasableFrom?.toISOString() ?? null,
    purchasableUntil: row.purchasableUntil?.toISOString() ?? null,
    suspensionPolicy: row.suspensionPolicy,
  };
}

export interface PlanSlot {
  readonly audience: FinderAudience;
  readonly durationMonths: FinderDuration;
  readonly current: PlanVersionRow | null;
  /** Why it cannot be bought now, or null. */
  readonly problemFa: string | null;
}

/** All eight slots (two audiences × four durations), empty ones included. */
export async function planSlots(database: DbClient, now: Date = new Date()): Promise<readonly PlanSlot[]> {
  const rows = await database.select().from(finderPlanVersions).where(eq(finderPlanVersions.status, 'PUBLISHED'));
  return FINDER_AUDIENCES.flatMap((audience) =>
    FINDER_DURATIONS.map((durationMonths) => {
      const current = rows.find((r) => r.audience === audience && r.durationMonths === durationMonths) ?? null;
      return {
        audience,
        durationMonths,
        current,
        problemFa: current ? planPurchaseProblem(current, now) : 'این طرح هنوز منتشر نشده است.',
      };
    }),
  );
}

export async function planHistory(database: DbClient): Promise<readonly PlanVersionRow[]> {
  return database
    .select()
    .from(finderPlanVersions)
    .orderBy(asc(finderPlanVersions.audience), asc(finderPlanVersions.durationMonths), desc(finderPlanVersions.version));
}
