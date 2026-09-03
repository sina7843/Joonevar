import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
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
    <div className="flex shrink-0 items-center gap-2xs">
      {/* The name is the wide part, so it is the part that gives way first: on a
          narrow header the person icon still leads to the same place. */}
      <Link
        href="/account/profile"
        className="flex min-h-[var(--size-touch-min)] items-center gap-2xs rounded-md px-2xs text-label-md text-text-primary hover:text-text-brand"
        data-testid="account-name"
        title={name}
      >
        <Icon name="user" size="sm" />
        <span className="hidden max-w-[14ch] truncate sm:inline">{name}</span>
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          aria-label="خروج از حساب"
          className="flex min-h-[var(--size-touch-min)] items-center gap-2xs rounded-md px-2xs text-label-md text-text-secondary hover:text-text-brand"
          data-testid="header-sign-out"
        >
          <Icon name="signOut" size="sm" mirror />
          <span className="hidden whitespace-nowrap sm:inline">خروج</span>
        </button>
      </form>
    </div>
  );
}

interface NavItem {
  readonly href: string;
  readonly label: string;
  /** DS 48:472 — the glyph of `Navigation/Bottom Item Icon`. */
  readonly icon: IconName;
}

/** Bottom tabs of the approved dashboard (prototype OWN-001, node 116:481). */
const PUBLIC_TABS: readonly NavItem[] = [
  { href: '/dashboard', label: 'خانه', icon: 'house' },
  { href: '/requests', label: 'درخواست‌ها', icon: 'clipboardText' },
  { href: '/notifications', label: 'اعلان‌ها', icon: 'bell' },
  { href: '/profile', label: 'پروفایل', icon: 'user' },
];

const VET_TABS: readonly NavItem[] = [
  { href: '/vet', label: 'صف من', icon: 'listChecks' },
  { href: '/vet/check-in', label: 'پذیرش', icon: 'qrCode' },
  { href: '/vet/samples', label: 'نمونه‌ها', icon: 'testTube' },
  { href: '/profile', label: 'پروفایل', icon: 'user' },
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
        <div className="mx-auto flex min-h-[var(--size-header-mobile)] max-w-3xl items-center justify-between gap-sm px-lg">
          <div className="flex min-w-0 items-center gap-sm">
            <Link href="/dashboard" aria-label="همزیست" className="shrink-0">
              <Logo height={24} />
            </Link>
            <h1 className="truncate text-label-lg">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2xs">
            <Link
              href="/notifications"
              aria-label={'اعلان‌ها' + (unreadCount > 0 ? ' — ' + unreadCount + ' مورد خوانده‌نشده' : '')}
              className="relative flex min-h-[var(--size-touch-min)] items-center px-2xs text-text-brand"
            >
              <Icon name="bell" size="md" weight={unreadCount > 0 ? 'fill' : 'regular'} />
              {unreadCount > 0 ? (
                <span className="absolute top-md left-0 size-[8px] rounded-full bg-status-error-border" />
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
                  'flex items-center gap-2xs py-sm text-label-md',
                  active ? 'text-text-brand' : 'text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                <Icon name={tab.icon} size="sm" weight={active ? 'fill' : 'regular'} />
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
                    'flex min-h-[var(--size-touch-min)] flex-col items-center justify-center gap-2xs py-sm text-label-sm',
                    active ? 'text-text-brand' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {/* DS 48:472: outline at rest, filled when this is where you are. */}
                  <Icon name={tab.icon} size="md" weight={active ? 'fill' : 'regular'} />
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
        <div className="mx-auto flex min-h-[var(--size-header-mobile)] max-w-6xl items-center justify-between gap-sm px-lg">
          <div className="flex min-w-0 items-center gap-sm">
            <Logo height={24} />
            <h1 className="truncate text-label-lg">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            <p className="hidden text-caption text-text-secondary md:block">
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
                      'flex items-center gap-sm rounded-md px-lg py-sm text-label-md whitespace-nowrap',
                      'min-h-[var(--size-control-sm)]',
                      active ? 'bg-bg-brand-subtle text-text-brand' : 'text-text-secondary hover:bg-bg-surface',
                    ].join(' ')}
                  >
                    <Icon name={item.icon} size="sm" weight={active ? 'fill' : 'regular'} />
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
  { href: '/assoc', label: 'صف‌ها', icon: 'listChecks' },
  { href: '/assoc/kyc', label: 'احراز هویت', icon: 'shieldCheck' },
  { href: '/assoc/members', label: 'عضویت', icon: 'user' },
  { href: '/assoc/kennels', label: 'کنل', icon: 'house' },
  { href: '/assoc/permits', label: 'مجوز جفت‌گیری', icon: 'stamp' },
  { href: '/assoc/postal', label: 'درخواست‌های پستی', icon: 'mapPin' },
  { href: '/assoc/foreign-pedigree', label: 'Export Pedigree', icon: 'certificate' },
  { href: '/assoc/issuers', label: 'صادرکنندگان', icon: 'clipboardText' },
];

export const GENETICS_NAV: readonly NavItem[] = [
  { href: '/genetics', label: 'داشبورد', icon: 'house' },
  { href: '/genetics/receipts', label: 'فیش‌ها', icon: 'clipboardText' },
  { href: '/genetics/samples', label: 'نمونه‌ها', icon: 'testTube' },
  { href: '/genetics/results', label: 'نتایج', icon: 'dna' },
  { href: '/genetics/appeals', label: 'اعتراض‌ها', icon: 'warning' },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin', label: 'مرور', icon: 'house' },
  { href: '/admin/settings', label: 'تنظیمات', icon: 'listChecks' },
  { href: '/admin/vets', label: 'دامپزشکان معتمد', icon: 'firstAidKit' },
  { href: '/admin/breeds', label: 'نژادها', icon: 'dog' },
  { href: '/admin/audit', label: 'تاریخچه', icon: 'clipboardText' },
];
