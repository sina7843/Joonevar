import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo.tsx';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';
import { RoleSwitcher, CONTEXT_LABEL_FA } from './role-switcher.tsx';
import { AccountPopover, NavDrawer, SidebarCollapse, SidebarNav, type ShellNavSection } from './shell-client.tsx';
import { switchableContexts, type Actor, type ActorContextName } from '../authz/actor.ts';
import { canReadSettingGroup } from '../authz/policy.ts';
import { hasMarketplaceCapability } from '../marketplace/model.ts';
import { hasFinderCapability } from '../finder/model.ts';
import { db } from '../db/client.ts';
import { findProfile } from '../identity/account.ts';
import { signOutAction } from '../identity/sign-out-action.ts';
import { unreadCount as countUnread } from '../notifications/service.ts';

/**
 * The application shells — DS *Shells*, *PublicShell*, *OpsShell* (v1.0.3).
 *
 * Chrome is cream, the page is white, lines not shadows. PublicShell: a 264px
 * sidebar from 1024px, a top bar, and the four-tab bar below 1024px. OpsShell:
 * the grouped 248px sidebar from 1024px, a 72px rail from 768px, and a Drawer
 * below that. The shell follows the route, never the person.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** DS *Iconography*: one of the approved glyphs. */
  readonly icon: IconName;
  /** Sidebar group label (Shells › OpsShell sidebar, 8 items or more). */
  readonly group?: string;
}

async function who(actor: Actor): Promise<{ name: string; initial: string; role: string }> {
  const profile = await findProfile(db(), actor.accountId);
  const name = profile === null ? 'حساب من' : profile.firstName + ' ' + profile.lastName;
  return { name, initial: name.trim().charAt(0) || 'ح', role: CONTEXT_LABEL_FA[actor.context as ActorContextName] };
}

/** The account popover's items: the panel, the profile and the way out. */
function AccountItems() {
  return (
    <ul className="hz-menu__list">
      <li>
        <Link className="hz-menu__action" href="/dashboard" role="menuitem">
          <Icon name="house" size="sm" />
          <span className="hz-menu__action-label">پنل من</span>
        </Link>
      </li>
      <li>
        <Link className="hz-menu__action" href="/account/profile" role="menuitem">
          <Icon name="user" size="sm" />
          <span className="hz-menu__action-label">پروفایل</span>
        </Link>
      </li>
      <li className="hz-menu__sep" role="separator" />
      <li>
        <form action={signOutAction}>
          <button type="submit" className="hz-menu__action" role="menuitem" data-testid="header-sign-out">
            <Icon name="signOut" size="sm" mirror />
            <span className="hz-menu__action-label">خروج از حساب</span>
          </button>
        </form>
      </li>
    </ul>
  );
}

const SkipLink = () => (
  <a className="hz-skip-link" href="#main">
    رفتن به محتوای اصلی
  </a>
);

function Bell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      className="hz-icon-btn"
      aria-label={'اعلان‌ها' + (unread > 0 ? '، ' + unread.toLocaleString('fa-IR') + ' خوانده‌نشده' : '')}
    >
      <Icon name="bell" size="md" weight={unread > 0 ? 'fill' : 'regular'} />
      {unread > 0 ? <span className="hz-icon-btn__dot" aria-hidden="true" /> : null}
    </Link>
  );
}

const isCurrent = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

/* ─────────────────────────────── PublicShell ─────────────────────────────── */

/** Bottom tabs (<1024), unchanged from the approved dashboard. */
const PUBLIC_TABS: readonly NavItem[] = [
  { href: '/dashboard', label: 'خانه', icon: 'house' },
  { href: '/requests', label: 'درخواست‌ها', icon: 'clipboardText' },
  { href: '/notifications', label: 'اعلان‌ها', icon: 'bell' },
  { href: '/profile', label: 'پروفایل', icon: 'user' },
];

