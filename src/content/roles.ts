/**
 * Content roles — P2-D11, Requirements-Phase-2 §3 (PROMPT-004).
 *
 * AUTHOR and CONTENT_ADMIN are granted by the superadmin to an account that
 * already exists, independent of every other role: a veterinarian, breeder or
 * operator is not an author unless this says so. Suspending keeps the row and
 * the content; the environment simply stops opening (DEC-0158).
 *
 * The mechanics moved to `src/authz/role-grants.ts` when Phase 3 added six more
 * operational roles with exactly the same grant rules (DEC-0204). What is left
 * here is this family's own list, its labels and its audit action names.
 */
import type { Database, DbClient } from '../db/client.ts';
import type { Actor } from '../authz/actor.ts';
import { roleHolders, setAccountRole, type RoleFamily } from '../authz/role-grants.ts';

// Independent Phase 2 roles granted here; the review operator joined with PROMPT-007 (DEC-0165).
export const CONTENT_ROLES = ['AUTHOR', 'CONTENT_ADMIN', 'REVIEW_OPERATOR'] as const;
export type ContentRoleName = (typeof CONTENT_ROLES)[number];

export const CONTENT_ROLE_FA: Record<ContentRoleName, string> = {
  AUTHOR: 'نویسنده',
  CONTENT_ADMIN: 'ادمین محتوا',
  REVIEW_OPERATOR: 'اپراتور بررسی',
};

const FAMILY: RoleFamily = {
  roles: CONTENT_ROLES,
  labelFa: CONTENT_ROLE_FA,
  grantedAction: 'CONTENT_ROLE_GRANTED',
  suspendedAction: 'CONTENT_ROLE_SUSPENDED',
  wrongShellFa: 'نقش‌های محتوا فقط در محیط سوپرادمین مدیریت می‌شوند.',
};

export async function contentRoleHolders(database: DbClient, actor: Actor) {
  return roleHolders(database, actor, FAMILY);
}

export async function setContentRole(
  database: Database,
  actor: Actor,
  input: { mobile: string; role: string; active: boolean; reason: string },
): Promise<void> {
  return setAccountRole(database, actor, FAMILY, input);
}
