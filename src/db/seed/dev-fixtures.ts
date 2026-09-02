/**
 * Synthetic development fixtures — clearly labelled and isolated.
 *
 * Every value here is fake by construction. Mobile numbers use the reserved
 * 0999 prefix, which is not an assigned Iranian mobile range, so a fixture can
 * never reach a real person even if an SMS adapter were misconfigured.
 *
 * This module refuses to run outside development and test.
 */
import { eq } from 'drizzle-orm';
import type { DbClient } from '../client.ts';
import { accountRoles, accounts } from '../schema/core.ts';
import { env as loadEnv, type Env } from '../../config/env.ts';
import { AppError } from '../../domain/errors.ts';
import type { AccountRoleName } from '../../authz/actor.ts';

export const FIXTURE_MOBILE_PREFIX = '0999';

interface FixtureAccount {
  readonly label: string;
  readonly mobile: string;
  readonly roles: readonly AccountRoleName[];
}

/** SYNTHETIC — not real people, not real numbers. */
export const FIXTURE_ACCOUNTS: readonly FixtureAccount[] = [
  { label: 'SYNTHETIC owner', mobile: '09990000001', roles: [] },
  { label: 'SYNTHETIC breeder', mobile: '09990000002', roles: ['BREEDER'] },
  { label: 'SYNTHETIC trusted vet', mobile: '09990000003', roles: ['TRUSTED_VET'] },
  { label: 'SYNTHETIC association operator', mobile: '09990000004', roles: ['ASSOCIATION_OPERATOR'] },
  { label: 'SYNTHETIC genetics operator', mobile: '09990000005', roles: ['GENETICS_OPERATOR'] },
  { label: 'SYNTHETIC superadmin', mobile: '09990000006', roles: ['SUPERADMIN'] },
];

export async function seedDevFixtures(database: DbClient, env: Env = loadEnv()): Promise<readonly string[]> {
  if (env.APP_ENV === 'production') {
    throw new AppError('INTERNAL', 'Synthetic fixtures must never be seeded in production');
  }

  const ids: string[] = [];
  for (const fixture of FIXTURE_ACCOUNTS) {
    const [existing] = await database
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.mobile, fixture.mobile))
      .limit(1);

    const accountId =
      existing?.id ??
      (
        await database
          .insert(accounts)
          .values({ mobile: fixture.mobile, status: 'ACTIVE' })
          .returning({ id: accounts.id })
      )[0]!.id;

    for (const role of fixture.roles) {
      await database
        .insert(accountRoles)
        .values({ accountId, role, status: 'ACTIVE', grantedAt: new Date() })
        .onConflictDoNothing();
    }
    ids.push(accountId);
  }
  return ids;
}