const VET_TABS: readonly NavItem[] = [
  { href: '/vet', label: 'صف من', icon: 'tray' },
  { href: '/vet/check-in', label: 'پذیرش', icon: 'qrCode' },
  { href: '/vet/samples', label: 'نمونه‌ها', icon: 'testTube' },
  { href: '/profile', label: 'پروفایل', icon: 'user' },
];

/** Sidebar (≥1024): primary items, then the «حساب من» group (PublicShell anatomy). */
const PUBLIC_SIDEBAR: readonly ShellNavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'خانه', icon: 'house' },
      { href: '/animals', label: 'حیوان‌های من', icon: 'pawPrint' },
      { href: '/requests', label: 'درخواست‌ها', icon: 'clipboardText' },
      { href: '/payments', label: 'پرداخت‌ها', icon: 'receipt' },
      { href: '/documents', label: 'اسناد', icon: 'fileText' },
      { href: '/notifications', label: 'اعلان‌ها', icon: 'bell' },
      { href: '/profile', label: 'پروفایل', icon: 'user' },
    ],
  },
  {
    label: 'حساب من',
    items: [
      { href: '/account/listings', label: 'آگهی‌های من', icon: 'megaphoneSimple' },
      { href: '/account/purchases', label: 'سفارش‌ها', icon: 'shoppingBag' },
      { href: '/account/mating-finder', label: 'جفت‌یابی', icon: 'heart' },
      { href: '/account/kyc', label: 'احراز هویت', icon: 'identificationCard' },
    ],
  },
];

const VET_SIDEBAR: readonly ShellNavSection[] = [
  {
    items: [
      { href: '/vet', label: 'صف من', icon: 'tray' },
      { href: '/vet/check-in', label: 'پذیرش', icon: 'qrCode' },
      { href: '/vet/samples', label: 'نمونه‌ها', icon: 'testTube' },
      { href: '/notifications', label: 'اعلان‌ها', icon: 'bell' },
      { href: '/profile', label: 'پروفایل', icon: 'user' },
    ],
  },
];

/**
 * Public shell for the user, breeder and trusted vet contexts. `primaryAction`
 * is the view's one primary button, shown in the top bar from 1024px.
 */
