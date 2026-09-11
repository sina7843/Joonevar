import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '../ui/logo.tsx';
import { DesktopNav, MobileMenu, type NavLink } from './site-nav.tsx';
import { liveSections } from './sections.ts';
import { viewer } from './request.ts';

/**
 * Shell of the public site — Requirements-Phase-2 §4 (DEC-0149).
 *
 * This is the storefront a visitor sees before signing in. It is not the
 * application shell (`PublicShell` in `src/ui/shell.tsx`, for the signed-in
 * user, breeder and vet contexts) and it grants nothing: the account link only
 * leads to sign-in or to the panel, where the server decides access as before.
 *
 * No contact details, licences or social links are shown: none are known yet,
 * and an invented one would be worse than none.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const actor = await viewer();
  const links: readonly NavLink[] = liveSections().map(({ href, label }) => ({ href, label }));
  const account: NavLink =
    actor === null ? { href: '/login', label: 'ورود / ثبت‌نام' } : { href: '/dashboard', label: 'پنل من' };

  return (
    <div className="flex min-h-dvh flex-col bg-bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-sm focus:right-sm focus:z-30 focus:rounded-md focus:bg-bg-surface focus:px-md focus:py-sm"
      >
        رفتن به محتوای اصلی
      </a>

      <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex min-h-[var(--size-header-mobile)] max-w-6xl items-center justify-between gap-md px-lg">
          <div className="flex min-w-0 items-center gap-lg">
            <Link href="/" aria-label="همزیست — صفحه اصلی" className="shrink-0">
              <Logo height={28} />
            </Link>
            <DesktopNav links={links} />
          </div>
          <div className="flex shrink-0 items-center gap-xs">
            <Link
              href={account.href}
              className="inline-flex min-h-[var(--size-control-sm)] items-center rounded-md bg-action-primary-default px-md text-label-md text-action-primary-on hover:opacity-90"
              data-testid="site-account-link"
            >
              {account.label}
            </Link>
            <MobileMenu links={links} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-lg py-xl">
        {children}
      </main>

      <footer className="border-t border-border-subtle bg-bg-surface" data-testid="site-footer">
        <div className="mx-auto flex max-w-6xl flex-col gap-lg px-lg py-xl md:flex-row md:items-start md:justify-between">
          <div className="space-y-sm">
            <Logo variant="symbol" height={40} />
            <p className="max-w-(--size-content-md) text-body-sm text-text-secondary">
              ثبت و پیگیری هویت، نسب و اسناد سگ‌ها در یک سامانه فارسی.
            </p>
          </div>
          <nav aria-label="پیوندهای پایین صفحه">
            <ul className="flex flex-wrap gap-x-lg gap-y-sm text-label-md">
              {[...links, account].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-[var(--size-touch-min)] items-center text-text-secondary hover:text-text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
