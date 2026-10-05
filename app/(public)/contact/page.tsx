import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { readSetting } from '../../../src/settings/service.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { RichText } from '../../../src/content/rich-text.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

const TITLE = 'تماس با ما';
const DESCRIPTION = 'راه‌های تماس با همزیست، مسیر پیگیری پرونده‌ها و جایی که هر درخواست واقعاً بررسی می‌شود.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/contact' },
];

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/contact' }, site());
}

/** Paths that answer a request inside the product, where the record actually lives. */
const ROUTES: ReadonlyArray<{ href: string; label: string; note: string }> = [
  { href: '/services', label: 'راهنمای خدمات', note: 'هر خدمت، پیش‌نیازها و مراحل آن.' },
  { href: '/guides', label: 'راهنمای کار با سامانه', note: 'آموزش گام‌به‌گام بخش‌های همزیست.' },
  { href: '/verify', label: 'استعلام اصالت مدارک', note: 'بررسی شجره‌نامه، برگه ثبتی و کارت توله با کد آن.' },
  { href: '/association/membership', label: 'شرایط عضویت انجمن', note: 'چه کسی عضو می‌شود و چه مراحلی دارد.' },
  { href: '/dashboard', label: 'پنل من', note: 'پیگیری پرونده‌ها، پرداخت‌ها و اعلان‌ها با حساب خودتان.' },
];

async function value(key: string): Promise<string | null> {
  const setting = await readSetting(db(), key);
  return setting.configured ? String(setting.value) : null;
}

/**
 * How to reach Hamzist — Phase 2.5 §9 (PROMPT-014).
 *
 * Every detail here is operational data an operator enters. Nothing is invented:
 * an address, a number or a set of office hours nobody supplied is said to be
 * unregistered rather than shown as a plausible-looking fact.
 */
export default async function ContactPage() {
  const { origin } = site();
  const [email, phone, address, hours] = await Promise.all([
    value('contact.email'),
    value('contact.phone'),
    value('contact.address_fa'),
    value('contact.hours_fa'),
  ]);
  const anyContact = [email, phone, address, hours].some((item) => item !== null);

  return (
    <div className="mx-auto max-w-[var(--container-reading)] space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader title={TITLE} meta={[DESCRIPTION]} />
      </div>

      <section aria-labelledby="contact-details-title" className="space-y-md">
        <SectionHeader id="contact-details-title" title="راه‌های ارتباطی" size="sm" />
        {anyContact ? (
          <div className="hz-card" data-testid="contact-details">
            <dl className="hz-kv">
              {phone ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">شماره تماس</dt>
                  <dd className="hz-kv__value">
                    <bdi dir="ltr">{phone}</bdi>
                  </dd>
                </div>
              ) : null}
              {email ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">ایمیل</dt>
                  <dd className="hz-kv__value">
                    <bdi dir="ltr">{email}</bdi>
                  </dd>
                </div>
              ) : null}
              {address ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">نشانی</dt>
                  <dd className="hz-kv__value">
                    <RichText source={address} />
                  </dd>
                </div>
              ) : null}
              {hours ? (
                <div className="hz-kv__row">
                  <dt className="hz-kv__key">ساعت پاسخ‌گویی</dt>
                  <dd className="hz-kv__value">
                    <RichText source={hours} />
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : (
          <Alert tone="info" title="راه تماس عمومی هنوز ثبت نشده است">
            <span data-testid="contact-not-configured">
              شماره، ایمیل و نشانی رسمی همزیست هنوز در تنظیمات ثبت نشده است. تا آن زمان، پیگیری هر پرونده از مسیرهای زیر در خود سامانه انجام می‌شود.
            </span>
          </Alert>
        )}
      </section>

      <section aria-labelledby="contact-routes-title" className="space-y-md">
        <SectionHeader id="contact-routes-title" title="پیگیری از داخل سامانه" size="sm" />
        <ul className="hz-cardlist" data-testid="contact-routes">
          {ROUTES.map((route) => (
            <li key={route.href}>
              <Link href={route.href} className="hz-cardlist__item hz-card--interactive text-text-primary no-underline">
                <span className="hz-cardlist__row">
                  <span className="min-w-0">
                    <span className="hz-cardlist__title block">{route.label}</span>
                    <span className="hz-cardlist__meta block">{route.note}</span>
                  </span>
                  <Icon name="caretRight" size="sm" mirror className="shrink-0 text-text-brand" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-report-title" className="hz-card hz-card--subtle space-y-sm">
        <SectionHeader id="contact-report-title" title="گزارش محتوا یا کلاب" size="sm" />
        <p className="hz-body-sm text-text-secondary">
          هر مطلب و هر کلاب عمومی دکمه گزارش خودش را دارد؛ گزارش شما با دلیل بررسی می‌شود و نام گزارش‌دهنده به طرف مقابل گفته نمی‌شود.
        </p>
      </section>
    </div>
  );
}
