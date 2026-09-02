/**
 * The operational panels — §21, §5, §23, D11.
 *
 * Everything here reads what the feature modules already wrote: this module
 * adds no second way to change a record, only the queue counts, the lists and
 * the registries the panels need. Every function checks the context it belongs
 * to, so an operational screen cannot be reached by switching a public role.
 */
import { and, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts, auditEvents, referenceBreeds } from '../db/schema/core.ts';
import { memberships } from '../db/schema/billing.ts';
import { profiles, kycCases } from '../db/schema/identity.ts';
import { kennels } from '../db/schema/kennels.ts';
import { matingPermits } from '../db/schema/mating.ts';
import { foreignPedigreeCases } from '../db/schema/animals.ts';
import { geneticsReceipts, parentageAppeals, samples } from '../db/schema/index.ts';
import { postalRequests } from '../db/schema/pedigree.ts';
import { recordAudit } from '../audit/service.ts';
import { forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';

/** One queue on a panel: what it is, how many wait, and where to open it. */
export interface QueueCount {
  readonly key: string;
  readonly titleFa: string;
  readonly noteFa: string;
  readonly href: string;
  readonly waiting: number;
}

function assertContext(actor: Actor, context: Actor['context'], whatFa: string): void {
  if (actor.context !== context) throw forbidden(whatFa);
}

async function countRows(database: DbClient, query: Promise<{ value: number }[]>): Promise<number> {
  const [row] = await query;
  return Number(row?.value ?? 0);
}

/**
 * The association's real queues — §21.2, §21.5.
 *
 * The numbers are counted from the same tables the detail screens read, so a
 * queue that shows one waiting case really has one; nothing here is a
 * placeholder.
 */
export async function associationQueues(
  database: DbClient,
  actor: Actor,
): Promise<readonly QueueCount[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');

  const [kyc, kennelCases, permits, foreign, postal] = await Promise.all([
    countRows(
      database,
      database
        .select({ value: count() })
        .from(kycCases)
        .where(eq(kycCases.status, 'UNDER_REVIEW')),
    ),
    countRows(
      database,
      database.select({ value: count() }).from(kennels).where(eq(kennels.status, 'UNDER_REVIEW')),
    ),
    countRows(
      database,
      database
        .select({ value: count() })
        .from(matingPermits)
        .where(eq(matingPermits.status, 'UNDER_REVIEW')),
    ),
    countRows(
      database,
      database
        .select({ value: count() })
        .from(foreignPedigreeCases)
        .where(eq(foreignPedigreeCases.status, 'UNDER_REVIEW')),
    ),
    countRows(database, database.select({ value: count() }).from(postalRequests)),
  ]);

  return [
    {
      key: 'kyc',
      titleFa: 'احراز هویت',
      noteFa: 'پرونده‌های ارسال‌شده برای بررسی مدرک هویتی',
      href: '/assoc/kyc',
      waiting: kyc,
    },
    {
      key: 'members',
      titleFa: 'عضویت و اطلاعات عضو',
      noteFa: 'مدیریت سوابق و شماره عضویت؛ عضویت پرداخت‌شده به صف تأیید بازنمی‌گردد',
      href: '/assoc/members',
      waiting: 0,
    },
    {
      key: 'kennels',
      titleFa: 'کنل',
      noteFa: 'پرونده‌های کنل که پرداخت و ارسال شده‌اند',
      href: '/assoc/kennels',
      waiting: kennelCases,
    },
    {
      key: 'permits',
      titleFa: 'مجوز جفت‌گیری',
      noteFa: 'پرونده‌های پرداخت‌شده در انتظار تصمیم عملیاتی',
      href: '/assoc/permits',
      waiting: permits,
    },
    {
      key: 'foreign',
      titleFa: 'شجره‌نامه خارجی',
      noteFa: 'بررسی بر اساس فهرست صادرکنندگان موردتأیید انجمن',
      href: '/assoc/foreign-pedigree',
      waiting: foreign,
    },
    {
      key: 'postal',
      titleFa: 'درخواست‌های پستی',
      noteFa: 'ثبت درخواست است و چرخه ارسال ندارد',
      href: '/assoc/postal',
      waiting: postal,
    },
  ];
}

/** The genetics centre's real queues — §21.3. */
export async function geneticsQueues(database: DbClient, actor: Actor): Promise<readonly QueueCount[]> {
  assertContext(actor, 'GENETICS_OPERATOR', 'این صفحه فقط در محیط عملیاتی مرکز ژنتیک باز می‌شود.');

  const [receipts, awaiting, received, processing, appeals] = await Promise.all([
    countRows(
      database,
      database
        .select({ value: count() })
        .from(geneticsReceipts)
        .where(eq(geneticsReceipts.status, 'UNDER_REVIEW')),
    ),
    countRows(
      database,
      database
        .select({ value: count() })
        .from(samples)
        .where(inArray(samples.status, ['SEND_INSTRUCTED', 'SHIPPED'])),
    ),
    countRows(database, database.select({ value: count() }).from(samples).where(eq(samples.status, 'RECEIVED'))),
    countRows(
      database,
      database.select({ value: count() }).from(samples).where(eq(samples.status, 'PROCESSING')),
    ),
    countRows(
      database,
      database
        .select({ value: count() })
        .from(parentageAppeals)
        .where(inArray(parentageAppeals.status, ['SUBMITTED', 'UNDER_REVIEW'])),
    ),
  ]);

  return [
    {
      key: 'receipts',
      titleFa: 'فیش‌های منتظر بررسی',
      noteFa: 'تأیید فیش، دستور ارسال را به همان دامپزشک نگهدارنده می‌دهد',
      href: '/genetics/receipts',
      waiting: receipts,
    },
    {
      key: 'awaiting',
      titleFa: 'نمونه‌های در انتظار رسیدن',
      noteFa: 'ارسال را همان نگهدارنده ثبت می‌کند؛ مرکز نمونه‌گیری نمی‌کند',
      href: '/genetics/samples',
      waiting: awaiting,
    },
    {
      key: 'received',
      titleFa: 'دریافت‌شده در مرکز',
      noteFa: 'در انتظار شروع پردازش یا اعلام عدم اعتبار',
      href: '/genetics/samples',
      waiting: received,
    },
    {
      key: 'processing',
      titleFa: 'در حال پردازش',
      noteFa: 'ثبت نتیجه نهایی از همین صف انجام می‌شود',
      href: '/genetics/results',
      waiting: processing,
    },
    {
      key: 'appeals',
      titleFa: 'اعتراض‌ها',
      noteFa: 'اعتراض به نتیجه، همان پرونده و نسخه نتیجه را باز می‌کند',
      href: '/genetics/appeals',
      waiting: appeals,
    },
  ];
}

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
export async function memberRecords(database: DbClient, actor: Actor): Promise<readonly MemberRow[]> {
  assertContext(actor, 'ASSOCIATION_OPERATOR', 'این صفحه فقط در محیط عملیاتی انجمن باز می‌شود.');

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
    .orderBy(desc(memberships.activatedAt));

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

  const existing = await database
    .select({ id: referenceBreeds.id })
    .from(referenceBreeds)
    .where(or(eq(referenceBreeds.nameFa, nameFa), eq(referenceBreeds.nameEn, nameEn)))
    .limit(1);
  if (existing.length > 0) throw validation('این نژاد قبلاً در فهرست مرجع ثبت شده است.');

  return database.transaction(async (tx) => {
    const [row] = await tx.insert(referenceBreeds).values({ nameFa, nameEn }).returning();
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
  input: { breedId: string; active: boolean },
) {
  assertContext(actor, 'SUPERADMIN', 'فهرست نژادها فقط در محیط سوپرادمین مدیریت می‌شود.');
  const [current] = await database
    .select()
    .from(referenceBreeds)
    .where(eq(referenceBreeds.id, input.breedId))
    .limit(1);
  if (!current) throw notFound('نژاد پیدا نشد.');

  return database.transaction(async (tx) => {
    const [row] = await tx
      .update(referenceBreeds)
      .set({ isActive: input.active })
      .where(eq(referenceBreeds.id, current.id))
      .returning();
    if (!row) throw notFound('نژاد پیدا نشد.');
    await recordAudit(tx, actor, {
      action: input.active ? 'REFERENCE_BREED_ENABLED' : 'REFERENCE_BREED_RETIRED',
      targetType: 'PRODUCT_SETTING',
      targetId: row.id,
      before: { isActive: current.isActive },
      after: { isActive: row.isActive },
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
