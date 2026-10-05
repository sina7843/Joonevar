import Link from 'next/link';
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
 * K8 continued: the same cream chrome and centred white step card as sign-in
 * (P07 single step), since this is the screen right after the code.
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
    <div className="flex min-h-dvh flex-col bg-bg-page">
      <header className="hz-site-header">
        <div className="hz-container">
          <div className="hz-site-header__bar">
            <Link href="/" aria-label="همزیست — صفحه اصلی">
              <Logo size="responsive" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="hz-container flex flex-1 flex-col items-center gap-xl py-s40 outline-none">
        <div className="flex max-w-(--size-content-lg) flex-col items-center gap-md text-center">
          <Logo variant="symbol" height={64} />
          <h1 className="hz-h1">تکمیل حساب</h1>
          <p className="hz-body-lg">برای ادامه، اطلاعات هویتی خود را وارد کنید. احراز هویت مرحله جداگانه‌ای است.</p>
        </div>

        <section className="hz-card w-full max-w-(--size-content-md)" aria-labelledby="complete-step">
          <p className="hz-overline">پس از ورود</p>
          <h2 id="complete-step" className="hz-h3 mb-lg">
            اطلاعات هویتی
          </h2>
          <IdentityForm values={{}} nationalIdLocked={false} mode="complete" next={safeNext} />
        </section>
      </main>
    </div>
  );
}
