/**
 * Blocks between people and sanctions by operators — PHASE-4 PROMPT-007.
 *
 * A block is one person's choice and works both ways across the finder: the two
 * stop seeing each other's profiles, cannot send each other a request and cannot
 * write in a shared conversation. The other person is never told who blocked
 * whom; they just find nothing, the same answer a profile they may not see gives.
 *
 * A sanction is an operator's decision with a reason. FINDER_ACCESS stops new
 * finder actions and takes the account's profiles off the finder; ACCOUNT also
 * refuses sign-in. Neither refunds, extends or pauses a subscription beyond what
 * that period's snapshotted policy already says. Lifting keeps the row.
 */
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { sessions } from '../db/schema/identity.ts';
import { animals } from '../db/schema/animals.ts';
import { accountSanctions } from '../db/schema/moderation.ts';
import { finderUserBlocks, matingProfiles, matingRequests } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderCapability } from './model.ts';
import { deactivateProfileOf } from './profiles.ts';
import { loadForParty, moveRequest, releaseCoordination } from './requests.ts';
import { PRE_CONTRACT_STATUSES } from './request-model.ts';

export type SanctionRow = typeof accountSanctions.$inferSelect;
export type SanctionScope = 'FINDER_ACCESS' | 'ACCOUNT';

/** Never promise money back: the text every sanction screen and notice carries. */
export const NO_REFUND_FA =
  'تعلیق یا محدودیت هیچ بازپرداخت خودکاری برای اشتراک ایجاد نمی‌کند؛ دوره اشتراک طبق سیاست تعلیقِ همان دوره ادامه می‌یابد یا متوقف می‌شود.';
export const SUSPENDED_FA = 'دسترسی جفت‌یابی این حساب در حال حاضر تعلیق است.';

const active = (now: Date) => and(isNull(accountSanctions.liftedAt), or(isNull(accountSanctions.endsAt), gt(accountSanctions.endsAt, now)));

export async function activeSanction(db: DbClient, accountId: string, now: Date = new Date()): Promise<SanctionRow | null> {
  const [row] = await db
    .select()
    .from(accountSanctions)
    .where(and(eq(accountSanctions.accountId, accountId), active(now)))
    .orderBy(desc(accountSanctions.createdAt))
    .limit(1);
  return row ?? null;
}

/** Every new finder action by this account passes here; cancelling and reporting do not. */
export async function assertFinderAccess(db: DbClient, accountId: string, now: Date = new Date()): Promise<void> {
  if (await activeSanction(db, accountId, now)) throw forbidden(SUSPENDED_FA + ' ' + NO_REFUND_FA);
}

/**
 * Suspend finder access, or restrict the whole account. The account's profiles
 * leave the finder (their open requests close with the reason, a confirmed
 * contract stays); an ACCOUNT restriction also refuses sign-in and ends every
 * session now.
 */
