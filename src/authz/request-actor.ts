/**
 * Next.js request binding for actor resolution.
 *
 * Kept separate from `session.ts` so the authorization rules stay importable —
 * and testable — outside the framework. This file is the only place that
 * touches request headers.
 */
import { cookies } from 'next/headers';
import type { DbClient } from '../db/client.ts';
import { env as loadEnv } from '../config/env.ts';
import { DEV_ACTOR_COOKIE, devOverrideAllowed, resolveDevActor } from './session.ts';
import type { MaybeActor } from './actor.ts';

export async function currentActor(database: DbClient): Promise<MaybeActor> {
  const env = loadEnv();
  if (!devOverrideAllowed(env)) return null;
  const store = await cookies();
  return resolveDevActor(database, store.get(DEV_ACTOR_COOKIE)?.value, env);
}
