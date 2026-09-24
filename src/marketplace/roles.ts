/**
 * Marketplace operational roles — PROMPT-002 (DEC-0204).
 *
 * Six independent roles, granted by the superadmin to an account that already
 * exists, on the same terms as the Phase 2 content roles: nobody is promoted
 * into one by holding another, and suspending keeps the row and the history.
 *
 * The role decides which address opens. What may be done once inside is decided
 * separately, capability by capability, in `model.ts` — a shell is not a
 * permission (§21.4).
 */
import type { Database, DbClient } from '../db/client.ts';
import type { AccountRoleName, Actor } from '../authz/actor.ts';
import { roleHolders, setAccountRole, type RoleFamily } from '../authz/role-grants.ts';
import { MARKETPLACE_CONTEXT_FA } from './model.ts';

export const MARKETPLACE_ROLES = [
  'MARKETPLACE_ADMIN',
  'LISTING_MODERATOR',
  'SELLER_REVIEWER',
  'FINANCE_OPERATOR',
  'DISPUTE_REVIEWER',
  'SUPPORT_AGENT',
] as const satisfies readonly AccountRoleName[];
export type MarketplaceRoleName = (typeof MARKETPLACE_ROLES)[number];

export const MARKETPLACE_ROLE_FA: Record<MarketplaceRoleName, string> = {
  MARKETPLACE_ADMIN: MARKETPLACE_CONTEXT_FA.MARKETPLACE_ADMIN!,
  LISTING_MODERATOR: MARKETPLACE_CONTEXT_FA.LISTING_MODERATOR!,
  SELLER_REVIEWER: MARKETPLACE_CONTEXT_FA.SELLER_REVIEWER!,
  FINANCE_OPERATOR: MARKETPLACE_CONTEXT_FA.FINANCE_OPERATOR!,
  DISPUTE_REVIEWER: MARKETPLACE_CONTEXT_FA.DISPUTE_REVIEWER!,
  SUPPORT_AGENT: MARKETPLACE_CONTEXT_FA.SUPPORT_AGENT!,
};

const FAMILY: RoleFamily = {
  roles: MARKETPLACE_ROLES,
  labelFa: MARKETPLACE_ROLE_FA,
  grantedAction: 'MARKETPLACE_ROLE_GRANTED',
  suspendedAction: 'MARKETPLACE_ROLE_SUSPENDED',
  wrongShellFa: 'نقش‌های بازار فقط در محیط سوپرادمین مدیریت می‌شوند.',
};

export async function marketplaceRoleHolders(database: DbClient, actor: Actor) {
  return roleHolders(database, actor, FAMILY);
}

export async function setMarketplaceRole(
  database: Database,
  actor: Actor,
  input: { mobile: string; role: string; active: boolean; reason: string },
): Promise<void> {
  return setAccountRole(database, actor, FAMILY, input);
}