export async function imposeSanction(
  db: Database,
  actor: Actor,
  input: { accountId: string; scope: SanctionScope; reasonFa: string; days?: number | null; reportId?: string | null },
  now: Date = new Date(),
): Promise<SanctionRow> {
  assertFinderCapability(actor, input.scope === 'ACCOUNT' ? 'FINDER_ACCOUNT_RESTRICT' : 'FINDER_ACCESS_SUSPEND');
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 5) throw validation('دلیل را کامل بنویسید؛ در سابقه و برای اعتراض می‌ماند.');
  if (input.days !== null && input.days !== undefined && (!Number.isInteger(input.days) || input.days < 1 || input.days > 3650)) {
    throw validation('مدت را به روز و به‌صورت عدد صحیح وارد کنید.');
  }
  if (input.accountId === actor.accountId) throw validation('نمی‌توانید برای حساب خودتان محدودیت ثبت کنید.');
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ id: accounts.id, status: accounts.status }).from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
    if (!account) throw notFound('حساب پیدا نشد.');
    const [row] = await tx
      .insert(accountSanctions)
      .values({
        accountId: input.accountId,
        scope: input.scope,
        reasonFa,
        reportId: input.reportId ?? null,
        startsAt: now,
        endsAt: input.days ? new Date(now.getTime() + input.days * 86_400_000) : null,
        createdByAccountId: actor.accountId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict('برای این حساب همین حالا یک محدودیت باز از همین نوع هست.');
    const owned = await tx
      .select({ animalId: matingProfiles.animalId })
      .from(matingProfiles)
      .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
      .where(and(eq(matingProfiles.ownerAccountId, input.accountId), sql`${matingProfiles.state} <> 'INACTIVE'`));
    for (const { animalId } of owned) await deactivateProfileOf(tx, animalId, 'SUSPENSION', actor, reasonFa, now);
    if (input.scope === 'ACCOUNT') {
      await tx.update(accounts).set({ status: 'DISABLED', updatedAt: now }).where(eq(accounts.id, input.accountId));
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.accountId, input.accountId), isNull(sessions.revokedAt)));
    }
    await recordAudit(tx, actor, {
      action: input.scope === 'ACCOUNT' ? 'ACCOUNT_RESTRICTED' : 'FINDER_ACCESS_SUSPENDED',
      targetType: 'ACCOUNT',
      targetId: input.accountId,
      after: { sanctionId: row.id, endsAt: row.endsAt, reportId: row.reportId, profilesClosed: owned.length, refund: false },
      reason: reasonFa,
    });
    return row;
  });
}

export async function liftSanction(db: Database, actor: Actor, input: { sanctionId: string; reasonFa: string }, now: Date = new Date()): Promise<SanctionRow> {
  const reasonFa = input.reasonFa.trim();
  if (reasonFa.length < 5) throw validation('دلیل رفع محدودیت را بنویسید.');
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(accountSanctions).where(eq(accountSanctions.id, input.sanctionId)).for('update').limit(1);
    if (!current) throw notFound('محدودیت پیدا نشد.');
    assertFinderCapability(actor, current.scope === 'ACCOUNT' ? 'FINDER_ACCOUNT_RESTRICT' : 'FINDER_ACCESS_SUSPEND');
    if (current.liftedAt) throw conflict('این محدودیت پیش‌تر رفع شده است.');
    const [row] = await tx
      .update(accountSanctions)
      .set({ liftedAt: now, liftedByAccountId: actor.accountId, liftReasonFa: reasonFa })
      .where(eq(accountSanctions.id, current.id))
      .returning();
    if (current.scope === 'ACCOUNT') {
      // Back to a usable account; a profile that was never completed stays incomplete.
      await tx.update(accounts).set({ status: 'ACTIVE', updatedAt: now }).where(and(eq(accounts.id, current.accountId), eq(accounts.status, 'DISABLED')));
    }
    await recordAudit(tx, actor, {
      action: 'ACCOUNT_SANCTION_LIFTED',
      targetType: 'ACCOUNT',
      targetId: current.accountId,
      before: { sanctionId: current.id, scope: current.scope },
      reason: reasonFa,
    });
    return row!;
  });
}

export async function sanctionsList(db: DbClient, actor: Actor) {
  assertFinderCapability(actor, 'FINDER_ACCESS_SUSPEND');
  return db.select().from(accountSanctions).orderBy(desc(accountSanctions.createdAt)).limit(200);
}

// ── blocks ───────────────────────────────────────────────────────────────────

