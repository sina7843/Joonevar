/**
 * The operational panels — §21, §5, §23, D11.
 *
 * Everything here reads what the feature modules already wrote: this module
 * adds no second way to change a record, only the queue counts, the lists and
 * the registries the panels need. Every function checks the context it belongs
 * to, so an operational screen cannot be reached by switching a public role.
 */
import { and, asc, count, desc, eq, inArray, isNull, min, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, auditEvents, referenceBreeds } from '../db/schema/core.ts';
import { memberships } from '../db/schema/billing.ts';
import { profiles, kycCases } from '../db/schema/identity.ts';
import { kennels } from '../db/schema/kennels.ts';
import { communities, communityOwnershipRequests } from '../db/schema/communities.ts';
import { matingPermits } from '../db/schema/mating.ts';
import { foreignPedigreeCases } from '../db/schema/animals.ts';
import { geneticsReceipts, parentageAppeals, samples } from '../db/schema/index.ts';
import { postalRequests } from '../db/schema/pedigree.ts';
import { vetProfessionalCases } from '../db/schema/vets.ts';
import { recordAudit } from '../audit/service.ts';
import { readSetting } from '../settings/service.ts';
import { DETAIL_ROUTE } from '../vets/review-workbench.ts';
import { allocateSlug, duplicateCandidates } from '../breeds/service.ts';
import { conflict, forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';

/** One queue on a panel: what it is, how many wait, and where to open it. */
export interface QueueCount {
  readonly key: string;
  readonly titleFa: string;
  readonly noteFa: string;
  readonly href: string;
  readonly waiting: number;
  /** When the oldest waiting case entered (or last changed in) this queue; null when empty. */
  readonly oldestAt: Date | null;
}

function assertContext(actor: Actor, context: Actor['context'], whatFa: string): void {
  if (actor.context !== context) throw forbidden(whatFa);
}

/** Waiting count and the oldest case's time of one queue, in one query. */
async function queueStat(
  query: Promise<{ value: number; oldest: Date | string | null }[]>,
): Promise<{ waiting: number; oldestAt: Date | null }> {
  const [row] = await query;
  const oldest = row?.oldest ?? null;
  return { waiting: Number(row?.value ?? 0), oldestAt: oldest === null ? null : new Date(oldest) };
}

/**
 * The review clock (DS P09 › Overdue): whole days after which a waiting case is
 * «نزدیک به مهلت» / «از مهلت بررسی گذشته». Both are managed settings with no
 * starting figure, so an unset (or not yet seeded) value means no alert at all
 * rather than an invented deadline (DEC-0241).
 */
export interface ReviewClock {
  readonly lateDays: number | null;
  readonly overdueDays: number | null;
}

async function optionalInt(database: DbClient, key: string): Promise<number | null> {
  try {
    const row = await readSetting(database, key);
    return row.value === null ? null : Number(row.value);
  } catch {
    return null;
  }
}

export async function reviewClock(database: DbClient): Promise<ReviewClock> {
  const [lateDays, overdueDays] = await Promise.all([
    optionalInt(database, 'ops.review_late_days'),
    optionalInt(database, 'ops.review_overdue_days'),
  ]);
  return { lateDays, overdueDays };
}

/** 'overdue' past the deadline, 'late' past the warning, else none. */
export function ageState(days: number | null, clock: ReviewClock): 'late' | 'overdue' | undefined {
  if (days === null) return undefined;
  if (clock.overdueDays !== null && days >= clock.overdueDays) return 'overdue';
  if (clock.lateDays !== null && days >= clock.lateDays) return 'late';
  return undefined;
}

const vetAt = sql<Date | null>`min(${vetProfessionalCases.updatedAt})`;

/**
 * The association's real queues — §21.2, §21.5.
 *
 * The numbers are counted from the same tables the detail screens read, so a
 * queue that shows one waiting case really has one; nothing here is a
 * placeholder. The oldest time uses the same column the queue's own age column
 * reads (GAPS #23: last change where no first-submission time is stored).
 */
export async function associationQueues(
  database: DbClient,
  actor: Actor,
): Promise<readonly QueueCount[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');

  const vetQueue = (caseType: 'STUDENT' | 'LICENCE' | 'TRUSTED') =>
    queueStat(
      database
        .select({ value: count(), oldest: vetAt })
        .from(vetProfessionalCases)
        .where(and(eq(vetProfessionalCases.caseType, caseType), inArray(vetProfessionalCases.status, ['SUBMITTED', 'UNDER_REVIEW']))),
    );

  const [
    kyc,
    kennelCases,
    permits,
    foreign,
    postal,
    vetStudents,
    vetDoctors,
    vetLicences,
    trustedCases,
    membershipApplications,
    clubsWaiting,
    clubOwnership,
  ] = await Promise.all([
    queueStat(
      database
        .select({ value: count(), oldest: min(kycCases.submittedAt) })
        .from(kycCases)
        .where(eq(kycCases.status, 'UNDER_REVIEW')),
    ),
    queueStat(
      database.select({ value: count(), oldest: min(kennels.submittedAt) }).from(kennels).where(eq(kennels.status, 'UNDER_REVIEW')),
    ),
    queueStat(
      database
        .select({ value: count(), oldest: min(matingPermits.submittedAt) })
        .from(matingPermits)
        .where(eq(matingPermits.status, 'UNDER_REVIEW')),
    ),
    queueStat(
      database
        .select({ value: count(), oldest: min(foreignPedigreeCases.submittedAt) })
        .from(foreignPedigreeCases)
        .where(eq(foreignPedigreeCases.status, 'UNDER_REVIEW')),
    ),
    queueStat(database.select({ value: count(), oldest: min(postalRequests.createdAt) }).from(postalRequests)),
    vetQueue('STUDENT'),
    queueStat(
      database
        .select({ value: count(), oldest: vetAt })
        .from(vetProfessionalCases)
        .where(
          and(
            eq(vetProfessionalCases.caseType, 'COUNCIL'),
            isNull(vetProfessionalCases.legacyApplicationId),
            inArray(vetProfessionalCases.status, ['SUBMITTED', 'UNDER_REVIEW']),
          ),
        ),
    ),
    vetQueue('LICENCE'),
    vetQueue('TRUSTED'),
    queueStat(
      database
        .select({ value: count(), oldest: min(memberships.updatedAt) })
        .from(memberships)
        .where(eq(memberships.status, 'PENDING_REVIEW')),
    ),
    queueStat(
      database
        .select({ value: count(), oldest: min(communities.updatedAt) })
        .from(communities)
        .where(and(eq(communities.kind, 'CLUB'), eq(communities.lifecycle, 'PENDING_VERIFICATION'))),
    ),
    queueStat(
      database
        .select({ value: count(), oldest: min(communityOwnershipRequests.createdAt) })
        .from(communityOwnershipRequests)
        .where(eq(communityOwnershipRequests.status, 'PENDING')),
    ),
  ]);

  const queue = (key: string, titleFa: string, noteFa: string, href: string, stat: { waiting: number; oldestAt: Date | null }): QueueCount => ({
    key,
    titleFa,
    noteFa,
    href,
    waiting: stat.waiting,
    oldestAt: stat.oldestAt,
  });

  return [
    queue('kyc', 'احراز هویت', 'پرونده‌های ارسال‌شده برای بررسی مدرک هویتی', '/assoc/kyc', kyc),
    queue('vet-students', 'دانشجویان دامپزشکی', 'بررسی دستی شماره دانشجویی و دانشگاه', '/assoc/vet-students', vetStudents),
    queue('vet-doctors', 'کد نظام دامپزشکان', 'بررسی دستی کد نظام، عمومی یا متخصص، و درخواست مالکیت پروفایل بی‌مالک', '/assoc/vet-doctors', vetDoctors),
    queue('vet-licences', 'پروانه فعالیت دامپزشکان', 'بررسی کد، تاریخ و فایل پروانه؛ تأیید فقط پرداخت دوره را باز می‌کند', '/assoc/vet-licences', vetLicences),
    queue('vet-trusted', 'درخواست‌های دامپزشک معتمد', 'صلاحیت و خوداظهاری تجهیزات؛ تأیید فقط پرداخت دوره را باز می‌کند', '/assoc/vet-trusted', trustedCases),
    // The register used to report zero however many applications were waiting,
    // which is a dashboard that cannot be trusted (PROMPT-015).
    queue('members', 'عضویت و اطلاعات عضو', 'درخواست‌های عضویت در انتظار بررسی، و مدیریت سوابق و شماره عضویت', '/assoc/members', membershipApplications),
    queue('clubs', 'تأیید کلاب‌ها', 'کلاب‌های در انتظار تأیید اولیه انجمن', '/assoc/clubs', clubsWaiting),
    queue('club-ownership', 'مالکیت کلاب', 'درخواست‌های باز مالکیت و واگذاری کلاب', '/assoc/clubs', clubOwnership),
    queue('kennels', 'کنل', 'پرونده‌های کنل که پرداخت و ارسال شده‌اند', '/assoc/kennels', kennelCases),
    queue('permits', 'مجوز جفت‌گیری', 'پرونده‌های پرداخت‌شده در انتظار تصمیم عملیاتی', '/assoc/permits', permits),
    queue('foreign', 'Export Pedigree', 'بررسی بر اساس فهرست صادرکنندگان موردتأیید انجمن', '/assoc/foreign-pedigree', foreign),
    queue('postal', 'درخواست‌های پستی', 'ثبت درخواست است و چرخه ارسال ندارد', '/assoc/postal', postal),
  ];
}

/**
 * The eight QueueTiles of the association home (K13): the vet queues share one
 * tile that opens the vet review desk, and club verification and ownership share
 * the clubs tile. Counts add up; the oldest is the oldest of the group.
 */
const ASSOC_TILE_GROUPS: ReadonlyArray<{ key: string; titleFa: string; href: string; members: readonly string[] }> = [
  { key: 'kyc', titleFa: 'احراز هویت', href: '/assoc/kyc', members: ['kyc'] },
  { key: 'members', titleFa: 'عضویت', href: '/assoc/members', members: ['members'] },
  { key: 'vets', titleFa: 'دامپزشکان', href: '/assoc/vet-review', members: ['vet-students', 'vet-doctors', 'vet-licences', 'vet-trusted'] },
  { key: 'permits', titleFa: 'مجوز جفت‌گیری', href: '/assoc/permits', members: ['permits'] },
  { key: 'kennels', titleFa: 'کنل', href: '/assoc/kennels', members: ['kennels'] },
  { key: 'clubs', titleFa: 'کلاب‌ها', href: '/assoc/clubs', members: ['clubs', 'club-ownership'] },
  { key: 'postal', titleFa: 'درخواست‌های پستی', href: '/assoc/postal', members: ['postal'] },
  { key: 'foreign', titleFa: 'Export Pedigree', href: '/assoc/foreign-pedigree', members: ['foreign'] },
];

export function associationTiles(queues: readonly QueueCount[]): QueueCount[] {
  return ASSOC_TILE_GROUPS.map((group) => {
    const parts = queues.filter((queue) => group.members.includes(queue.key));
    const times = parts.map((queue) => queue.oldestAt).filter((at): at is Date => at !== null);
    return {
      key: group.key,
      titleFa: group.titleFa,
      noteFa: parts.map((queue) => queue.noteFa).join('؛ '),
      href: group.href,
      waiting: parts.reduce((sum, queue) => sum + queue.waiting, 0),
      oldestAt: times.length === 0 ? null : new Date(Math.min(...times.map((at) => at.getTime()))),
    };
  });
}

/** Waiting count per navigation address, for the OpsShell sidebar counters (SHL-003). */
export function countsByHref(queues: readonly QueueCount[]): Map<string, { waiting: number; oldestAt: Date | null }> {
  const byHref = new Map<string, { waiting: number; oldestAt: Date | null }>();
  for (const queue of queues) {
    const previous = byHref.get(queue.href);
    const times = [previous?.oldestAt, queue.oldestAt].filter((at): at is Date => at instanceof Date);
    byHref.set(queue.href, {
      waiting: (previous?.waiting ?? 0) + queue.waiting,
      oldestAt: times.length === 0 ? null : new Date(Math.min(...times.map((at) => at.getTime()))),
    });
  }
  return byHref;
}

/** One open case on the association home's «پرونده‌های قدیمی» table (K13). */
export interface OldCase {
  readonly id: string;
  readonly kindFa: string;
  readonly href: string;
  readonly status: string;
  readonly at: Date;
  readonly accountId: string | null;
  readonly nameFa: string | null;
  readonly owner: 'ASSOCIATION';
}

/**
 * The oldest open cases across the association queues — read only, from the
 * same tables and the same time columns as the queues. Every row here is a
 * case waiting on the association (status UNDER_REVIEW / SUBMITTED / PENDING),
 * so the next move is always the association's.
 */
export async function associationOldestCases(database: DbClient, actor: Actor, limit = 5): Promise<readonly OldCase[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');
  const VET_KIND: Record<string, string> = {
    STUDENT: 'دانشجوی دامپزشکی',
    COUNCIL: 'کد نظام دامپزشک',
    LICENCE: 'پروانه فعالیت',
    TRUSTED: 'دامپزشک معتمد',
  };

  const [kyc, kennel, permit, foreign, vets, members, clubs] = await Promise.all([
    database
      .select({ id: kycCases.id, at: kycCases.submittedAt, status: kycCases.status, accountId: kycCases.accountId })
      .from(kycCases)
      .where(eq(kycCases.status, 'UNDER_REVIEW'))
      .orderBy(asc(kycCases.submittedAt))
      .limit(limit),
    database
      .select({ id: kennels.id, at: kennels.submittedAt, status: kennels.status, accountId: kennels.ownerAccountId })
      .from(kennels)
      .where(eq(kennels.status, 'UNDER_REVIEW'))
      .orderBy(asc(kennels.submittedAt))
      .limit(limit),
    database
      .select({ id: matingPermits.id, at: matingPermits.submittedAt, status: matingPermits.status, accountId: matingPermits.initiatorAccountId })
      .from(matingPermits)
      .where(eq(matingPermits.status, 'UNDER_REVIEW'))
      .orderBy(asc(matingPermits.submittedAt))
      .limit(limit),
    database
      .select({ id: foreignPedigreeCases.id, at: foreignPedigreeCases.submittedAt, status: foreignPedigreeCases.status })
      .from(foreignPedigreeCases)
      .where(eq(foreignPedigreeCases.status, 'UNDER_REVIEW'))
      .orderBy(asc(foreignPedigreeCases.submittedAt))
      .limit(limit),
    database
      .select({
        id: vetProfessionalCases.id,
        at: vetProfessionalCases.updatedAt,
        status: vetProfessionalCases.status,
        accountId: vetProfessionalCases.accountId,
        caseType: vetProfessionalCases.caseType,
      })
      .from(vetProfessionalCases)
      .where(
        and(
          inArray(vetProfessionalCases.status, ['SUBMITTED', 'UNDER_REVIEW']),
          inArray(vetProfessionalCases.caseType, ['STUDENT', 'COUNCIL', 'LICENCE', 'TRUSTED']),
          or(sql`${vetProfessionalCases.caseType} <> 'COUNCIL'`, isNull(vetProfessionalCases.legacyApplicationId)),
        ),
      )
      .orderBy(asc(vetProfessionalCases.updatedAt))
      .limit(limit),
    database
      .select({ id: memberships.accountId, at: memberships.updatedAt, status: memberships.status, accountId: memberships.accountId })
      .from(memberships)
      .where(eq(memberships.status, 'PENDING_REVIEW'))
      .orderBy(asc(memberships.updatedAt))
      .limit(limit),
    database
      .select({ id: communities.id, at: communities.updatedAt, status: communities.lifecycle, accountId: communities.ownerAccountId })
      .from(communities)
      .where(and(eq(communities.kind, 'CLUB'), eq(communities.lifecycle, 'PENDING_VERIFICATION')))
      .orderBy(asc(communities.updatedAt))
      .limit(limit),
  ]);

  type Draft = Omit<OldCase, 'nameFa' | 'owner' | 'at'> & { at: Date | null };
  const all: Draft[] = [
    ...kyc.map((row) => ({ id: row.id, kindFa: 'احراز هویت', href: '/assoc/kyc/' + row.id, status: row.status, at: row.at, accountId: row.accountId })),
    ...kennel.map((row) => ({ id: row.id, kindFa: 'کنل', href: '/assoc/kennels/' + row.id, status: row.status, at: row.at, accountId: row.accountId })),
    ...permit.map((row) => ({ id: row.id, kindFa: 'مجوز جفت‌گیری', href: '/assoc/permits/' + row.id, status: row.status, at: row.at, accountId: row.accountId })),
    ...foreign.map((row) => ({ id: row.id, kindFa: 'Export Pedigree', href: '/assoc/foreign-pedigree/' + row.id, status: row.status, at: row.at, accountId: null })),
    ...vets.map((row) => ({
      id: row.id,
      kindFa: VET_KIND[row.caseType] ?? 'دامپزشک',
      href: DETAIL_ROUTE[row.caseType] + row.id,
      status: row.status,
      at: row.at,
      accountId: row.accountId,
    })),
    ...members.map((row) => ({ id: 'm-' + row.id, kindFa: 'عضویت', href: '/assoc/members', status: row.status, at: row.at, accountId: row.accountId })),
    ...clubs.map((row) => ({ id: row.id, kindFa: 'کلاب', href: '/assoc/clubs/' + row.id, status: row.status, at: row.at, accountId: row.accountId })),
  ];
  const drafts = all
    .filter((row): row is Draft & { at: Date } => row.at instanceof Date)
    .sort((x, y) => x.at.getTime() - y.at.getTime())
    .slice(0, limit);

  const ids = [...new Set(drafts.map((row) => row.accountId).filter((id): id is string => id !== null))];
  const names =
    ids.length === 0
      ? []
      : await database
          .select({ accountId: profiles.accountId, firstName: profiles.firstName, lastName: profiles.lastName })
          .from(profiles)
          .where(inArray(profiles.accountId, ids));
  const nameOf = new Map(names.map((row) => [row.accountId, row.firstName + ' ' + row.lastName]));
  return drafts.map((row) => ({ ...row, nameFa: row.accountId ? (nameOf.get(row.accountId) ?? null) : null, owner: 'ASSOCIATION' as const }));
}

/** One recent decision on the association home's «تصمیم‌های اخیر» table (K13). */
export interface RecentDecision {
  readonly id: string;
  readonly at: Date;
  readonly targetType: string;
  readonly status: string | null;
  readonly reason: string | null;
  readonly actorNameFa: string | null;
}

/**
 * The association's latest decisions, newest first — read from the audit log
 * (rows written in the association context that set a status). Display only.
 */
export async function associationRecentDecisions(database: DbClient, actor: Actor, limit = 5): Promise<readonly RecentDecision[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');
  const rows = await database
    .select({ event: auditEvents, firstName: profiles.firstName, lastName: profiles.lastName })
    .from(auditEvents)
    .leftJoin(profiles, eq(profiles.accountId, auditEvents.actorAccountId))
    .where(
      and(
        eq(auditEvents.actorContext, 'ASSOCIATION_OPERATOR'),
        sql`(${auditEvents.after} ? 'status' or ${auditEvents.after} ? 'lifecycle')`,
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);
  return rows.map(({ event, firstName, lastName }) => {
    const after = event.after as { status?: unknown; lifecycle?: unknown } | null;
    const status = typeof after?.status === 'string' ? after.status : typeof after?.lifecycle === 'string' ? after.lifecycle : null;
    return {
      id: event.id,
      at: event.occurredAt,
      targetType: event.targetType,
      status,
      reason: event.reason,
      actorNameFa: firstName ? firstName + ' ' + lastName : null,
    };
  });
}

/** The genetics centre's real queues — §21.3. */
export async function geneticsQueues(database: DbClient, actor: Actor): Promise<readonly QueueCount[]> {
  assertContext(actor, 'GENETICS_OPERATOR', 'این صفحه فقط در محیط عملیاتی مرکز ژنتیک باز می‌شود.');

  const [receipts, awaiting, received, processing, appeals] = await Promise.all([
    queueStat(
      database
        .select({ value: count(), oldest: min(geneticsReceipts.submittedAt) })
        .from(geneticsReceipts)
        .where(eq(geneticsReceipts.status, 'UNDER_REVIEW')),
    ),
    queueStat(
      database
        .select({ value: count(), oldest: min(samples.collectedAt) })
        .from(samples)
        .where(inArray(samples.status, ['SEND_INSTRUCTED', 'SHIPPED'])),
    ),
    queueStat(database.select({ value: count(), oldest: min(samples.collectedAt) }).from(samples).where(eq(samples.status, 'RECEIVED'))),
    queueStat(
      database.select({ value: count(), oldest: min(samples.collectedAt) }).from(samples).where(eq(samples.status, 'PROCESSING')),
    ),
    queueStat(
      database
        .select({ value: count(), oldest: min(parentageAppeals.createdAt) })
        .from(parentageAppeals)
        .where(inArray(parentageAppeals.status, ['SUBMITTED', 'UNDER_REVIEW'])),
    ),
  ]);

  return [
    { key: 'receipts', titleFa: 'فیش‌های منتظر بررسی', noteFa: 'تأیید فیش، دستور ارسال را به همان دامپزشک نگهدارنده می‌دهد', href: '/genetics/receipts', ...stat(receipts) },
    { key: 'awaiting', titleFa: 'نمونه‌های در انتظار رسیدن', noteFa: 'ارسال را همان نگهدارنده ثبت می‌کند؛ مرکز نمونه‌گیری نمی‌کند', href: '/genetics/samples', ...stat(awaiting) },
    { key: 'received', titleFa: 'دریافت‌شده در مرکز', noteFa: 'در انتظار شروع پردازش یا اعلام عدم اعتبار', href: '/genetics/samples', ...stat(received) },
    { key: 'processing', titleFa: 'در حال پردازش', noteFa: 'ثبت نتیجه نهایی از همین صف انجام می‌شود', href: '/genetics/results', ...stat(processing) },
    { key: 'appeals', titleFa: 'اعتراض‌ها', noteFa: 'اعتراض به نتیجه، همان پرونده و نسخه نتیجه را باز می‌کند', href: '/genetics/appeals', ...stat(appeals) },
  ];
}

const stat = (value: { waiting: number; oldestAt: Date | null }) => ({ waiting: value.waiting, oldestAt: value.oldestAt });

// ── Membership records ────────────────────────────────────────────────────

export interface MemberRow {
  readonly accountId: string;
  readonly mobileTail: string;
  readonly nameFa: string;
  readonly status: string;
  readonly membershipNo: string | null;
  readonly numberStatus: string;
  readonly activatedAt: Date | null;
}

/**
 * The membership records the association manages — §21.2, D04.
 *
 * This is a register, not an approval queue: a paid F14 membership is already
 * active and never comes back here for permission.
 */
/**
 * The newest members first, in one bounded page.
 *
 * The register only grows, so an unbounded list would eventually be a page the
 * browser cannot render and a query nobody can read. The count of what is not
 * shown is returned with it, so the screen states the truth about the rest
 * rather than implying the register ends here.
 */
export const MEMBER_PAGE_SIZE = 100;

/**
 * The register is searched by name or by the visible tail of the mobile number,
 * because a bounded page without a way to find one person would mean a member
 * nobody can manage. The operator never sees the whole number (§23.3), so the
 * tail is what can be searched.
 */
function memberSearchFilter(search: string) {
  const term = search.trim();
  if (term === '') return undefined;
  const like = '%' + term + '%';
  const digits = term.replace(/[^0-9]/g, '');
  const clauses = [
    sql`coalesce(${profiles.firstName}, '') || ' ' || coalesce(${profiles.lastName}, '') ilike ${like}`,
    sql`coalesce(${memberships.membershipNo}, '') ilike ${like}`,
  ];
  if (digits !== '') clauses.push(sql`right(${accounts.mobile}, 4) like ${'%' + digits + '%'}`);
  return or(...clauses);
}

export async function memberRecords(
  database: DbClient,
  actor: Actor,
  options: { readonly search?: string; readonly limit?: number } = {},
): Promise<readonly MemberRow[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');
  const limit = options.limit ?? MEMBER_PAGE_SIZE;

  const rows = await database
    .select({
      accountId: memberships.accountId,
      status: memberships.status,
      membershipNo: memberships.membershipNo,
      numberStatus: memberships.numberStatus,
      activatedAt: memberships.activatedAt,
      mobile: accounts.mobile,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
    })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .leftJoin(profiles, eq(profiles.accountId, memberships.accountId))
    .where(memberSearchFilter(options.search ?? ''))
    .orderBy(desc(memberships.activatedAt))
    .limit(limit);

  return rows.map((row) => ({
    accountId: row.accountId,
    // §23.3: an operator sees who this is, not the whole number.
    mobileTail: '••••' + row.mobile.slice(-4),
    nameFa: row.firstName ? row.firstName + ' ' + row.lastName : '—',
    status: row.status,
    membershipNo: row.membershipNo,
    numberStatus: row.numberStatus,
    activatedAt: row.activatedAt,
  }));
}

/** How many records the same search matches, for the "not all shown" line. */
export async function memberRecordCount(database: DbClient, actor: Actor, search = ''): Promise<number> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');
  const [row] = await database
    .select({ value: count() })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .leftJoin(profiles, eq(profiles.accountId, memberships.accountId))
    .where(memberSearchFilter(search));
  return Number(row?.value ?? 0);
}

// ── Postal requests ───────────────────────────────────────────────────────

export interface PostalRow {
  readonly id: string;
  readonly documentType: string;
  readonly recipientNameFa: string;
  readonly cityFa: string | null;
  readonly createdAt: Date;
}

/**
 * Postal requests as the association sees them — §14, D17.
 *
 * The scope is deliberately the request itself: there is no dispatch, no
 * tracking number and no delivery state anywhere in this product yet, and this
 * list does not pretend otherwise.
 */
export async function postalRequestQueue(
  database: DbClient,
  actor: Actor,
): Promise<readonly PostalRow[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');
  const rows = await database
    .select()
    .from(postalRequests)
    .orderBy(desc(postalRequests.createdAt))
    .limit(200);
  return rows.map((row) => ({
    id: row.id,
    documentType: row.documentType,
    recipientNameFa: row.recipientNameFa,
    cityFa: row.cityFa,
    createdAt: row.createdAt,
  }));
}

// ── Audit history ─────────────────────────────────────────────────────────

export interface AuditFilter {
  readonly targetType?: string | null;
  readonly action?: string | null;
  readonly limit?: number;
}

/**
 * The superadmin's history view — §21.4, §23.3.
 *
 * It reads the same audit rows the feature modules wrote, with their redaction
 * already applied at write time. Only the superadmin environment opens it.
 */
export async function auditHistory(database: DbClient, actor: Actor, filter: AuditFilter = {}) {
  assertContext(actor, 'SUPERADMIN', 'تاریخچه عملیاتی فقط در محیط سوپرادمین باز می‌شود.');
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);

  const conditions = [];
  if (filter.targetType) conditions.push(eq(auditEvents.targetType, filter.targetType));
  if (filter.action) conditions.push(eq(auditEvents.action, filter.action));

  return database
    .select()
    .from(auditEvents)
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);
}

