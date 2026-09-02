/**
 * Server sessions.
 *
 * The cookie holds a random token; the database holds only its SHA-256. A read
 * of the session table therefore cannot be replayed as a login.
 *
 * The active context lives on the session row, not in the cookie, which is what
 * makes a role switch a server decision rather than a client claim (D10).
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accountRoles, accounts } from '../db/schema/core.ts';
import { sessions } from '../db/schema/identity.ts';
import { readInt } from '../settings/service.ts';
import { canEnterContext, type AccountRoleName, type ActorContextName, type MaybeActor } from '../authz/actor.ts';
import { forbidden } from '../domain/errors.ts';
import type { AccountId } from '../domain/ids.ts';

export const SESSION_COOKIE = 'hz_session';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssuedSession {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export async function createSession(
  database: Database,
  accountId: string,
  context: ActorContextName = 'USER',
  now: Date = new Date(),
): Promise<IssuedSession> {
  const ttlDays = await readInt(database, 'session.ttl_days');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
  const [row] = await database
    .insert(sessions)
    .values({ accountId, tokenHash: hashToken(token), context, expiresAt })
    .returning({ id: sessions.id });
  return { token, sessionId: row!.id, expiresAt };
}

export interface ResolvedSession {
  readonly sessionId: string;
  readonly actor: NonNullable<MaybeActor>;
}

async function activeRolesOf(database: DbClient, accountId: string): Promise<readonly AccountRoleName[]> {
  const rows = await database
    .select({ role: accountRoles.role })
    .from(accountRoles)
    .where(and(eq(accountRoles.accountId, accountId), eq(accountRoles.status, 'ACTIVE')));
  return rows.map((r) => r.role as AccountRoleName);
}

/**
 * Resolve a request token to an actor.
 *
 * Roles are read on every request rather than baked into the session, so
 * losing a role takes effect immediately instead of at the next sign-in. If the
 * stored context is no longer permitted, the session falls back to USER rather
 * than keeping a stale privilege.
 */
export async function resolveSession(
  database: Database,
  token: string | undefined,
  now: Date = new Date(),
): Promise<ResolvedSession | null> {
  if (!token) return null;
  const [row] = await database
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;

  const [account] = await database
    .select({ id: accounts.id, status: accounts.status })
    .from(accounts)
    .where(eq(accounts.id, row.accountId))
    .limit(1);
  if (!account || account.status === 'DISABLED') return null;

  const activeRoles = await activeRolesOf(database, row.accountId);
  const context = canEnterContext(activeRoles, row.context as ActorContextName)
    ? (row.context as ActorContextName)
    : 'USER';

  await database.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.id));

  return {
    sessionId: row.id,
    actor: { accountId: row.accountId as AccountId, context, activeRoles },
  };
}

/** Switching context re-checks the role on the server before anything changes. */
export async function setSessionContext(
  database: Database,
  sessionId: string,
  context: ActorContextName,
): Promise<void> {
  const [row] = await database.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!row) throw forbidden();
  const activeRoles = await activeRolesOf(database, row.accountId);
  if (!canEnterContext(activeRoles, context)) {
    throw forbidden('This account does not hold the ' + context + ' role');
  }
  await database.update(sessions).set({ context }).where(eq(sessions.id, sessionId));
}

export async function revokeSession(database: Database, sessionId: string, now: Date = new Date()): Promise<void> {
  await database.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
}

/**
 * Used when the account's own phone number changes: every other session is cut,
 * because the credential that could create them has moved.
 */
export async function revokeOtherSessions(
  database: Database,
  accountId: string,
  keepSessionId: string,
  now: Date = new Date(),
): Promise<number> {
  const revoked = await database
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  // Restore the current one so the actor who made the change stays signed in.
  await database.update(sessions).set({ revokedAt: null }).where(eq(sessions.id, keepSessionId));
  return revoked.filter((r) => r.id !== keepSessionId).length;
}
