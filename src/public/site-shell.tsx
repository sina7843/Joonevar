import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '../ui/logo.tsx';
import { Icon } from '../ui/icon.tsx';
import { DesktopNav, FooterColumn, MobileMenu, type NavLink, type ResolvedNavGroup } from './site-nav.tsx';
import { FOOTER_GROUPS, NAV_GROUPS, VERIFY_HREF, liveLinks } from './sections.ts';
import { viewer } from './request.ts';

/**
 * Shell of the public site — Requirements-Phase-2 §4 (DEC-0149), drawn as DS
 * *SiteShell* v1.0.3: a cream sticky header (logo · five grouped panels +
 * «استعلام اصالت» · search · «ورود / ثبت‌نام»), the white page in the 1280
 * container, and a cream footer with six link groups.
 *
 * It grants nothing: the account button only leads to sign-in or to the panel,
 * where the server decides access as before. No contact details, licences,
 * support hours or trust badges are shown: none are known yet, and an invented
 * one would be worse than none (docs/design-system/GAPS.md).
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const actor = await viewer();
  const account: NavLink =
    actor === null ? { href: '/login', label: 'ورود / ثبت‌نام' } : { href: '/dashboard', label: 'پنل من' };

  const groups: ResolvedNavGroup[] = NAV_GROUPS.map((group) => ({
    id: group.id,
    labelFa: group.labelFa,
    parts: group.parts
      .map((part) => ({
        labelFa: part.labelFa,
        items: part.items.flatMap((item) => {
          const link = liveLinks([item.href])[0];
          return link ? [{ href: link.href, label: link.label, descFa: item.descFa }] : [];
        }),
      }))
      .filter((part) => part.items.length > 0),
  })).filter((group) => group.parts.length > 0);
  const verify = liveLinks([VERIFY_HREF])[0] ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg-page">
      <a className="hz-skip-link" href="#main">
        رفتن به محتوای اصلی
      </a>

      <header className="hz-site-header">
        <div className="hz-container">
          <div className="hz-site-header__bar">
            <Link href="/" aria-label="همزیست — صفحه اصلی" className="shrink-0">
              <Logo size="responsive" />
            </Link>
            <div className="hz-show-lg">
              <DesktopNav groups={groups} verify={verify} />
            </div>
            <div className="hz-site-header__end">
              <Link href="/search" className="hz-icon-btn" aria-label="جست‌وجو در همزیست" data-testid="site-search">
                <Icon name="magnifyingGlass" size="md" />
              </Link>
              <span className="hz-show-lg">
                <Link href={account.href} className="hz-btn hz-btn--primary hz-btn--sm" data-testid="site-account-link">
                  <Icon name="user" size="xs" weight="fill" />
                  {account.label}
                </Link>
              </span>
              <span className="hz-hide-lg">
                <MobileMenu groups={groups} verify={verify} account={account} />
              </span>
            </div>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 overflow-x-clip outline-none">
        <div className="hz-container py-xl lg:pb-s64 lg:pt-s40 has-[>.hz-home-stack]:!py-0">{children}</div>
      </main>

      <footer className="hz-site-footer" data-testid="site-footer">
        <div className="hz-container">
          <div className="hz-site-footer__grid">
            <div className="hz-site-footer__brand">
              <Link href="/" aria-label="همزیست — صفحه اصلی">
                <Logo size="responsive" />
              </Link>
              <p className="hz-site-footer__tagline">سامانه رسمی ثبت سگ و گربه، شجره‌نامه و مجوز جفت‌گیری.</p>
            </div>
            {FOOTER_GROUPS.map((group, index) => {
              const links = liveLinks(group.hrefs);
              return links.length > 0 ? (
                <FooterColumn key={group.labelFa} id={String(index)} labelFa={group.labelFa} links={links} />
              ) : null;
            })}
          </div>
          <div className="hz-site-footer__bottom">
            <span>© ۱۴۰۵ همزیست</span>
            <span className="hz-site-footer__contact">
              همه حقوق این سامانه محفوظ است.{' '}
              <Link className="hz-link" href="/contact">
                تماس با ما
              </Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
