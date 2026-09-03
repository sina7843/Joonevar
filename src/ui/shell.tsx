import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo.tsx';
import { RoleSwitcher, CONTEXT_LABEL_FA } from './role-switcher.tsx';
import { switchableContexts, type Actor, type ActorContextName } from '../authz/actor.ts';
import { db } from '../db/client.ts';
import { findProfile } from '../identity/account.ts';
import { signOutAction } from '../identity/sign-out-action.ts';

/**
 * Who is signed in, and the way out.
 *
 * Signing out was reachable only from the profile screen, and on a wide screen
 * the bottom tabs are hidden, so there was no way to leave the account at all.
 * The name is the person's own; before the profile exists it says so instead of
 * inventing one.
 */
async function AccountMenu({ actor }: { actor: Actor }) {
  const profile = await findProfile(db(), actor.accountId);
  const name = profile === null ? 'حساب من' : profile.firstName + ' ' + profile.lastName;

  return (
    <div className="flex items-center gap-sm">
      <Link
        href="/account/profile"
        className="max-w-[12ch] truncate text-label-md text-text-primary underline-offset-4 hover:underline"
        data-testid="account-name"
      >
        {name}
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="min-h-[var(--size-control-sm)] rounded-md px-md text-label-md text-text-secondary hover:text-text-brand"
          data-testid="header-sign-out"
        >
          خروج
        </button>
      </form>
    </div>
  );
}

interface NavItem {
  readonly href: string;
  readonly label: string;
}

/** Bottom tabs of the approved dashboard (prototype OWN-001, node 116:481). */
const PUBLIC_TABS: readonly NavItem[] = [
  { href: '/dashboard', label: 'خانه' },
  { href: '/requests', label: 'درخواست‌ها' },
  { href: '/notifications', label: 'اعلان‌ها' },
  { href: '/profile', label: 'پروفایل' },
];

const VET_TABS: readonly NavItem[] = [
  { href: '/vet', label: 'صف من' },
  { href: '/vet/check-in', label: 'پذیرش' },
  { href: '/vet/samples', label: 'نمونه‌ها' },
  { href: '/profile', label: 'پروفایل' },
];

/**
 * Public shell for the user, breeder and trusted vet contexts.
 *
 * The layout is RTL first and mobile first: a fixed header, a scrolling main
 * column capped for readability, and a bottom tab bar on small screens that
 * becomes a side rail from the medium breakpoint up.
 */
export async function PublicShell({
  actor,
  title,
  pathname,
  unreadCount = 0,
  children,
}: {
  actor: Actor;
  title: string;
  pathname: string;
  unreadCount?: number;
  children: ReactNode;
}) {
  const contexts = switchableContexts(actor.activeRoles);
  const tabs = actor.context === 'TRUSTED_VET' ? VET_TABS : PUBLIC_TABS;

  return (
    <div className="min-h-dvh bg-bg-canvas">
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex min-h-[var(--size-header-mobile)] max-w-3xl items-center justify-between gap-md px-lg">
          <div className="flex items-center gap-md">
            <Link href="/dashboard" aria-label="همزیست">
              <Logo height={24} />
            </Link>
            <h1 className="text-label-lg">{title}</h1>
          </div>
          <div className="flex items-center gap-md">
            <Link
              href="/notifications"
              aria-label={'اعلان‌ها' + (unreadCount > 0 ? ' — ' + unreadCount + ' مورد خوانده‌نشده' : '')}
              className="relative text-text-brand"
            >
              <span aria-hidden="true" className="text-h4">
                ⌾
              </span>
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -left-1 size-[8px] rounded-full bg-status-error-border" />
              ) : null}
            </Link>
            <AccountMenu actor={actor} />
          </div>
        </div>

        {/* The bottom tabs are hidden on a wide screen, so the same destinations
            are offered here instead of leaving the desktop with no navigation. */}
        <nav aria-label="ناوبری اصلی (دسکتاپ)" className="mx-auto hidden max-w-3xl gap-lg px-lg pb-sm md:flex">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'py-sm text-label-md',
                  active ? 'text-text-brand' : 'text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-lg pb-[96px] pt-lg md:pb-xl">
        {contexts.length > 1 ? (
          <div className="mb-lg">
            <RoleSwitcher contexts={contexts} active={actor.context} returnTo={pathname} />
          </div>
        ) : null}
        <main>{children}</main>
      </div>

      <nav
        aria-label="ناوبری اصلی"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-bg-surface md:hidden"
      >
        <ul className="mx-auto flex max-w-3xl">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'flex min-h-[var(--size-touch-min)] items-center justify-center py-md text-label-sm',
                    active ? 'text-text-brand' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Operational shell — D11.
 *
 * Association, genetics centre and superadmin each get their own environment
 * with its own navigation. It is a separate shell rather than an extra tab in
 * the public app, and it is never reachable by switching a public role.
 */
export async function OpsShell({
  actor,
  title,
  pathname,
  nav,
  children,
}: {
  actor: Actor;
  title: string;
  pathname: string;
  nav: readonly NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="border-b border-border-subtle bg-bg-surface">
        <div className="mx-auto flex min-h-[var(--size-header-mobile)] max-w-6xl items-center justify-between gap-md px-lg">
          <div className="flex items-center gap-md">
            <Logo height={24} />
            <h1 className="text-label-lg">{title}</h1>
          </div>
          <div className="flex items-center gap-md">
            <p className="text-caption text-text-secondary">
              محیط عملیاتی — {CONTEXT_LABEL_FA[actor.context as ActorContextName]}
            </p>
            <AccountMenu actor={actor} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-lg px-lg py-lg md:flex-row">
        <nav aria-label="ناوبری عملیاتی" className="md:w-56 md:shrink-0">
          <ul className="hz-rail flex gap-sm md:flex-col">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'block rounded-md px-lg py-sm text-label-md whitespace-nowrap',
                      'min-h-[var(--size-control-sm)]',
                      active ? 'bg-bg-brand-subtle text-text-brand' : 'text-text-secondary hover:bg-bg-surface',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export const ASSOC_NAV: readonly NavItem[] = [
  { href: '/assoc', label: 'صف‌ها' },
  { href: '/assoc/kyc', label: 'احراز هویت' },
  { href: '/assoc/members', label: 'عضویت' },
  { href: '/assoc/kennels', label: 'کنل' },
  { href: '/assoc/permits', label: 'مجوز جفت‌گیری' },
  { href: '/assoc/postal', label: 'درخواست‌های پستی' },
  { href: '/assoc/foreign-pedigree', label: 'شجره‌نامه خارجی' },
  { href: '/assoc/issuers', label: 'صادرکنندگان' },
];

export const GENETICS_NAV: readonly NavItem[] = [
  { href: '/genetics', label: 'داشبورد' },
  { href: '/genetics/receipts', label: 'فیش‌ها' },
  { href: '/genetics/samples', label: 'نمونه‌ها' },
  { href: '/genetics/results', label: 'نتایج' },
  { href: '/genetics/appeals', label: 'اعتراض‌ها' },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin', label: 'مرور' },
  { href: '/admin/settings', label: 'تنظیمات' },
  { href: '/admin/vets', label: 'دامپزشکان معتمد' },
  { href: '/admin/breeds', label: 'نژادها' },
  { href: '/admin/audit', label: 'تاریخچه' },
];
