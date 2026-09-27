/**
 * Finder operations: confidential feedback, reminders, reconciliation and the
 * aggregate overview — PHASE-4 PROMPT-007.
 *
 * Nothing here reads a chat body, a contract text, a phone number, an address,
 * a full chip number, a code or a precise location. The overview is counts; a
 * breakdown row small enough to be about one person shows no number.
 */
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { finderContractOtps, finderFeedback, finderReminders, matingProfiles, matingRequests } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { readInt } from '../settings/service.ts';
import { conflict, validation } from '../domain/errors.ts';
import { redactSmallGroups, type RedactedBreakdown } from '../analytics/metrics.ts';
import { MIN_COHORT_KEY } from '../analytics/service.ts';
import type { Actor } from '../authz/actor.ts';
import { assertFinderCapability } from './model.ts';
import { deactivateProfileOf, lifeStatusOf } from './profiles.ts';
import { expireDueRequests, loadForParty, notifyFinder } from './requests.ts';
import { finderCapacity } from './subscriptions.ts';
import { CATEGORY_FA, type FinderReportCategory } from './reports-model.ts';

// ── confidential feedback ────────────────────────────────────────────────────

const FEEDBACK_STATUSES = ['MATING_COMPLETED', 'MATING_NOT_COMPLETED'];

/** After the event, each party may leave one confidential note for operations; nobody else ever sees it. */
export async function submitFeedback(db: Database, actor: Actor, input: { requestId: string; score: number; bodyFa: string | null }, now: Date = new Date()) {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) throw validation('امتیاز را از ۱ تا ۵ انتخاب کنید.');
  const bodyFa = input.bodyFa?.trim() || null;
  if (bodyFa && bodyFa.length > 1000) throw validation('توضیح حداکثر ۱۰۰۰ نویسه است.');
  return db.transaction(async (tx) => {
    const { request } = await loadForParty(tx, actor, input.requestId);
    if (!FEEDBACK_STATUSES.includes(request.status)) throw conflict('بازخورد پس از ثبت نتیجه جفت‌گیری باز می‌شود.');
    const [row] = await tx
      .insert(finderFeedback)
      .values({ requestId: request.id, authorAccountId: actor.accountId, score: input.score, bodyFa, createdAt: now })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict('بازخورد شما برای این درخواست پیش‌تر ثبت شده است.');
    await recordAudit(tx, actor, { action: 'FINDER_FEEDBACK_SUBMITTED', targetType: 'MATING_REQUEST', targetId: request.id });
    return row;
  });
}

export async function myFeedback(db: DbClient, actor: Actor, requestId: string) {
  const [row] = await db.select().from(finderFeedback).where(and(eq(finderFeedback.requestId, requestId), eq(finderFeedback.authorAccountId, actor.accountId))).limit(1);
  return row ?? null;
}

/** For FINDER_FEEDBACK_VIEW only; the operator sees the note and the outcome, never who the partner was. */
export async function feedbackList(db: DbClient, actor: Actor) {
  assertFinderCapability(actor, 'FINDER_FEEDBACK_VIEW');
  return db
    .select({ id: finderFeedback.id, score: finderFeedback.score, bodyFa: finderFeedback.bodyFa, createdAt: finderFeedback.createdAt, requestId: finderFeedback.requestId, outcome: matingRequests.status, route: matingRequests.route })
    .from(finderFeedback)
    .innerJoin(matingRequests, eq(matingRequests.id, finderFeedback.requestId))
    .orderBy(desc(finderFeedback.createdAt))
    .limit(200);
}

// ── reminders ────────────────────────────────────────────────────────────────

/**
 * One reminder of each kind per request, ever: the unique (request, kind) row is
 * written first and only the insert that wins creates a notification. An unset
 * window sends nothing.
 */
