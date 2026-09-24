import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { readSetting } from '../../../src/settings/service.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { RichText } from '../../../src/content/rich-text.tsx';

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
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">{DESCRIPTION}</p>
      </header>

      <section aria-labelledby="contact-details-title" className="space-y-md">
        <h2 id="contact-details-title" className="text-h5">
          راه‌های ارتباطی
        </h2>
        {anyContact ? (
          <dl className="space-y-md rounded-lg border border-border-subtle bg-bg-surface p-lg text-body-sm" data-testid="contact-details">
            {phone ? (
              <div>
                <dt className="text-caption text-text-secondary">شماره تماس</dt>
                <dd dir="ltr" className="text-body-md">
                  {phone}
                </dd>
              </div>
            ) : null}
            {email ? (
              <div>
                <dt className="text-caption text-text-secondary">ایمیل</dt>
                <dd dir="ltr" className="text-body-md">
                  {email}
                </dd>
              </div>
            ) : null}
            {address ? (
              <div>
                <dt className="text-caption text-text-secondary">نشانی</dt>
                <dd className="text-body-md">
                  <RichText source={address} />
                </dd>
              </div>
            ) : null}
            {hours ? (
              <div>
                <dt className="text-caption text-text-secondary">ساعت پاسخ‌گویی</dt>
                <dd className="text-body-md">
                  <RichText source={hours} />
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <Alert tone="info" title="راه تماس عمومی هنوز ثبت نشده است">
            <span data-testid="contact-not-configured">
              شماره، ایمیل و نشانی رسمی همزیست هنوز در تنظیمات ثبت نشده است. تا آن زمان، پیگیری هر پرونده از مسیرهای زیر در خود سامانه انجام می‌شود.
            </span>
          </Alert>
        )}
      </section>

      <section aria-labelledby="contact-routes-title" className="space-y-md">
        <h2 id="contact-routes-title" className="text-h5">
          پیگیری از داخل سامانه
        </h2>
        <ul className="space-y-sm" data-testid="contact-routes">
          {ROUTES.map((route) => (
            <li key={route.href} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <Link href={route.href} className="text-label-lg text-text-brand">
                {route.label}
              </Link>
              <p className="mt-2xs text-body-sm text-text-secondary">{route.note}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-report-title" className="space-y-sm">
        <h2 id="contact-report-title" className="text-h5">
          گزارش محتوا یا کلاب
        </h2>
        <p className="text-body-sm text-text-secondary">
          هر مطلب و هر کلاب عمومی دکمه گزارش خودش را دارد؛ گزارش شما با دلیل بررسی می‌شود و نام گزارش‌دهنده به طرف مقابل گفته نمی‌شود.
        </p>
      </section>
    </div>
  );
}
