'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '../db/client.ts';
import { SESSION_COOKIE, resolveSession, revokeSession } from './session.ts';

/**
 * Sign out — §5.
 *
 * The session is revoked on the server first, so the cookie is not the only
 * thing standing between a shared device and the account. It lives here rather
 * than beside a page because the shell offers it on every screen.
 */
export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const session = await resolveSession(db(), token);
    if (session) await revokeSession(db(), session.sessionId);
  }
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
