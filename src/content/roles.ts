/**
 * Content roles — P2-D11, Requirements-Phase-2 §3 (PROMPT-004).
 *
 * AUTHOR and CONTENT_ADMIN are granted by the superadmin to an account that
 * already exists, independent of every other role: a veterinarian, breeder or
 * operator is not an author unless this says so. Suspending keeps the row and
 * the content; the environment simply stops opening (DEC-0158).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, accounts } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { forbidden, notFound, validation } from '../domain/errors.ts';
import type { Actor } from '../authz/actor.ts';

export const CONTENT_ROLES = ['AUTHOR', 'CONTENT_ADMIN'] as const;
export type ContentRoleName = (typeof CONTENT_ROLES)[number];

export const CONTENT_ROLE_FA: Record<ContentRoleName, string> = {
  AUTHOR: 'نویسنده',
  CONTENT_ADMIN: 'ادمین محتوا',
};

function assertSuperadmin(actor: Actor): void {
  if (actor.context !== 'SUPERADMIN') throw forbidden('نقش‌های محتوا فقط در محیط سوپرادمین مدیریت می‌شوند.');
}

export async function contentRoleHolders(database: DbClient, actor: Actor) {
  assertSuperadmin(actor);
  return database
    .select({
      accountId: accountRoles.accountId,
      role: accountRoles.role,
      status: accountRoles.status,
      grantedAt: accountRoles.grantedAt,
      mobile: accounts.mobile,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
    })
    .from(accountRoles)
    .innerJoin(accounts, eq(accounts.id, accountRoles.accountId))
    .leftJoin(profiles, eq(profiles.accountId, accountRoles.accountId))
    .where(inArray(accountRoles.role, [...CONTENT_ROLES]))
    .orderBy(asc(accountRoles.role), asc(accountRoles.createdAt));
}

export async function setContentRole(
  database: Database,
  actor: Actor,
  input: { mobile: string; role: string; active: boolean; reason: string },
): Promise<void> {
  assertSuperadmin(actor);
  if (!(CONTENT_ROLES as readonly string[]).includes(input.role)) throw validation('نقش انتخاب‌شده معتبر نیست.');
  const role = input.role as ContentRoleName;
  const reason = input.reason.trim();
  if (reason === '') throw validation('دلیل این تغییر را بنویسید؛ در تاریخچه ثبت می‌شود.');
  const mobile = input.mobile.trim();

  await database.transaction(async (tx) => {
    const [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, mobile)).limit(1);
    if (!account) throw notFound('حسابی با این شماره پیدا نشد؛ صاحب شماره باید یک‌بار وارد همزیست شده باشد.');
    const [current] = await tx
      .select()
      .from(accountRoles)
      .where(and(eq(accountRoles.accountId, account.id), eq(accountRoles.role, role)))
      .limit(1);

    if (input.active) {
      if (current?.status === 'ACTIVE') throw validation('این حساب همین حالا نقش ' + CONTENT_ROLE_FA[role] + ' را دارد.');
      if (current) {
        await tx
          .update(accountRoles)
          .set({ status: 'ACTIVE', grantedAt: new Date(), updatedAt: new Date() })
          .where(eq(accountRoles.id, current.id));
      } else {
        await tx.insert(accountRoles).values({ accountId: account.id, role, status: 'ACTIVE', grantedAt: new Date() });
      }
    } else {
      if (!current || current.status !== 'ACTIVE') throw validation('این حساب نقش فعال ' + CONTENT_ROLE_FA[role] + ' ندارد.');
      await tx
        .update(accountRoles)
        .set({ status: 'SUSPENDED', updatedAt: new Date() })
        .where(eq(accountRoles.id, current.id));
    }

    await recordAudit(tx, actor, {
      action: input.active ? 'CONTENT_ROLE_GRANTED' : 'CONTENT_ROLE_SUSPENDED',
      targetType: 'ACCOUNT',
      targetId: account.id,
      before: { role, status: current?.status ?? null },
      after: { role, status: input.active ? 'ACTIVE' : 'SUSPENDED' },
      reason,
    });
  });
}
