/**
 * Request binding for actor resolution.
 *
 * Kept separate from the authorization rules so those stay testable outside the
 * framework. This file is the only place that touches request cookies.
 *
 * The development actor override that PROMPT-003 used is gone: sign-in is real
 * now, so the session cookie is the single way to become an actor. There is no
 * bypass path in any environment.
 */
import { cookies } from 'next/headers';
import type { Database } from '../db/client.ts';
import { resolveSession, SESSION_COOKIE, type ResolvedSession } from '../identity/session.ts';
import type { MaybeActor } from './actor.ts';

export async function currentSession(database: Database): Promise<ResolvedSession | null> {
  const store = await cookies();
  return resolveSession(database, store.get(SESSION_COOKIE)?.value);
}

export async function currentActor(database: Database): Promise<MaybeActor> {
  return (await currentSession(database))?.actor ?? null;
}