/** The target types that actually appear in the log, for the filter control. */
export async function auditTargetTypes(database: DbClient, actor: Actor): Promise<readonly string[]> {
  assertContext(actor, 'SUPERADMIN', 'تاریخچه عملیاتی فقط در محیط سوپرادمین باز می‌شود.');
  const rows = await database
    .selectDistinct({ targetType: auditEvents.targetType })
    .from(auditEvents)
    .orderBy(auditEvents.targetType);
  return rows.map((row) => row.targetType);
}

// ── Reference breeds ──────────────────────────────────────────────────────

/**
 * The breed register — §21.4 (reference lists).
 *
 * Managed data rather than code: a new breed is added here instead of in a
 * deployment, and every change carries its actor, time and previous value.
 * Retiring a breed hides it from new choices and never rewrites the animals
 * already recorded with it.
 */
export async function breedRegistry(database: DbClient, actor: Actor) {
  assertContext(actor, 'SUPERADMIN', 'فهرست نژادها فقط در محیط سوپرادمین مدیریت می‌شود.');
  return database.select().from(referenceBreeds).orderBy(referenceBreeds.sortOrder, referenceBreeds.nameFa);
}

export async function addBreedToRegistry(
  database: Database,
  actor: Actor,
  input: { nameFa: string; nameEn: string },
) {
  assertContext(actor, 'SUPERADMIN', 'فهرست نژادها فقط در محیط سوپرادمین مدیریت می‌شود.');
  const nameFa = input.nameFa.trim();
  const nameEn = input.nameEn.trim();
  if (nameFa === '' || nameEn === '') throw validation('نام فارسی و لاتین نژاد را وارد کنید.');

  // Matched by either name, an alternative name or the address, with Persian
  // letter variants and spacing ignored (§22 Duplicate Candidate, DEC-0155).
  const existing = await duplicateCandidates(database, [nameFa, nameEn]);
  if (existing.length > 0) {
    throw validation(
      'این نژاد قبلاً در فهرست مرجع ثبت شده است: ' + existing.map((d) => d.nameFa + ' (' + d.nameEn + ')').join('، '),
    );
  }

  return database.transaction(async (tx) => {
    const slug = await allocateSlug(tx, nameEn);
    const [row] = await tx.insert(referenceBreeds).values({ nameFa, nameEn, slug }).returning();
    if (!row) throw validation('ثبت نژاد انجام نشد.');
    await recordAudit(tx, actor, {
      action: 'REFERENCE_BREED_ADDED',
      targetType: 'PRODUCT_SETTING',
      targetId: row.id,
      after: { nameFa: row.nameFa, nameEn: row.nameEn, isActive: row.isActive },
    });
    return row;
  });
}

