/**
 * Request-scoped actor resolution.
 *
 * Sessions, OTP and roles land in PROMPT-004. Until they do, there is no way to
 * authenticate a request, so this returns null and every record-scoped route
 * answers 401. That is the correct behaviour for the foundation: an
 * unauthenticated caller must not be able to reach a private file, and no
 * placeholder actor is invented to make a route look like it works.
 */
import type { MaybeActor } from './actor.ts';

export async function currentActor(_request: Request): Promise<MaybeActor> {
  return null;
}
