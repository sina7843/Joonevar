/**
 * Request-scoped actor resolution.
 *
 * Real sessions, OTP and KYC land in PROMPT-004. Until then there is no way to
 * authenticate a person, so the default answer is "nobody" and every guarded
 * route refuses.
 *
 * A development-only override exists so the shells can actually be rendered and
 * reviewed. It is deliberately narrow: it works only outside production with
 * local integrations, it resolves against a real account row, and it accepts
 * only the clearly-labelled synthetic fixture accounts on the reserved 0999
 * prefix. The role check is the same one production will use — the override
 * decides who you are, never what you are allowed to do.
 */
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { accountRoles, accounts } from '../db/schema/core.ts';
import { FIXTURE_MOBILE_PREFIX } from '../db/seed/dev-fixtures.ts';
import { env as loadEnv, type Env } from '../config/env.ts';
import { canEnterContext, type AccountRoleName, type ActorContextName, type MaybeActor } from './actor.ts';
import { ACTOR_CONTEXTS } from './actor.ts';

export const DEV_ACTOR_COOKIE = 'hz_dev_actor';

export function devOverrideAllowed(env: Env = loadEnv()): boolean {
  return env.APP_ENV !== 'production' && env.INTEGRATION_MODE === 'local';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookie(raw: string): { accountId: string; context: ActorContextName } | null {
  const separator = raw.lastIndexOf(':');
  if (separator <= 0) return null;
  const accountId = raw.slice(0, separator);
  const context = raw.slice(separator + 1) as ActorContextName;
  // Shape is checked before the value reaches the database, so a malformed
  // cookie is a plain "nobody" rather than a query error.
  if (!UUID.test(accountId)) return null;
  if (!ACTOR_CONTEXTS.includes(context)) return null;
  return { accountId, context };
}

/**
 * Resolve a development actor from a cookie value. Exported separately from the
 * request plumbing so the rules can be tested without HTTP.
 */
export async function resolveDevActor(
  database: DbClient,
  raw: string | undefined,
  env: Env = loadEnv(),
): Promise<MaybeActor> {
  if (!raw || !devOverrideAllowed(env)) return null;
  const parsed = parseCookie(raw);
  if (parsed === null) return null;

  const [account] = await database
    .select({ id: accounts.id, mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, parsed.accountId))
    .limit(1);

  // Only the synthetic fixtures may be impersonated, so this can never stand in
  // for a real person's account.
  if (!account || !account.mobile.startsWith(FIXTURE_MOBILE_PREFIX)) return null;

  const roleRows = await database
    .select({ role: accountRoles.role })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, account.id), eq(accountRoles.status, 'ACTIVE')));
  const activeRoles = roleRows.map((r) => r.role as AccountRoleName);

  // Holding the cookie is not enough: the context still requires the role.
  if (!canEnterContext(activeRoles, parsed.context)) return null;

  return { accountId: account.id as never, context: parsed.context, activeRoles };
}
