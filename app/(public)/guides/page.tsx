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
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { RecordImage } from '../../../src/ui/record-image.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { CtaBand } from '../public-ui.tsx';

const DATE_FA = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeZone: 'Asia/Tehran' });

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
    <div className="space-y-s48 lg:space-y-s64">
      <JsonLdScript data={faqLd({ path: '/guides', questions: FAQ }, origin)} />
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader title={TITLE} meta={[DESCRIPTION]} />
      </div>

      <section aria-labelledby="guides-services-title">
        <SectionHeader id="guides-services-title" title="راهنمای خدمات" link={{ href: '/services', label: 'همه خدمات' }} />
        <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="guides-services">
          {services.map(({ service }) => (
            <li key={service.slug}>
              <Link href={'/services/' + service.slug} className="hz-card hz-card--interactive hz-service-card h-full">
                <div className="hz-service">
                  <h3 className="hz-service__title">
                    <Icon name="clipboardText" size="sm" className="text-text-brand" />
                    {service.titleFa}
                    <Icon name="arrowRight" size="sm" mirror />
                  </h3>
                  <p className="hz-service__desc">{service.summaryFa}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="guides-tutorials-title">
        <SectionHeader id="guides-tutorials-title" title="آموزش‌های منتشرشده" link={{ href: '/articles', label: 'همه آموزش‌ها' }} />
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
          <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="guides-tutorials">
            {tutorials.items.map((item) => (
              <li key={item.slug}>
                <Link href={'/articles/' + item.slug} className="hz-article hz-card--interactive h-full" title={item.titleFa}>
                  <RecordImage variant="3x2" fileId={item.imageFileId} altFa={item.imageAltFa} />
                  <div className="hz-article__body">
                    <span className="hz-tag">{item.categoryNameFa ?? 'آموزش'}</span>
                    <h3 className="hz-article__title">{item.titleFa}</h3>
                    <p className="hz-article__summary">{item.summaryFa}</p>
                    <div className="hz-meta">
                      <time className="hz-meta__item" dateTime={item.publishAt.toISOString()}>
                        {DATE_FA.format(item.publishAt)}
                      </time>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="guides-faq-title" className="max-w-[var(--container-reading)]">
        <SectionHeader id="guides-faq-title" title="پرسش‌های پرتکرار" />
        <dl className="hz-card divide-y divide-border-subtle" data-testid="guides-faq">
          {FAQ.map((entry) => (
            <div key={entry.question} className="space-y-xs py-md first:pt-0 last:pb-0">
              <dt className="text-label-lg">{entry.question}</dt>
              <dd className="hz-body-sm text-text-secondary">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <CtaBand id="guides-cta-title" />
    </div>
  );
}