export async function sendReminders(db: Database, now: Date = new Date()): Promise<{ expiring: number; window: number }> {
  const [expiryHours, windowDays] = await Promise.all([
    readInt(db, 'finder.reminder.expiry_hours').catch(() => null),
    readInt(db, 'finder.reminder.window_days').catch(() => null),
  ]);
  let expiring = 0;
  let window = 0;
  if (expiryHours) {
    const soon = new Date(now.getTime() + expiryHours * 3_600_000);
    const rows = await db
      .select()
      .from(matingRequests)
      .where(and(inArray(matingRequests.status, ['WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'NEGOTIATING']), lt(matingRequests.expiresAt, soon), sql`${matingRequests.expiresAt} > ${now}`));
    for (const r of rows) {
      const sent = await db.transaction(async (tx) => {
        const [won] = await tx.insert(finderReminders).values({ requestId: r.id, kind: 'EXPIRING', createdAt: now }).onConflictDoNothing().returning();
        if (!won) return false;
        // The one whose move it is: the receiver while waiting, otherwise both.
        const recipients = r.status === 'WAITING_REVIEW' ? [r.receiverAccountId] : [r.senderAccountId, r.receiverAccountId];
        for (const to of recipients) await notifyFinder(tx, to, 'FINDER_REQUEST_EXPIRING', 'درخواست جفت‌گیری به‌زودی منقضی می‌شود', 'مهلت این درخواست رو به پایان است.', r.id);
        return true;
      });
      if (sent) expiring += 1;
    }
  }
  if (windowDays) {
    const until = new Date(now.getTime() + windowDays * 86_400_000).toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(matingRequests)
      .where(and(eq(matingRequests.status, 'CONTRACT_CONFIRMED'), sql`${matingRequests.windowFrom} <= ${until}::date`));
    for (const r of rows) {
      const sent = await db.transaction(async (tx) => {
        const [won] = await tx.insert(finderReminders).values({ requestId: r.id, kind: 'WINDOW', createdAt: now }).onConflictDoNothing().returning();
        if (!won) return false;
        for (const to of [r.senderAccountId, r.receiverAccountId]) {
          await notifyFinder(tx, to, 'FINDER_WINDOW_APPROACHING', 'بازه جفت‌گیری نزدیک است', 'پس از جفت‌گیری، تاریخ را ثبت و تأیید کنید.', r.id);
        }
        return true;
      });
      if (sent) window += 1;
    }
  }
  return { expiring, window };
}

// ── reconciliation ───────────────────────────────────────────────────────────

export interface ReconcileResult {
  readonly expired: number;
  readonly transferred: number;
  readonly lifeEvents: number;
  readonly overCapacity: number;
  readonly reminders: { expiring: number; window: number };
  readonly otpPurged: number;
}

/**
 * Brings the finder back in line with the records it depends on. Every event
 * already acts in its own transaction (transfer, life event, identity change,
 * expiry on read); this sweep catches whatever a failure or an older path left
 * behind, and is safe to run any number of times.
 *
 *  - due requests expire;
 *  - a profile whose animal changed owner, left REGISTERED, or died, went
 *    missing or was archived leaves the finder with that reason;
 *  - after a subscription ended, profiles above the fallback free capacity
 *    leave the finder (SUBSCRIPTION_ENDED), newest first, never one that is
 *    coordinating or matched; an unset free capacity removes nothing, because an
 *    operator's missing figure is not a decision to unlist everybody;
 *  - reminders are sent, and expired unused contract codes past retention go.
 */
export async function reconcileFinder(db: Database, now: Date = new Date()): Promise<ReconcileResult> {
  const expired = await expireDueRequests(db, now);
  let transferred = 0;
  let lifeEvents = 0;
  const live = await db
    .select({ profile: matingProfiles, animal: animals })
    .from(matingProfiles)
    .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
    .where(sql`${matingProfiles.state} <> 'INACTIVE'`);
  for (const { profile, animal } of live) {
    if (profile.ownerAccountId !== animal.ownerAccountId) {
      if (await db.transaction((tx) => deactivateProfileOf(tx, animal.id, 'TRANSFER', null, 'هماهنگ‌سازی دوره‌ای', now))) transferred += 1;
    } else if (animal.status !== 'REGISTERED' || (await lifeStatusOf(db, animal.id)) !== 'ACTIVE') {
      if (await db.transaction((tx) => deactivateProfileOf(tx, animal.id, 'LIFE_EVENT', null, 'هماهنگ‌سازی دوره‌ای', now))) lifeEvents += 1;
    }
  }

  let overCapacity = 0;
  const owners = await db
    .select({ owner: matingProfiles.ownerAccountId, n: count() })
    .from(matingProfiles)
    .where(sql`${matingProfiles.state} <> 'INACTIVE'`)
    .groupBy(matingProfiles.ownerAccountId);
  for (const { owner, n } of owners) {
    const capacity = await finderCapacity(db, owner, now);
    if (capacity.limit === null || Number(n) <= capacity.limit) continue;
    const excess = await db
      .select({ animalId: matingProfiles.animalId })
      .from(matingProfiles)
      .where(and(eq(matingProfiles.ownerAccountId, owner), inArray(matingProfiles.state, ['READY', 'TEMPORARILY_UNAVAILABLE', 'INVITE_ONLY'])))
      .orderBy(desc(matingProfiles.activatedAt))
      .limit(Number(n) - capacity.limit);
    for (const { animalId } of excess) {
      if (await db.transaction((tx) => deactivateProfileOf(tx, animalId, 'SUBSCRIPTION_ENDED', null, null, now))) overCapacity += 1;
    }
  }

  const reminders = await sendReminders(db, now);
  const otpDays = await readInt(db, 'finder.retention.otp_days').catch(() => null);
  let otpPurged = 0;
  if (otpDays) {
    const before = new Date(now.getTime() - otpDays * 86_400_000);
    // A consumed code backs an approval and is never removed.
    const purged = await db.delete(finderContractOtps).where(and(isNull(finderContractOtps.consumedAt), lt(finderContractOtps.expiresAt, before))).returning({ id: finderContractOtps.id });
    otpPurged = purged.length;
  }
  const result = { expired, transferred, lifeEvents, overCapacity, reminders, otpPurged };
  await recordAudit(db, null, { action: 'FINDER_RECONCILED', targetType: 'FINDER', targetId: '00000000-0000-0000-0000-000000000000', after: result });
  return result;
}

// ── the overview ─────────────────────────────────────────────────────────────

export interface FinderOverview {
  readonly sinceDays: number;
  readonly config: { publishedPlans: number; publishedRules: number; templateVersion: number | null };
  readonly capacity: { activeProfiles: number; byState: readonly RedactedBreakdown[]; subscribedCapacity: number };
  readonly funnel: readonly { labelFa: string; count: number }[];
  readonly contracts: { started: number; confirmed: number; cancelled: number };
  readonly handoff: readonly RedactedBreakdown[];
  readonly dates: { conflicted: number; pending: number; confirmed: number };
  readonly reports: { open: number; decided: number; openAppeals: number; byCategory: readonly RedactedBreakdown[] };
  readonly sanctions: { finderAccess: number; account: number };
  readonly notifications: readonly RedactedBreakdown[];
}

const n = async (db: DbClient, query: ReturnType<typeof sql>): Promise<number> =>
  Number((await db.execute<{ n: number }>(query)).rows[0]?.n ?? 0);

/** Counts only. Gated by FINDER_ANALYTICS_VIEW; small breakdown groups show no number. */
export async function finderOverview(db: DbClient, actor: Actor, opts: { sinceDays?: number } = {}, now: Date = new Date()): Promise<FinderOverview> {
  assertFinderCapability(actor, 'FINDER_ANALYTICS_VIEW');
  const sinceDays = Math.min(Math.max(Math.trunc(opts.sinceDays ?? 30), 1), 365);
  const since = new Date(now.getTime() - sinceDays * 86_400_000);
  const minimum = (await readInt(db, MIN_COHORT_KEY).catch(() => null)) ?? 5;
  const breakdown = (rows: Array<{ label: string; n: number }>, labels: Record<string, string> = {}) =>
    redactSmallGroups(rows.map((r) => ({ labelFa: labels[r.label] ?? r.label, count: Number(r.n) })), minimum);

  const byState = (await db.execute<{ label: string; n: number }>(sql`select state::text as label, count(*)::int as n from mating_profile where state <> 'INACTIVE' group by state`)).rows;
  const funnelStatuses = ['WAITING_REVIEW', 'PRELIMINARILY_ACCEPTED', 'CONTRACT_DRAFTING', 'CONTRACT_CONFIRMED', 'MATING_COMPLETED'] as const;
  const reached = async (status: string) =>
    status === 'WAITING_REVIEW'
      ? n(db, sql`select count(*)::int as n from mating_request where created_at >= ${since}`)
      : n(db, sql`select count(distinct e.request_id)::int as n from mating_request_event e join mating_request r on r.id = e.request_id where r.created_at >= ${since} and e.to_status::text = ${status}`);
  const funnelFa: Record<string, string> = {
    WAITING_REVIEW: 'درخواست ارسال‌شده',
    PRELIMINARILY_ACCEPTED: 'پذیرش اولیه',
    CONTRACT_DRAFTING: 'ورود به قرارداد',
    CONTRACT_CONFIRMED: 'قرارداد تأییدشده',
    MATING_COMPLETED: 'جفت‌گیری انجام‌شده',
  };
  const funnel = [];
  for (const status of funnelStatuses) funnel.push({ labelFa: funnelFa[status]!, count: await reached(status) });
  for (const [status, labelFa] of [['EXPIRED', 'منقضی'], ['REJECTED', 'ردشده'], ['CANCELLED', 'لغوشده'], ['MATING_NOT_COMPLETED', 'انجام‌نشده']] as const) {
    funnel.push({ labelFa, count: await reached(status) });
  }

  const categories = (await db.execute<{ label: string; n: number }>(sql`select coalesce(finder_category::text, 'OTHER_POLICY') as label, count(*)::int as n from moderation_report
      where target_kind::text in ('MATING_PROFILE','MATING_PROFILE_MEDIA','FINDER_MESSAGE','FINDER_REQUEST','FINDER_ACCOUNT') and created_at >= ${since} group by 1`)).rows;
  const handoff = (await db.execute<{ label: string; n: number }>(sql`select route::text || case when detached_at is null then '' else '_DETACHED' end as label, count(*)::int as n from finder_downstream_link where linked_at >= ${since} group by 1`)).rows;
  const deliveries = (await db.execute<{ label: string; n: number }>(sql`select d.channel::text || ' · ' || d.status::text as label, count(*)::int as n
      from notification_delivery d join notification x on x.id = d.notification_id
      where (x.kind like 'FINDER_%' or x.kind like 'MATING_DATE_%' or x.kind = 'MATING_PROFILE_DEACTIVATED') and d.created_at >= ${since} group by 1`)).rows;

  return {
    sinceDays,
    config: {
      publishedPlans: await n(db, sql`select count(*)::int as n from finder_plan_version where status = 'PUBLISHED'`),
      publishedRules: await n(db, sql`select count(*)::int as n from finder_breed_rule where status = 'PUBLISHED'`),
      templateVersion: (await db.execute<{ v: number | null }>(sql`select max(version) as v from finder_contract_template where status = 'PUBLISHED'`)).rows[0]?.v ?? null,
    },
    capacity: {
      activeProfiles: byState.reduce((sum, r) => sum + Number(r.n), 0),
      byState: breakdown(byState),
      subscribedCapacity: await n(db, sql`select coalesce(sum(active_animal_capacity), 0)::int as n from finder_subscription_period where status = 'ACTIVE' and starts_at <= ${now} and ${now} < ends_at`),
    },
    funnel,
    contracts: {
      started: await n(db, sql`select count(*)::int as n from finder_contract where created_at >= ${since}`),
      confirmed: await n(db, sql`select count(*)::int as n from finder_contract where created_at >= ${since} and confirmed_at is not null`),
      cancelled: await n(db, sql`select count(*)::int as n from finder_contract where created_at >= ${since} and status = 'CANCELLED'`),
    },
    handoff: breakdown(handoff, { OFFICIAL: 'مسیر رسمی', PERSONAL: 'مسیر شخصی', OFFICIAL_DETACHED: 'رسمی — جداشده با لغو', PERSONAL_DETACHED: 'شخصی — جداشده با لغو' }),
    dates: {
      conflicted: await n(db, sql`select count(*)::int as n from mating_date_declaration d where d.status = 'CONFLICTED' and d.created_at >= ${since}
        and (d.personal_mating_id is not null or exists (select 1 from finder_downstream_link l where l.permit_id = d.permit_id))`),
      pending: await n(db, sql`select count(*)::int as n from mating_date_declaration d where d.status = 'PROPOSED'
        and (d.personal_mating_id is not null or exists (select 1 from finder_downstream_link l where l.permit_id = d.permit_id))`),
      confirmed: await n(db, sql`select count(*)::int as n from mating_date_declaration d where d.status = 'CONFIRMED' and d.created_at >= ${since}
        and (d.personal_mating_id is not null or exists (select 1 from finder_downstream_link l where l.permit_id = d.permit_id))`),
    },
    reports: {
      open: await n(db, sql`select count(*)::int as n from moderation_report where status = 'OPEN' and target_kind::text in ('MATING_PROFILE','MATING_PROFILE_MEDIA','FINDER_MESSAGE','FINDER_REQUEST','FINDER_ACCOUNT')`),
      decided: await n(db, sql`select count(*)::int as n from moderation_report where status <> 'OPEN' and decided_at >= ${since} and target_kind::text in ('MATING_PROFILE','MATING_PROFILE_MEDIA','FINDER_MESSAGE','FINDER_REQUEST','FINDER_ACCOUNT')`),
      openAppeals: await n(db, sql`select count(*)::int as n from moderation_appeal a join moderation_report r on r.id = a.report_id where a.status = 'OPEN' and r.target_kind::text in ('MATING_PROFILE','MATING_PROFILE_MEDIA','FINDER_MESSAGE','FINDER_REQUEST','FINDER_ACCOUNT')`),
      byCategory: breakdown(categories, CATEGORY_FA as Record<FinderReportCategory, string>),
    },
    sanctions: {
      finderAccess: await n(db, sql`select count(*)::int as n from account_sanction where scope = 'FINDER_ACCESS' and lifted_at is null and (ends_at is null or ends_at > ${now})`),
      account: await n(db, sql`select count(*)::int as n from account_sanction where scope = 'ACCOUNT' and lifted_at is null and (ends_at is null or ends_at > ${now})`),
    },
    notifications: breakdown(deliveries),
  };
}
