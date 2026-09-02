import { redirect } from 'next/navigation';
import { db } from '../../src/db/client.ts';
import { currentActor } from '../../src/authz/request-actor.ts';
import { LoginForm } from './login-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * Sign-in (§6.1). Mobile → code → session.
 *
 * `next` carries the originating request so a returning account resumes exactly
 * where it left off instead of landing on a generic list (§8).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  // Already signed in: honour the origin rather than showing the form again.
  const actor = await currentActor(db());
  if (actor !== null) redirect(safeNext ?? '/dashboard');

  return <LoginForm next={safeNext} />;
}
