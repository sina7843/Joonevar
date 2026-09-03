import { redirect } from 'next/navigation';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { db } from '../../../src/db/client.ts';
import { findProfile } from '../../../src/identity/account.ts';
import { IdentityForm } from '../profile-forms.tsx';
import { Logo } from '../../../src/ui/logo.tsx';

export const dynamic = 'force-dynamic';

/**
 * Account completion for a new account (§6.1 step 4).
 *
 * `next` carries the originating request through, so finishing the profile
 * returns to the service the person was trying to reach.
 */
export default async function CompleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const guard = await guardRoute('/account/complete');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const profile = await findProfile(db(), guard.actor.accountId);
  if (profile !== null) redirect('/account/profile');

  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  return (
    <main className="mx-auto max-w-(--size-content-md) space-y-xl p-lg">
      <div className="flex flex-col items-center gap-md">
        <Logo height={32} />
        <h1 className="text-h3">تکمیل حساب</h1>
        <p className="text-center text-body-sm text-text-secondary">
          برای ادامه، اطلاعات هویتی خود را وارد کنید. احراز هویت مرحله جداگانه‌ای است.
        </p>
      </div>
      <IdentityForm values={{}} nationalIdLocked={false} mode="complete" next={safeNext} />
    </main>
  );
}