export async function PublicShell({
  actor,
  title,
  pathname,
  unreadCount,
  primaryAction,
  header,
  children,
}: {
  actor: Actor;
  title: string;
  pathname: string;
  unreadCount?: number;
  primaryAction?: { href: string; label: string; icon?: IconName };
  /** Replaces the default h1 with the page's own PageHeader. */
  header?: ReactNode;
  children: ReactNode;
}) {
  const contexts = switchableContexts(actor.activeRoles);
  const vet = actor.context === 'TRUSTED_VET';
  const tabs = vet ? VET_TABS : PUBLIC_TABS;
  const [person, unread] = await Promise.all([
    who(actor),
    unreadCount === undefined ? countUnread(db(), actor) : Promise.resolve(unreadCount),
  ]);

  return (
    <>
      <SkipLink />
      <div className="hz-app min-h-dvh">
        <aside className="hz-sidebar hz-sidebar--app" aria-label="ناوبری حساب">
          <div className="hz-sidebar__head">
            <Link href="/dashboard" aria-label="همزیست — پیشخوان">
              <Logo size="header" />
            </Link>
          </div>
          <SidebarNav sections={vet ? VET_SIDEBAR : PUBLIC_SIDEBAR} pathname={pathname} dense={false} label="ناوبری حساب" />
          <AccountPopover variant="sidebar" name={person.name} role={person.role} initial={person.initial}>
            <AccountItems />
          </AccountPopover>
        </aside>

        <div className="hz-main flex min-h-dvh flex-col">
          <header className="hz-topbar">
            <Link href="/dashboard" aria-label="همزیست — پیشخوان" className="hz-topbar__logo hz-hide-lg">
              <Logo size="mobile" />
            </Link>
            <span className="hz-topbar__spacer" />
            <Bell unread={unread} />
            {primaryAction ? (
              <span className="hz-show-lg">
                <Link className="hz-btn hz-btn--primary" href={primaryAction.href}>
                  {primaryAction.icon ? <Icon name={primaryAction.icon} size="sm" /> : null}
                  {primaryAction.label}
                </Link>
              </span>
            ) : null}
          </header>

          <main id="main" tabIndex={-1} className="hz-main__inner flex-1 outline-none">
            {contexts.length > 1 ? <RoleSwitcher contexts={contexts} active={actor.context} returnTo={pathname} /> : null}
            {header ?? <h1 className="text-h1">{title}</h1>}
            <div className="space-y-xl">{children}</div>
          </main>

          <nav className="hz-tabbar" aria-label="ناوبری اصلی">
            {tabs.map((tab) => {
              const active = isCurrent(pathname, tab.href);
              return (
                <Link key={tab.href} className="hz-tab" href={tab.href} aria-current={active ? 'page' : undefined}>
                  <Icon name={tab.icon} size="md" weight={active ? 'fill' : 'regular'} />
                  <span>{tab.label}</span>
                  {tab.href === '/notifications' && unread > 0 ? (
                    <span className="hz-tab__badge" aria-label={unread.toLocaleString('fa-IR') + ' خوانده‌نشده'}>
                      {unread.toLocaleString('fa-IR')}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}

/* ──────────────────────────────── OpsShell ───────────────────────────────── */

/** Environment label per context, shown under the logo (`hz-sidebar__env`). */
function environmentFa(context: ActorContextName): string {
  return 'محیط عملیاتی ' + CONTEXT_LABEL_FA[context];
}

/**
 * ≤7 items: one flat list. 8 or more: an unlabelled home item, then labelled
 * groups in the order they first appear (Shells › OpsShell sidebar).
 */
function sectionsOf(nav: readonly NavItem[]): ShellNavSection[] {
  if (nav.length <= 7) return [{ items: nav }];
  const sections: { label?: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const label = item.group;
    let section = sections.find((candidate) => candidate.label === label);
    if (!section) sections.push((section = { label, items: [] }));
    section.items.push(item);
  }
  return sections;
}

/**
 * Operational shell — D11. Association, genetics centre, superadmin, content,
 * review and the marketplace roles each get their own environment with its own
 * navigation; it is never reachable by switching a public role.
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
  const person = await who(actor);
  const env = environmentFa(actor.context as ActorContextName);
  const sections = sectionsOf(nav);
  const home = nav[0];

  return (
    <>
      <SkipLink />
      <div className="hz-app hz-app--ops min-h-dvh">
        <aside className="hz-sidebar hz-sidebar--ops" aria-label={'ناوبری ' + env}>
          <div className="hz-sidebar__head">
            <Link href={home?.href ?? '/'} aria-label={'همزیست — ' + env}>
              <Logo size="ops" className="hz-ops-logo" />
              <Logo variant="symbol" size="symbol" className="hz-ops-symbol" />
            </Link>
            <p className="hz-sidebar__env">{env}</p>
          </div>
          <SidebarNav sections={sections} pathname={pathname} dense={nav.length >= 8} label={env} />
          <SidebarCollapse />
        </aside>

        <div className="hz-main flex min-h-dvh flex-col">
          <header className="hz-topbar">
            <div className="hz-topbar__title hz-hide-md">
              <span className="hz-topbar__primary">{title}</span>
              <span className="hz-topbar__sub">{env}</span>
            </div>
            <nav className="hz-topbar__crumbs hz-show-md" aria-label="مسیر">
              <ol className="hz-breadcrumbs">
                {home && home.href !== pathname ? (
                  <>
                    <li>
                      <Link href={home.href}>{home.label}</Link>
                    </li>
                    <li className="hz-breadcrumbs__sep" aria-hidden="true">
                      /
                    </li>
                  </>
                ) : null}
                <li>
                  <span aria-current="page">{title}</span>
                </li>
              </ol>
            </nav>
            <span className="hz-show-md">
              <AccountPopover variant="topbar" name={person.name} role={person.role} initial={person.initial}>
                <AccountItems />
              </AccountPopover>
            </span>
            <span className="hz-hide-md">
              <NavDrawer
                label={'ناوبری ' + env}
                pathname={pathname}
                brand={
                  <>
                    <Logo size="ops" />
                    <p className="hz-sidebar__env">{env}</p>
                  </>
                }
                foot={
                  <AccountPopover variant="sidebar" name={person.name} role={person.role} initial={person.initial}>
                    <AccountItems />
                  </AccountPopover>
                }
              >
                <SidebarNav sections={sections} pathname={pathname} dense={false} label={env} />
              </NavDrawer>
            </span>
          </header>
          <main id="main" tabIndex={-1} className="hz-main__inner hz-main__inner--ops flex-1 outline-none">
            <h1 className="text-h3">{title}</h1>
            <div className="space-y-lg">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}

/* ──────────────────────────── Environment navigation ──────────────────────── */

/** Association (14): groups from the approved KYC mockup. */
export const ASSOC_NAV: readonly NavItem[] = [
  { href: '/assoc', label: 'صف‌ها', icon: 'tray' },
  { href: '/assoc/kyc', label: 'احراز هویت', icon: 'identificationCard', group: 'هویت و عضویت' },
  { href: '/assoc/members', label: 'عضویت', icon: 'users', group: 'هویت و عضویت' },
  { href: '/assoc/clubs', label: 'کلاب‌ها', icon: 'usersThree', group: 'هویت و عضویت' },
  { href: '/assoc/vet-students', label: 'دانشجویان دامپزشکی', icon: 'student', group: 'دامپزشکان' },
  { href: '/assoc/vet-doctors', label: 'کد نظام دامپزشکان', icon: 'identificationBadge', group: 'دامپزشکان' },
  { href: '/assoc/vet-licences', label: 'پروانه فعالیت', icon: 'stamp', group: 'دامپزشکان' },
  { href: '/assoc/vet-review', label: 'میز بررسی دامپزشکان', icon: 'stethoscope', group: 'دامپزشکان' },
  { href: '/assoc/vet-trusted', label: 'دامپزشک معتمد', icon: 'sealCheck', group: 'دامپزشکان' },
  { href: '/assoc/kennels', label: 'کنل', icon: 'house', group: 'پرورش' },
  { href: '/assoc/permits', label: 'مجوز جفت‌گیری', icon: 'certificate', group: 'پرورش' },
  { href: '/assoc/postal', label: 'درخواست‌های پستی', icon: 'package', group: 'اسناد و ارسال' },
  { href: '/assoc/foreign-pedigree', label: 'Export Pedigree', icon: 'treeStructure', group: 'اسناد و ارسال' },
  { href: '/assoc/issuers', label: 'صادرکنندگان', icon: 'buildings', group: 'اسناد و ارسال' },
];

export const GENETICS_NAV: readonly NavItem[] = [
  { href: '/genetics', label: 'داشبورد', icon: 'house' },
  { href: '/genetics/receipts', label: 'فیش‌ها', icon: 'receipt' },
  { href: '/genetics/samples', label: 'نمونه‌ها', icon: 'testTube' },
  { href: '/genetics/results', label: 'نتایج', icon: 'dna' },
  { href: '/genetics/appeals', label: 'اعتراض‌ها', icon: 'flag' },
];

/** Superadmin (12) — grouping is a design decision (DEC-0226). */
export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin', label: 'مرور', icon: 'house' },
  { href: '/admin/settings', label: 'تنظیمات', icon: 'gearSix', group: 'پیکربندی' },
  { href: '/admin/packages', label: 'بسته‌های تبلیغاتی', icon: 'megaphoneSimple', group: 'پیکربندی' },
  // Phase 4 mating finder: plans, rules, species and switches (DEC-0218).
  { href: '/admin/mating-finder', label: 'جفت‌یابی', icon: 'heart', group: 'پیکربندی' },
  { href: '/admin/breeds', label: 'نژادها', icon: 'pawPrint', group: 'پیکربندی' },
  { href: '/admin/notifications', label: 'اعلان‌ها و پیامک', icon: 'bell', group: 'پیکربندی' },
  { href: '/admin/vets', label: 'دامپزشکان معتمد', icon: 'firstAidKit', group: 'دامپزشکی و جامعه' },
  { href: '/admin/centres', label: 'مراکز دامپزشکی', icon: 'mapPin', group: 'دامپزشکی و جامعه' },
  { href: '/admin/communities', label: 'انجمن و کلاب', icon: 'usersThree', group: 'دامپزشکی و جامعه' },
  { href: '/admin/roles', label: 'نقش‌های محتوا', icon: 'userGear', group: 'دسترسی و تاریخچه' },
  { href: '/admin/audit', label: 'تاریخچه', icon: 'clockCounterClockwise', group: 'دسترسی و تاریخچه' },
  // The marketplace operations shell (Phase 3, DEC-0204).
  { href: '/market', label: 'بازار و فروشگاه', icon: 'storefront', group: 'دسترسی و تاریخچه' },
];

/** Author environment (P2-D11). */
export const AUTHOR_NAV: readonly NavItem[] = [
  { href: '/author', label: 'نوشته‌های من', icon: 'fileText' },
  { href: '/author/new', label: 'نوشته تازه', icon: 'notePencil' },
];

/** Review operator environment (§8, §10, DEC-0165). */
export const REVIEW_NAV: readonly NavItem[] = [
  { href: '/review/vets', label: 'درخواست‌های دامپزشک', icon: 'stethoscope' },
  { href: '/review/vets/unowned', label: 'پروفایل‌های بدون مالک', icon: 'userPlus' },
  { href: '/review/centres', label: 'مراکز دامپزشکی', icon: 'mapPin' },
  { href: '/review/centres/claims', label: 'Claim مراکز', icon: 'sealCheck' },
  { href: '/review/communities', label: 'انجمن و کلاب', icon: 'usersThree' },
  { href: '/review/suggestions', label: 'پیشنهادهای کاربران', icon: 'chatCenteredText' },
];

/**
 * Marketplace operations environment (Phase 3, DEC-0204), grouped as Shells ›
 * OpsShell sidebar specifies: آگهی و نظارت · فروشندگان · سفارش و مالی · اختلاف و
 * پشتیبانی · جفت‌یابی · پیکربندی.
 *
 * The rail is built from what this actor may actually do, so a moderator is
 * never shown a settings link that would deny. Hiding an entry is presentation;
 * the route table and the capability check are the gate.
 */
export function marketNav(actor: Actor): readonly NavItem[] {
  const items: NavItem[] = [{ href: '/market', label: 'مرور بازار', icon: 'house' }];
  const add = (item: NavItem) => items.push(item);
  const LISTINGS = 'آگهی و نظارت';
  const SELLERS = 'فروشندگان';
  const ORDERS = 'سفارش و مالی';
  const DISPUTES = 'اختلاف و پشتیبانی';
  const FINDER = 'جفت‌یابی';
  const CONFIG = 'پیکربندی';

  if (hasMarketplaceCapability(actor, 'ANIMAL_LISTING_MODERATE')) {
    add({ href: '/market/listings', label: 'گزارش آگهی‌ها', icon: 'flag', group: LISTINGS });
    add({ href: '/market/messages', label: 'گزارش پیام‌ها', icon: 'chatCircleDots', group: LISTINGS });
    add({ href: '/market/trust', label: 'نظرها و پرسش‌ها', icon: 'star', group: LISTINGS });
  }
  if (hasMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW')) {
    add({ href: '/market/risk', label: 'نشانه‌های پرخطر', icon: 'warning', group: LISTINGS });
  }
  if (hasMarketplaceCapability(actor, 'SELLER_APPLICATION_REVIEW')) {
    add({ href: '/market/sellers', label: 'پرونده فروشندگان', icon: 'storefront', group: SELLERS });
    add({ href: '/market/catalog', label: 'بررسی کاتالوگ', icon: 'package', group: SELLERS });
  }
  if (hasMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE')) {
    add({ href: '/market/plans', label: 'پلن فروشندگی', icon: 'ticket', group: SELLERS });
  }
  if (hasMarketplaceCapability(actor, 'ORDER_VIEW')) {
    add({ href: '/market/orders', label: 'سفارش‌های فروشگاه', icon: 'shoppingBag', group: ORDERS });
    add({ href: '/market/returns', label: 'مرجوعی و سیاست آن', icon: 'arrowUUpLeft', group: ORDERS });
  }
  if (hasMarketplaceCapability(actor, 'SETTLEMENT_RUN')) {
    add({ href: '/market/settlement', label: 'تسویه فروشندگان', icon: 'bank', group: ORDERS });
  }
  if (hasMarketplaceCapability(actor, 'REFUND_ISSUE')) {
    add({ href: '/market/refunds', label: 'استرداد بیعانه', icon: 'handCoins', group: ORDERS });
  }
  if (hasMarketplaceCapability(actor, 'MARKET_OVERVIEW_VIEW')) {
    add({ href: '/market/analytics', label: 'گزارش‌ها', icon: 'chartBar', group: ORDERS });
  }
  if (hasMarketplaceCapability(actor, 'ANIMAL_DISPUTE_DECIDE')) {
    add({ href: '/market/disputes', label: 'پرونده‌های اختلاف', icon: 'scales', group: DISPUTES });
    add({ href: '/market/handovers', label: 'تحویل‌های متوقف', icon: 'handshake', group: DISPUTES });
  }
  if (hasMarketplaceCapability(actor, 'ORDER_VIEW')) {
    add({ href: '/market/support', label: 'پشتیبانی', icon: 'lifebuoy', group: DISPUTES });
  }
  // Phase 4 PROMPT-007: the finder's operations, each behind its own capability.
  if (hasFinderCapability(actor, 'FINDER_ANALYTICS_VIEW')) add({ href: '/market/finder', label: 'عملیات جفت‌یابی', icon: 'heart', group: FINDER });
  if (hasFinderCapability(actor, 'FINDER_REPORT_MODERATE')) add({ href: '/market/finder/reports', label: 'گزارش‌های جفت‌یابی', icon: 'flag', group: FINDER });
  if (hasFinderCapability(actor, 'FINDER_FEEDBACK_VIEW')) add({ href: '/market/finder/feedback', label: 'بازخورد محرمانه', icon: 'chatCenteredText', group: FINDER });
  if (hasFinderCapability(actor, 'FINDER_ACCESS_SUSPEND')) add({ href: '/market/finder/sanctions', label: 'تعلیق و محدودیت', icon: 'prohibit', group: FINDER });
  if (hasMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE') || canReadSettingGroup(actor, 'ANIMAL_MARKET')) {
    add({ href: '/market/settings', label: 'تنظیمات بازار', icon: 'gearSix', group: CONFIG });
  }
  if (hasMarketplaceCapability(actor, 'MARKET_SPECIES_WRITE')) {
    add({ href: '/market/species', label: 'گونه‌های فعال', icon: 'pawPrint', group: CONFIG });
  }
  if (hasMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE')) {
    add({ href: '/market/commission', label: 'قاعده کارمزد', icon: 'percent', group: CONFIG });
    add({ href: '/market/promotions', label: 'کمپین و تخفیف', icon: 'tag', group: CONFIG });
  }
  return items;
}

/** Content admin environment. */
export const CONTENT_NAV: readonly NavItem[] = [
  { href: '/content', label: 'همه محتوا', icon: 'files' },
  { href: '/content/new', label: 'محتوای تازه', icon: 'notePencil' },
  { href: '/content/reports', label: 'گزارش‌ها', icon: 'flag' },
  { href: '/content/clubs', label: 'گزارش کلاب‌ها', icon: 'flagBanner' },
  { href: '/content/restrictions', label: 'محدودیت ناشر', icon: 'prohibit' },
  { href: '/content/categories', label: 'دسته‌ها', icon: 'folderSimple' },
];