/** True when either person has blocked the other. */
export async function blockedBetween(db: DbClient, a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: finderUserBlocks.id })
    .from(finderUserBlocks)
    .where(
      and(
        isNull(finderUserBlocks.liftedAt),
        or(
          and(eq(finderUserBlocks.blockerAccountId, a), eq(finderUserBlocks.blockedAccountId, b)),
          and(eq(finderUserBlocks.blockerAccountId, b), eq(finderUserBlocks.blockedAccountId, a)),
        ),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** SQL for "neither of these two accounts blocked the other", for list queries. */
export const notBlockedSql = (viewer: string, ownerColumn: unknown) => sql`not exists (
  select 1 from finder_user_block b where b.lifted_at is null and (
    (b.blocker_account_id = ${viewer}::uuid and b.blocked_account_id = ${ownerColumn})
    or (b.blocked_account_id = ${viewer}::uuid and b.blocker_account_id = ${ownerColumn})))`;

/**
 * Block the other person of a request, or the owner of a profile. The browser
 * names a request or a profile it can already see, never an account id, so this
 * cannot be used to probe which accounts exist.
 */
export async function blockPerson(db: Database, actor: Actor, input: { requestId?: string; profileId?: string }, now: Date = new Date()) {
  return db.transaction(async (tx) => {
    let target: string | null = null;
    if (input.requestId) {
      const { request } = await loadForParty(tx, actor, input.requestId);
      target = request.senderAccountId === actor.accountId ? request.receiverAccountId : request.senderAccountId;
    } else if (input.profileId && /^[0-9a-f-]{36}$/i.test(input.profileId)) {
      const [p] = await tx.select({ owner: matingProfiles.ownerAccountId }).from(matingProfiles).where(eq(matingProfiles.id, input.profileId)).limit(1);
      target = p?.owner ?? null;
    }
    if (!target) throw notFound('پیدا نشد.');
    if (target === actor.accountId) throw validation('نمی‌توانید خودتان را مسدود کنید.');
    const [row] = await tx
      .insert(finderUserBlocks)
      .values({ blockerAccountId: actor.accountId, blockedAccountId: target, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await recordAudit(tx, actor, { action: 'FINDER_USER_BLOCKED', targetType: 'FINDER_USER_BLOCK', targetId: row.id });
      // Open requests between the two close with a neutral reason: nobody is told who blocked whom.
      const open = await tx
        .select()
        .from(matingRequests)
        .where(
          and(
            inArray(matingRequests.status, [...PRE_CONTRACT_STATUSES]),
            or(
              and(eq(matingRequests.senderAccountId, actor.accountId), eq(matingRequests.receiverAccountId, target)),
              and(eq(matingRequests.senderAccountId, target), eq(matingRequests.receiverAccountId, actor.accountId)),
            ),
          ),
        )
        .for('update');
      for (const request of open) {
        await moveRequest(tx, request, 'CANCELLED', actor, 'این درخواست بسته شد.', {}, now);
        await releaseCoordination(tx, request.id, now);
      }
    }
    return { blocked: true };
  });
}

export async function unblock(db: Database, actor: Actor, input: { blockId: string }, now: Date = new Date()) {
  const [row] = await db
    .update(finderUserBlocks)
    .set({ liftedAt: now })
    .where(and(eq(finderUserBlocks.id, input.blockId), eq(finderUserBlocks.blockerAccountId, actor.accountId), isNull(finderUserBlocks.liftedAt)))
    .returning();
  if (!row) throw notFound('پیدا نشد.');
  await recordAudit(db, actor, { action: 'FINDER_USER_UNBLOCKED', targetType: 'FINDER_USER_BLOCK', targetId: row.id });
  return row;
}

/** The blocker's own list: when, and a masked label — never the other person's number. */
export async function myBlocks(db: DbClient, actor: Actor) {
  return db
    .select({ id: finderUserBlocks.id, createdAt: finderUserBlocks.createdAt, mobile: accounts.mobile })
    .from(finderUserBlocks)
    .innerJoin(accounts, eq(accounts.id, finderUserBlocks.blockedAccountId))
    .where(and(eq(finderUserBlocks.blockerAccountId, actor.accountId), isNull(finderUserBlocks.liftedAt)))
    .orderBy(desc(finderUserBlocks.createdAt))
    .then((rows) => rows.map((r) => ({ id: r.id, createdAt: r.createdAt, labelFa: 'کاربر ' + r.mobile.slice(-2).padStart(4, '•') })));
}
