import { NextResponse } from 'next/server';
import { db } from '../../../src/db/client.ts';
import { currentSession } from '../../../src/authz/request-actor.ts';
import { setSessionContext } from '../../../src/identity/session.ts';
import { ACTOR_CONTEXTS, type ActorContextName } from '../../../src/authz/actor.ts';
import { forbidden, toErrorBody, unauthenticated, validation } from '../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * Role switch.
 *
 * The context lives on the session row, so this endpoint is the switch. It
 * re-checks the role on the server and refuses an operational context outright:
 * those are separate shells, not a promotion of a public account (D10, D11).
 */
export async function POST(request: Request) {
  try {
    const session = await currentSession(db());
    if (session === null) throw unauthenticated();

    const form = await request.formData();
    const requested = String(form.get('context') ?? '') as ActorContextName;
    const returnTo = String(form.get('returnTo') ?? '/dashboard');

    if (!ACTOR_CONTEXTS.includes(requested)) throw validation('Unknown context');
    if (requested === 'ASSOCIATION_OPERATOR' || requested === 'GENETICS_OPERATOR' || requested === 'SUPERADMIN') {
      throw forbidden('Operational environments are separate shells, not a public role switch');
    }

    await setSessionContext(db(), session.sessionId, requested);

    // Only a relative path is followed, so the switch cannot become an open
    // redirect, and a relative Location keeps the browser on the same origin.
    const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
    return new NextResponse(null, { status: 303, headers: { Location: safeReturn } });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