export async function setBreedActive(
  database: Database,
  actor: Actor,
  input: { breedId: string; active: boolean; reasonFa: string; expectedVersion: number },
) {
  assertContext(actor, 'SUPERADMIN', 'فهرست نژادها فقط در محیط سوپرادمین مدیریت می‌شود.');
  const reason = input.reasonFa.trim();
  if (reason === '') throw validation('دلیل تغییر را بنویسید؛ در تاریخچه تغییرات ثبت می‌شود.');
  const [current] = await database
    .select()
    .from(referenceBreeds)
    .where(eq(referenceBreeds.id, input.breedId))
    .limit(1);
  if (!current) throw notFound('نژاد پیدا نشد.');
  if (current.version !== input.expectedVersion) {
    throw conflict('این نژاد در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.', {
      expectedVersion: input.expectedVersion,
      actualVersion: current.version,
    });
  }

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(referenceBreeds)
      .set({ isActive: input.active, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(referenceBreeds.id, current.id), eq(referenceBreeds.version, current.version)))
      .returning();
    if (!row) throw conflict('این نژاد در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.');
    await recordAudit(tx, actor, {
      action: input.active ? 'REFERENCE_BREED_ENABLED' : 'REFERENCE_BREED_RETIRED',
      targetType: 'PRODUCT_SETTING',
      targetId: row.id,
      targetVersion: row.version,
      before: { isActive: current.isActive, version: current.version },
      after: { isActive: row.isActive, version: row.version },
      reason,
    });
    return row;
  });
}

/** Animals still recorded with a breed, so retiring one is an informed choice. */
export async function breedUsage(database: DbClient, actor: Actor, breedId: string): Promise<number> {
  assertContext(actor, 'SUPERADMIN', 'فهرست نژادها فقط در محیط سوپرادمین مدیریت می‌شود.');
  const [row] = await database.execute<{ value: string }>(
    sql`select count(*)::text as value from animal where breed_id = ${breedId}::uuid`,
  ).then((result) => result.rows);
  return Number(row?.value ?? 0);
}

/** Accounts with no membership row at all, for the register's honest total. */
export async function accountsWithoutMembership(database: DbClient, actor: Actor): Promise<number> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');
  const [row] = await database
    .select({ value: count() })
    .from(accounts)
    .leftJoin(memberships, eq(memberships.accountId, accounts.id))
    .where(isNull(memberships.accountId));
  return Number(row?.value ?? 0);
}
