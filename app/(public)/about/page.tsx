import type { Metadata } from 'next';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';

const TITLE = 'درباره همزیست';
const DESCRIPTION = 'همزیست چیست، چه چیزی در آن رسمی ثبت می‌شود و از اطلاعات شما چگونه محافظت می‌شود.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: TITLE, path: '/about' },
];

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/about' }, site());
}

/*
 * Every statement here is a rule the Phase 1 product already enforces (D01–D19,
 * DEC-0076, DEC-0119). No contact details, licence numbers or team are listed:
 * none are known, and they are not invented (DEC-0149).
 */
const OFFICIAL = [
  'مشخصات رسمی حیوان را دامپزشک معتمد هنگام نصب میکروچیپ و نمونه‌گیری ثبت و تأیید می‌کند و پس از آن مالک آن را تغییر نمی‌دهد.',
  'میکروچیپ برای هر حیوان یک‌بار و برای همیشه ثبت می‌شود.',
  'سندی که صادر شده بازنویسی نمی‌شود؛ هر اصلاح نسخه و سابقه خودش را دارد.',
  'اعلام توافق شخصی جفت‌گیری از مسیر رسمی جداست و سند یا شجره رسمی نمی‌سازد.',
];

const PRIVACY = [
  'ورود فقط با کد یک‌بارمصرفی است که به شماره موبایل شما فرستاده می‌شود.',
  'تصویر کارت ملی و دیگر فایل‌های خصوصی نشانی عمومی ندارند و فقط برای کسی باز می‌شوند که سرور دسترسی او را تأیید کند.',
  'هر پرونده فقط به صاحبش و به کسانی نشان داده می‌شود که کار همان پرونده به آن‌ها سپرده شده است.',
];

export default function AboutPage() {
  const { origin } = site();
  return (
    <article className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-md">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">
          همزیست سامانه‌ای فارسی برای ثبت و پیگیری هویت، نسب، اسناد و چرخه تولیدمثل سگ‌هاست. مالک، پرورش‌دهنده،
          دامپزشک معتمد، انجمن و مرکز ژنتیک هر کدام در محیط خودشان همان پرونده مشترک را پیش می‌برند.
        </p>
      </header>

      <section aria-labelledby="official-title" className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
        <h2 id="official-title" className="text-h4">
          چه چیزی رسمی ثبت می‌شود
        </h2>
        <ul className="mt-md list-disc space-y-sm ps-xl text-body-md">
          {OFFICIAL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy-title" className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
        <h2 id="privacy-title" className="text-h4">
          از اطلاعات شما چگونه محافظت می‌شود
        </h2>
        <ul className="mt-md list-disc space-y-sm ps-xl text-body-md">
          {PRIVACY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
