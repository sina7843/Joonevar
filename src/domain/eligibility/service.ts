/**
 * Loads the facts §5 depends on and answers eligibility questions for an
 * account. Screens and server actions both call this, so a hidden button and a
 * refused action always agree.
 *
 * Counts that belong to features not built yet are read as zero rather than
 * guessed. That is truthful: with no animals registered there really is no
 * animal with a registration sheet.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client.ts';
import { accountRoles } from '../../db/schema/core.ts';
import { memberships } from '../../db/schema/billing.ts';
import { findCase } from '../../identity/kyc.ts';
import { countRegisteredAnimals } from '../../animals/service.ts';
import { locked } from '../errors.ts';
import {
  evaluate,
  evaluateAll,
  vetWorkEligibility,
  type Eligibility,
  type EligibilityFacts,
  type ServiceName,
  type VetWorkEligibility,
} from './rules.ts';

export async function loadFacts(database: DbClient, accountId: string): Promise<EligibilityFacts> {
  const kyc = await findCase(database, accountId);
  const [membership] = await database
    .select({ status: memberships.status })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1);

  return {
    kycApproved: kyc?.status === 'APPROVED',
    // Membership lives on the account, so it is the same in every context (§7).
    membershipActive: membership?.status === 'ACTIVE',
    registeredAnimals: await countRegisteredAnimals(database, accountId),
    // Sheets, pedigrees, permits and allocations arrive in PROMPT-009 and later;
    // until then the honest count is zero.
    animalsWithRegistrationSheet: 0,
    animalsWithPedigree: 0,
    issuedMatingPermits: 0,
    puppiesWithFinalAllocation: 0,
  };
}

export async function eligibilityFor(
  database: DbClient,
  accountId: string,
  service: ServiceName,
): Promise<Eligibility> {
  return evaluate(service, await loadFacts(database, accountId));
}

export async function eligibilitySummary(database: DbClient, accountId: string) {
  const facts = await loadFacts(database, accountId);
  return { facts, services: evaluateAll(facts) };
}

/** Throws the three-part lock error when a service is not open (§5). */
export async function assertEligible(
  database: DbClient,
  accountId: string,
  service: ServiceName,
): Promise<void> {
  const result = await eligibilityFor(database, accountId, service);
  if (!result.allowed) throw locked(result.lock);
}

/** Trusted veterinarian work eligibility for a specific account (§7.1, D05). */
export async function vetEligibilityFor(
  database: DbClient,
  accountId: string,
): Promise<VetWorkEligibility | null> {
  const [role] = await database
    .select({ status: accountRoles.status })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.role, 'TRUSTED_VET')))
    .limit(1);
  if (!role) return null;

  const [membership] = await database
    .select({ status: memberships.status })
    .from(memberships)
    .where(eq(memberships.accountId, accountId))
    .limit(1);

  return vetWorkEligibility({
    roleStatus: role.status as 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED',
    membershipActive: membership?.status === 'ACTIVE',
  });
}

/**
 * Accounts a Finder query may return (§11.1, D02).
 *
 * The membership condition is applied in SQL rather than filtered afterwards, so
 * a vet who cannot accept new work never reaches the result list at all. The
 * location and facility conditions are added in PROMPT-007 where those tables
 * exist.
 */
export function finderEligibleVetCondition() {
  return and(
    eq(accountRoles.role, 'TRUSTED_VET'),
    eq(accountRoles.status, 'ACTIVE'),
    sql`exists (select 1 from membership m where m.account_id = ${accountRoles.accountId} and m.status = 'ACTIVE')`,
  );
}
