/**
 * Server-side page guard.
 *
 * The check lives in the page itself, next to the data it protects, because a
 * layout renders in parallel with its page in the App Router — guarding only in
 * the layout would still let the page run its queries. Every guarded page calls
 * this before it reads anything.
 */
import { db } from '../db/client.ts';
import { AppError } from '../domain/errors.ts';
import { currentSession } from './request-actor.ts';
import { setSessionContext } from '../identity/session.ts';
import { accessForRoute, assertRouteAccess, selectContext } from './routes.ts';
import type { Actor, MaybeActor } from './actor.ts';

export type GuardResult =
  | { readonly ok: true; readonly actor: Actor }
  | { readonly ok: false; readonly denied: AppError };

export async function guardRoute(pathname: string): Promise<GuardResult> {
  const session = await currentSession(db());
  const actor: MaybeActor = session?.actor ?? null;

  try {
    const access = accessForRoute(pathname);
    if (access !== 'PUBLIC' && actor !== null && session !== null) {
      const selected = selectContext(actor, access);
      if (selected !== null && selected !== actor.context) {
        // Persisted so the shell navigation and the role switcher agree with
        // the context this request is actually being served in.
        await setSessionContext(db(), session.sessionId, selected);
        const switched: Actor = { ...actor, context: selected };
        assertRouteAccess(switched, pathname);
        return { ok: true, actor: switched };
      }
    }

    const allowed = assertRouteAccess(actor, pathname);
    if (allowed === null) throw new AppError('UNAUTHENTICATED', 'Sign-in required');
    return { ok: true, actor: allowed };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, denied: error };
    throw error;
  }
}

export const isDenied = (result: GuardResult): result is { ok: false; denied: AppError } => !result.ok;
