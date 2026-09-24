/**
 * Granting an operational role to an existing account.
 *
 * Extracted from `src/content/roles.ts` when Phase 3 added six more operational
 * roles (DEC-0204). Nothing about the behaviour changed; it simply stopped
 * being written twice, so "who may grant a role, and what is recorded when they
 * do" has one implementation to keep honest.
 *
 * Suspending keeps the row and everything the holder produced. The environment
 * simply stops opening (DEC-0158).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, accounts } from '../db/schema/core.ts';
import { profiles } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { forbidden, notFound, validation } from '../domain/errors.ts';
import type { AccountRoleName, Actor } from './actor.ts';

export interface RoleFamily {
  /** The roles this family grants; anything else is refused. */
  readonly roles: readonly AccountRoleName[];
  readonly labelFa: Record<string, string>;
  /** Audit action names, so each family reads as itself in the history. */
  readonly grantedAction: string;
  readonly suspendedAction: string;
  /** Refusal shown when the actor is in the wrong shell. */
  readonly wrongShellFa: string;
}

export interface RoleHolder {
  readonly accountId: string;
  readonly role: string;
  readonly status: string;
  readonly grantedAt: Date | null;
  readonly mobile: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
}

function assertSuperadmin(actor: Actor, family: RoleFamily): void {
  if (actor.context !== 'SUPERADMIN') throw forbidden(family.wrongShellFa);
}

export async function roleHolders(
  database: DbClient,
  actor: Actor,
  family: RoleFamily,
): Promise<readonly RoleHolder[]> {
  assertSuperadmin(actor, family);
  const rows = await database
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
    .where(inArray(accountRoles.role, [...family.roles]))
    .orderBy(asc(accountRoles.role), asc(accountRoles.createdAt));
  return rows as readonly RoleHolder[];
}

export interface SetRoleInput {
  readonly mobile: string;
  readonly role: string;
  readonly active: boolean;
  readonly reason: string;
}

export async function setAccountRole(
  database: Database,
  actor: Actor,
  family: RoleFamily,
  input: SetRoleInput,
): Promise<void> {
  assertSuperadmin(actor, family);
  if (!(family.roles as readonly string[]).includes(input.role)) throw validation('نقش انتخاب‌شده معتبر نیست.');
  const role = input.role as AccountRoleName;
  const label = family.labelFa[role] ?? role;
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
      if (current?.status === 'ACTIVE') throw validation('این حساب همین حالا نقش ' + label + ' را دارد.');
      if (current) {
        await tx
          .update(accountRoles)
          .set({ status: 'ACTIVE', grantedAt: new Date(), updatedAt: new Date() })
          .where(eq(accountRoles.id, current.id));
      } else {
        await tx.insert(accountRoles).values({ accountId: account.id, role, status: 'ACTIVE', grantedAt: new Date() });
      }
    } else {
      if (!current || current.status !== 'ACTIVE') throw validation('این حساب نقش فعال ' + label + ' ندارد.');
      await tx
        .update(accountRoles)
        .set({ status: 'SUSPENDED', updatedAt: new Date() })
        .where(eq(accountRoles.id, current.id));
    }

    await recordAudit(tx, actor, {
      action: input.active ? family.grantedAction : family.suspendedAction,
      targetType: 'ACCOUNT',
      targetId: account.id,
      before: { role, status: current?.status ?? null },
      after: { role, status: input.active ? 'ACTIVE' : 'SUSPENDED' },
      reason,
    });
  });
}
