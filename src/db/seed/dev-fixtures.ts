/**
 * Synthetic development fixtures — clearly labelled and isolated.
 *
 * Every value here is fake by construction. Mobile numbers use the reserved
 * 0999 prefix, which is not an assigned Iranian mobile range, so a fixture can
 * never reach a real person even if an SMS adapter were misconfigured. The
 * national ids start at 9000000000, outside the issued range, and are only
 * check-digit valid so the same validation the product uses can accept them.
 *
 * This module refuses to run outside development and test.
 */
import { eq } from 'drizzle-orm';
import type { DbClient } from '../client.ts';
import { accountRoles, accounts } from '../schema/core.ts';
import { profiles } from '../schema/identity.ts';
import { env as loadEnv, type Env } from '../../config/env.ts';
import { AppError } from '../../domain/errors.ts';
import type { AccountRoleName } from '../../authz/actor.ts';

export const FIXTURE_MOBILE_PREFIX = '0999';

interface FixtureAccount {
  readonly label: string;
  readonly mobile: string;
  readonly roles: readonly AccountRoleName[];
  readonly firstName: string;
  readonly lastName: string;
  readonly nationalId: string;
  readonly birthDate: string;
}

/** SYNTHETIC — not real people, not real numbers, not issued national ids. */
export const FIXTURE_ACCOUNTS: readonly FixtureAccount[] = [
  {
    label: 'SYNTHETIC owner',
    mobile: '09990000001',
    roles: [],
    firstName: 'نمونه',
    lastName: 'مالک آزمایشی',
    nationalId: '9000000009',
    birthDate: '1990-01-01',
  },
  {
    label: 'SYNTHETIC breeder',
    mobile: '09990000002',
    roles: ['BREEDER'],
    firstName: 'نمونه',
    lastName: 'پرورش‌دهنده آزمایشی',
    nationalId: '9000001374',
    birthDate: '1988-02-02',
  },
  {
    label: 'SYNTHETIC trusted vet',
    mobile: '09990000003',
    roles: ['TRUSTED_VET'],
    firstName: 'نمونه',
    lastName: 'دامپزشک آزمایشی',
    nationalId: '9000002745',
    birthDate: '1985-03-03',
  },
  {
    label: 'SYNTHETIC association operator',
    mobile: '09990000004',
    roles: ['ASSOCIATION_OPERATOR'],
    firstName: 'نمونه',
    lastName: 'اپراتور انجمن',
    nationalId: '9000004111',
    birthDate: '1986-04-04',
  },
  {
    label: 'SYNTHETIC genetics operator',
    mobile: '09990000005',
    roles: ['GENETICS_OPERATOR'],
    firstName: 'نمونه',
    lastName: 'اپراتور مرکز ژنتیک',
    nationalId: '9000005485',
    birthDate: '1987-05-05',
  },
  {
    label: 'SYNTHETIC superadmin',
    mobile: '09990000006',
    roles: ['SUPERADMIN'],
    firstName: 'نمونه',
    lastName: 'سوپرادمین آزمایشی',
    nationalId: '9000006856',
    birthDate: '1984-06-06',
  },
  {
    label: 'SYNTHETIC author',
    mobile: '09990000007',
    roles: ['AUTHOR'],
    firstName: 'نمونه',
    lastName: 'نویسنده آزمایشی',
    nationalId: '9000007003',
    birthDate: '1989-07-07',
  },
  {
    label: 'SYNTHETIC content admin',
    mobile: '09990000008',
    roles: ['CONTENT_ADMIN'],
    firstName: 'نمونه',
    lastName: 'ادمین محتوا آزمایشی',
    nationalId: '9000008001',
    birthDate: '1983-08-08',
  },
  {
    label: 'SYNTHETIC review operator',
    mobile: '09990000009',
    roles: ['REVIEW_OPERATOR'],
    firstName: 'نمونه',
    lastName: 'اپراتور بررسی آزمایشی',
    nationalId: '9000009006',
    birthDate: '1982-09-09',
  },
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

    // A complete profile, so a fixture signs in straight into the app rather
    // than into the account-completion step.
    await database
      .insert(profiles)
      .values({
        accountId,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        // Required with the rest of the identity since DEC-0141; a fixture that
        // lacked it could not re-save its own profile.
        displayName: fixture.firstName + ' ' + fixture.lastName,
        nationalId: fixture.nationalId,
        birthDate: fixture.birthDate,
      })
      .onConflictDoNothing();

    ids.push(accountId);
  }
  return ids;
}
