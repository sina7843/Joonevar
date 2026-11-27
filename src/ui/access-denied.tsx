import Link from 'next/link';
import { Logo } from './logo.tsx';
import { Icon } from './icon.tsx';
import type { AppError } from '../domain/errors.ts';

/**
 * Denial screen — DS *AccessDenied* (`.hz-state`).
 *
 * It states which of the two things is missing — being signed in, or holding
 * the context — without leaking whether the target record exists.
 */
export function AccessDenied({ error }: { error: AppError }) {
  const unauthenticated = error.code === 'UNAUTHENTICATED';
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-(--size-content-lg) flex-col items-center justify-center gap-lg p-xl">
      <Link href="/" aria-label="همزیست — صفحه اصلی">
        <Logo size="mobile" />
      </Link>
      <div className="hz-card w-full">
        <div className="hz-state">
          <span className="hz-state__icon">
            <Icon name={unauthenticated ? 'signIn' : 'lockSimple'} size="lg" mirror={unauthenticated} />
          </span>
          <h1 className="hz-state__title">{unauthenticated ? 'ورود لازم است' : 'دسترسی مجاز نیست'}</h1>
          <p className="hz-state__body">
            {unauthenticated
              ? 'برای دیدن این صفحه باید وارد حساب خود شوید.'
              : 'این صفحه در نقش فعلی شما در دسترس نیست. محیط‌های عملیاتی انجمن، مرکز ژنتیک و سوپرادمین جدا هستند و با تغییر نقش عمومی باز نمی‌شوند.'}
          </p>
          {/* What is missing, in words; the machine code stays out of sight for tests (CMPA1-007). */}
          <p className="hz-state__missing" data-testid="denial-code" data-code={error.code}>
            آنچه کم است: <b>{unauthenticated ? 'ورود به حساب' : 'نقش یا محیط عملیاتی لازم برای این صفحه'}</b>
          </p>
          <div className="hz-state__actions">
            {unauthenticated ? (
              <Link href="/login" className="hz-btn hz-btn--primary">
                ورود / ثبت‌نام
              </Link>
            ) : (
              <Link href="/dashboard" className="hz-btn hz-btn--secondary">
                بازگشت به پنل من
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * A record that this actor may not see. The answer is the same whether the
 * record belongs to somebody else or does not exist, so one owner cannot probe
 * for another owner's identifiers.
 */
export function RecordNotFound({ error }: { error: AppError }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-(--size-content-lg) flex-col items-center justify-center gap-lg p-xl">
      <Link href="/" aria-label="همزیست — صفحه اصلی">
        <Logo size="mobile" />
      </Link>
      <div className="hz-card w-full">
        <div className="hz-state">
          <span className="hz-state__icon">
            <Icon name="magnifyingGlass" size="lg" />
          </span>
          <h1 className="hz-state__title" data-testid="record-not-found">
            {error.message}
          </h1>
          <p className="hz-state__body">
            اگر فکر می‌کنید این پرونده باید در دسترس شما باشد، از فهرست حیوان‌های خود وارد شوید.
          </p>
          <p className="hz-state__missing" data-testid="denial-code" data-code={error.code}>
            این پرونده برای این حساب در دسترس نیست
          </p>
          <div className="hz-state__actions">
            <Link href="/animals" className="hz-btn hz-btn--secondary">
              حیوان‌های من
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
