import { Logo } from './logo.tsx';
import type { AppError } from '../domain/errors.ts';

/**
 * Denial screen.
 *
 * It states which of the two things is missing — being signed in, or holding
 * the context — without leaking whether the target record exists. Sign-in does
 * not exist yet (PROMPT-004), so the page says so plainly instead of linking to
 * a route that is not built.
 */
export function AccessDenied({ error }: { error: AppError }) {
  const unauthenticated = error.code === 'UNAUTHENTICATED';
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--size-content-lg) flex-col items-center justify-center gap-lg p-xl text-center">
      <Logo height={32} />
      <h1 className="text-h3">{unauthenticated ? 'ورود لازم است' : 'دسترسی مجاز نیست'}</h1>
      <p className="text-body-sm text-text-secondary">
        {unauthenticated
          ? 'برای دیدن این صفحه باید وارد حساب خود شوید. مسیر ورود و کد یک‌بارمصرف در مرحله بعدِ پیاده‌سازی ساخته می‌شود.'
          : 'این صفحه در نقش فعلی شما در دسترس نیست. محیط‌های عملیاتی انجمن، مرکز ژنتیک و سوپرادمین جدا هستند و با تغییر نقش عمومی باز نمی‌شوند.'}
      </p>
      <p className="text-caption text-text-disabled" data-testid="denial-code">
        {error.code}
      </p>
    </main>
  );
}

/**
 * A record that this actor may not see.
 *
 * Ownership is checked per record on the server, and the answer is the same
 * whether the record belongs to somebody else or does not exist at all, so
 * one owner cannot probe for another owner's identifiers.
 */
export function RecordNotFound({ error }: { error: AppError }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-(--size-content-lg) flex-col items-center justify-center gap-lg p-xl text-center">
      <Logo height={32} />
      <h1 className="text-h3" data-testid="record-not-found">
        {error.message}
      </h1>
      <p className="text-body-sm text-text-secondary">
        اگر فکر می‌کنید این پرونده باید در دسترس شما باشد، از فهرست حیوان‌های خود وارد شوید.
      </p>
      <p className="text-caption text-text-disabled" data-testid="denial-code">
        {error.code}
      </p>
    </main>
  );
}
