import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '../src/ui/logo.tsx';
import { ButtonLink } from '../src/ui/button.tsx';

export const metadata: Metadata = {
  title: { absolute: 'صفحه پیدا نشد | همزیست' },
  robots: { index: false, follow: false },
};

/**
 * Any address with no page — including a reserved Phase 2 section whose prompt
 * has not built it yet (DEC-0144). It replaces the framework's English default
 * and says nothing about why: an unpublished record and a mistyped address look
 * the same from outside.
 */
export default function NotFound() {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-(--size-content-md) flex-col items-center justify-center gap-lg px-lg text-center"
      data-testid="not-found"
    >
      <Link href="/" aria-label="همزیست — صفحه اصلی">
        <Logo height={32} />
      </Link>
      <h1 className="text-h3">صفحه‌ای با این نشانی پیدا نشد</h1>
      <p className="text-body-md text-text-secondary">
        ممکن است نشانی اشتباه نوشته شده باشد یا این صفحه هنوز منتشر نشده باشد.
      </p>
      <div className="flex flex-wrap justify-center gap-sm">
        <ButtonLink href="/">صفحه اصلی</ButtonLink>
        <ButtonLink tone="secondary" href="/dashboard">
          پنل من
        </ButtonLink>
      </div>
    </main>
  );
}
