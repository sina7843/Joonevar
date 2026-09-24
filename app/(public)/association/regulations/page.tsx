import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { readSetting } from '../../../../src/settings/service.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { RichText } from '../../../../src/content/rich-text.tsx';
import { publicContentList } from '../../../../src/content/service.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'مقررات انجمن';
const DESCRIPTION = 'مقرراتی که انجمن منتشر کرده است، همراه با اطلاعیه‌های رسمی و قواعدی که همزیست در هر پرونده اجرا می‌کند.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: 'مقررات انجمن', path: '/association/regulations' },
];

/** Rules the product itself enforces on every record — facts, not promises. */
const ENFORCED: readonly string[] = [
  'هر تصمیم بررسی، دلیل ثبت‌شده دارد و در تاریخچه همان پرونده می‌ماند.',
  'مدارک هویتی و پرونده‌ای خصوصی‌اند و هر بار مشاهده آن‌ها ثبت می‌شود.',
  'سند رسمی فقط با پرداخت تأییدشده روی سرور صادر می‌شود، نه با بازگشت مرورگر از درگاه.',
  'میکروچیپ یک‌بار برای همیشه به حیوان بسته می‌شود و انتقال ندارد.',
  'اظهار شخصی مالک هرگز به نسب رسمی یا سند تبدیل نمی‌شود.',
  'اصلاح تاریخ یا تخصیص، تأیید تازه همان نسخه را لازم دارد.',
];

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/association/regulations' }, site());
}

/**
 * What the association publishes, and what the product enforces — Phase 2.5 §9
 * (PROMPT-014). The regulations text is the association's own document: it is
 * read from managed data, and until it exists this page says so instead of
 * putting words in the association's mouth.
 */
export default async function AssociationRegulationsPage() {
  const { origin } = site();
  const [regulations, notices] = await Promise.all([
    readSetting(db(), 'guide_text.association_regulations'),
    publicContentList(db(), { kind: 'ANNOUNCEMENT', categorySlug: 'etelaiye-anjoman', page: 1, pageSize: 5 }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">{DESCRIPTION}</p>
      </header>

      <section aria-labelledby="regulations-text-title" className="space-y-md">
        <h2 id="regulations-text-title" className="text-h5">
          متن مقررات
        </h2>
        {regulations.configured ? (
          <div className="rounded-lg border border-border-subtle bg-bg-surface p-lg" data-testid="regulations-text">
            <RichText source={String(regulations.value)} />
          </div>
        ) : (
          <Alert tone="info" title="متن مقررات هنوز منتشر نشده است">
            <span data-testid="regulations-missing">
              انجمن هنوز متن مقررات را ثبت نکرده است. قواعدی که همزیست در هر پرونده اجرا می‌کند، مستقل از این متن، در بخش زیر آمده است.
            </span>
          </Alert>
        )}
      </section>

      <section aria-labelledby="regulations-enforced-title" className="space-y-md">
        <h2 id="regulations-enforced-title" className="text-h5">
          قواعدی که سامانه اجرا می‌کند
        </h2>
        <ul className="list-disc space-y-xs pr-lg text-body-md" data-testid="regulations-enforced">
          {ENFORCED.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="regulations-notices-title" className="space-y-md">
        <h2 id="regulations-notices-title" className="text-h5">
          اطلاعیه‌های انجمن
        </h2>
        {notices.items.length === 0 ? (
          <p className="text-body-sm text-text-secondary" data-testid="regulations-no-notices">
            اطلاعیه‌ای منتشر نشده است. اطلاعیه‌های تازه در بخش اطلاعیه‌ها دیده می‌شوند.
          </p>
        ) : (
          <ul className="space-y-sm" data-testid="regulations-notices">
            {notices.items.map((item) => (
              <li key={item.slug}>
                <Link href={'/announcements/' + item.slug} className="text-label-lg text-text-brand">
                  {item.titleFa}
                </Link>
                <p className="text-body-sm text-text-secondary">{item.summaryFa}</p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/announcements" className="inline-block text-body-sm text-text-brand">
          همه اطلاعیه‌ها
        </Link>
      </section>
    </div>
  );
}
