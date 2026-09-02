import { NextResponse } from 'next/server';
import { db } from '../../../src/db/client.ts';
import { currentActor } from '../../../src/authz/request-actor.ts';
import { DEV_ACTOR_COOKIE, devOverrideAllowed } from '../../../src/authz/session.ts';
import { canEnterContext, ACTOR_CONTEXTS, type ActorContextName } from '../../../src/authz/actor.ts';
import { forbidden, toErrorBody, unauthenticated, validation } from '../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * Role switch.
 *
 * The switch is decided on the server: the requested context must be one the
 * account actually holds. Hiding a chip in the UI is presentation only — this
 * endpoint is the gate, and it refuses an operational context outright so a
 * public role can never be promoted into one (D10, D11).
 */
export async function POST(request: Request) {
  try {
    const actor = await currentActor(db());
    if (actor === null) throw unauthenticated();

    const form = await request.formData();
    const requested = String(form.get('context') ?? '') as ActorContextName;
    const returnTo = String(form.get('returnTo') ?? '/dashboard');

    if (!ACTOR_CONTEXTS.includes(requested)) throw validation('Unknown context');
    if (requested === 'ASSOCIATION_OPERATOR' || requested === 'GENETICS_OPERATOR' || requested === 'SUPERADMIN') {
      throw forbidden('Operational environments are separate shells, not a public role switch');
    }
    if (!canEnterContext(actor.activeRoles, requested)) {
      throw forbidden('This account does not hold the ' + requested + ' role');
    }
    // Only a relative path may be returned to, so the switch cannot be used as
    // an open redirect.
    const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';

    // A relative Location keeps the redirect on the exact origin the browser
    // used. Rebuilding an absolute URL from request.url can switch the host
    // (127.0.0.1 to localhost), which silently drops the session cookie.
    const response = new NextResponse(null, { status: 303, headers: { Location: safeReturn } });
    if (devOverrideAllowed()) {
      response.cookies.set(DEV_ACTOR_COOKIE, actor.accountId + ':' + requested, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
    return response;
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
