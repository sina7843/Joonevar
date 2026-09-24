import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { publicContentList } from '../../../src/content/service.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';
import { serviceViews } from '../../../src/services/service.ts';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { JsonLdScript } from '../../../src/seo/json-ld.tsx';
import { faqLd } from '../../../src/seo/structured-data.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'راهنمای کار با سامانه';
const DESCRIPTION =
  'راهنمای گام‌به‌گام بخش‌های همزیست: ثبت حیوان، مدارک، عضویت، کلاب‌ها و پیگیری پرونده‌ها، همراه با آموزش‌های منتشرشده.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: 'راهنمای سامانه', path: '/guides' },
];

/** The tutorial category of the baseline taxonomy (PROMPT-014). */
const TUTORIAL_CATEGORY = 'amuzesh-samaneh';

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/guides' }, site());
}

/** Answers that are facts about the product, not promises about it. */
const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'برای شروع چه چیزی لازم است؟',
    answer: 'یک حساب همزیست با شماره موبایل خودتان. برای خدماتی که سند رسمی می‌سازند، احراز هویت تأییدشده هم لازم است.',
  },
  {
    question: 'هزینه هر خدمت کجا دیده می‌شود؟',
    answer:
      'در لحظه پرداخت، روی همان پرونده. مبلغ از داده مدیریت‌شده خوانده می‌شود و هنگام شروع پرداخت روی پرونده قفل می‌شود؛ در صفحه‌های معرفی عددی نوشته نمی‌شود.',
  },
  {
    question: 'مدارک من چه کسی می‌بیند؟',
    answer: 'فایل‌های هویتی و پرونده‌ای خصوصی‌اند و فقط برای بررسی‌کننده مجاز همان پرونده باز می‌شوند؛ هر بار مشاهده هم ثبت می‌شود.',
  },
  {
    question: 'اگر پرونده‌ام رد شد چه کنم؟',
    answer: 'دلیل رد یا اصلاح روی همان پرونده نوشته می‌شود و در پنل خودتان دیده می‌شود؛ پس از اصلاح، دوباره ارسال کنید.',
  },
];

/**
 * The product's own guides — Phase 2.5 §9 (PROMPT-014).
 *
 * Two kinds of guide sit together: the fixed service pages, which say what each
 * service is and what it needs, and the tutorials the content team publishes,
 * which are ordinary published articles filed under the tutorial category.
 */
export default async function GuidesPage() {
  const { origin } = site();
  const [tutorials, services] = await Promise.all([
    publicContentList(db(), { kind: 'ARTICLE', categorySlug: TUTORIAL_CATEGORY, page: 1, pageSize: 9 }),
    serviceViews(db()),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />
      <JsonLdScript data={faqLd({ path: '/guides', questions: FAQ }, origin)} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="max-w-2xl text-body-md text-text-secondary">{DESCRIPTION}</p>
      </header>

      <section aria-labelledby="guides-services-title" className="space-y-md">
        <h2 id="guides-services-title" className="text-h5">
          راهنمای خدمات
        </h2>
        <ul className="grid gap-md sm:grid-cols-2" data-testid="guides-services">
          {services.map(({ service }) => (
            <li key={service.slug}>
              <Link
                href={'/services/' + service.slug}
                className="block h-full rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
              >
                <span className="block text-label-lg text-text-primary">{service.titleFa}</span>
                <span className="mt-2xs block text-body-sm text-text-secondary">{service.summaryFa}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="guides-tutorials-title" className="space-y-md">
        <h2 id="guides-tutorials-title" className="text-h5">
          آموزش‌های منتشرشده
        </h2>
        {tutorials.items.length === 0 ? (
          <EmptyState
            title="هنوز آموزشی برای کار با سامانه منتشر نشده است"
            description="آموزش‌ها پس از انتشار در همین صفحه و در بخش آموزش‌ها دیده می‌شوند."
            action={
              <ButtonLink tone="secondary" href="/articles">
                همه آموزش‌ها
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-md sm:grid-cols-2" data-testid="guides-tutorials">
            {tutorials.items.map((item) => (
              <li key={item.slug}>
                <Link
                  href={'/articles/' + item.slug}
                  className="block h-full rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                >
                  <span className="block text-label-lg text-text-primary">{item.titleFa}</span>
                  <span className="mt-2xs block text-body-sm text-text-secondary">{item.summaryFa}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="guides-faq-title" className="space-y-md">
        <h2 id="guides-faq-title" className="text-h5">
          پرسش‌های پرتکرار
        </h2>
        <dl className="space-y-md" data-testid="guides-faq">
          {FAQ.map((entry) => (
            <div key={entry.question} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <dt className="text-label-lg">{entry.question}</dt>
              <dd className="mt-xs text-body-sm text-text-secondary">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
