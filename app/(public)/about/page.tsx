import type { Metadata } from 'next';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { CtaBand } from '../public-ui.tsx';
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

/** One fact list in a white card (P03 read shape, 720 measure). */
function FactCard({ id, title, icon, lines }: { id: string; title: string; icon: 'shieldCheck' | 'lockSimple'; lines: readonly string[] }) {
  return (
    <section aria-labelledby={id} className="hz-card space-y-md">
      <SectionHeader id={id} title={title} size="sm" />
      <ul className="space-y-sm">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-sm text-body-md">
            <Icon name={icon} size="sm" className="mt-2xs shrink-0 text-text-brand" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AboutPage() {
  const { origin } = site();
  return (
    <div className="space-y-s48 lg:space-y-s64">
      <article className="mx-auto max-w-[var(--container-reading)] space-y-xl">
        <div className="space-y-md">
          <Breadcrumbs items={CRUMBS} origin={origin} />
          <PageHeader
            title={TITLE}
            meta={[
              'همزیست سامانه‌ای فارسی برای ثبت و پیگیری هویت، نسب، اسناد و چرخه تولیدمثل سگ‌هاست. مالک، پرورش‌دهنده، دامپزشک معتمد، انجمن و مرکز ژنتیک هر کدام در محیط خودشان همان پرونده مشترک را پیش می‌برند.',
            ]}
          />
        </div>
        <FactCard id="official-title" title="چه چیزی رسمی ثبت می‌شود" icon="shieldCheck" lines={OFFICIAL} />
        <FactCard id="privacy-title" title="از اطلاعات شما چگونه محافظت می‌شود" icon="lockSimple" lines={PRIVACY} />
      </article>
      <CtaBand id="about-cta-title" />
    </div>
  );
}
