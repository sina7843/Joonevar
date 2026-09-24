import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { publicContentList } from '../../../src/content/service.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site } from '../../../src/public/request.ts';
import { Breadcrumbs } from '../../../src/ui/breadcrumbs.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { JsonLdScript } from '../../../src/seo/json-ld.tsx';
import { faqLd } from '../../../src/seo/structured-data.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'تست اصالت نسب (Parentage Test)';
const DESCRIPTION =
  'تست اصالت نسب چیست، چه چیزی را ثابت می‌کند، چه مراحلی دارد و نتیجه آن در شجره‌نامه چه نقشی دارد.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: 'تست اصالت نسب', path: '/parentage-test' },
];

const CATEGORY = 'parentage-test';

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/parentage-test' }, site());
}

/** What the product actually does, step by step. No timing is promised (§18). */
const STEPS: readonly string[] = [
  'ثبت درخواست برای حیوان و والدین اعلام‌شده در پنل خودتان.',
  'نمونه‌گیری خون توسط دامپزشک معتمد و ثبت آن روی همان پرونده.',
  'ارسال نمونه به مرکز ژنتیک و ثبت دریافت آن.',
  'ثبت نتیجه توسط مرکز ژنتیک روی همان پرونده.',
  'اگر نتیجه نسب اعلام‌شده را تأیید کند، مسیر صدور شجره‌نامه باز می‌شود.',
];

const FACTS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'چه چیزی را نشان می‌دهد',
    body: 'تنها چیزی که این تست پاسخ می‌دهد این است که والدین اعلام‌شده با نمونه حیوان سازگارند یا نه. درباره سلامت، رفتار یا کیفیت نژاد چیزی نمی‌گوید.',
  },
  {
    title: 'چه کسی نمونه می‌گیرد',
    body: 'نمونه‌گیری خون فقط با دامپزشک معتمد همزیست انجام می‌شود و روی همان پرونده ثبت می‌شود؛ نمونه‌ای که بیرون از این مسیر گرفته شده باشد پذیرفته نمی‌شود.',
  },
  {
    title: 'نتیجه چه کسی را می‌بیند',
    body: 'نتیجه روی پرونده حیوان ثبت می‌شود و مالک آن را در پنل خودش می‌بیند. انتشار عمومی نتیجه آزمایش انجام نمی‌شود.',
  },
  {
    title: 'اگر نتیجه مطابق نبود',
    body: 'نسب اعلام‌شده تأیید نمی‌شود و شجره‌نامه بر پایه آن صادر نمی‌شود. پرونده و نتیجه حذف نمی‌شوند و مسیر اعتراض روی همان پرونده وجود دارد.',
  },
];

const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'تست اصالت نسب برای صدور شجره‌نامه لازم است؟',
    answer: 'جایی که نسب اعلام‌شده باید تأیید شود، بله. نتیجه نهایی همین تست است که مسیر صدور شجره‌نامه را باز می‌کند.',
  },
  {
    question: 'هزینه آن چقدر است؟',
    answer:
      'مبلغ در لحظه پرداخت و روی همان پرونده نمایش داده می‌شود؛ در صفحه‌های معرفی عددی نوشته نمی‌شود تا رقم قدیمی جایی باقی نماند.',
  },
  {
    question: 'چقدر طول می‌کشد؟',
    answer: 'همزیست زمانی وعده نمی‌دهد. هر مرحله وقتی ثبت شود، در پنل خودتان دیده می‌شود.',
  },
];

/**
 * The parentage test, explained — Phase 2.5 §9 (PROMPT-014).
 *
 * A public page about a service the product runs: what it answers, what it does
 * not, and the steps it really has. No fee and no turnaround time is printed
 * here (DEC-0186); both belong to the record itself.
 */
export default async function ParentageTestPage() {
  const { origin } = site();
  const related = await publicContentList(db(), { kind: 'ARTICLE', categorySlug: CATEGORY, page: 1, pageSize: 4 });

  return (
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />
      <JsonLdScript data={faqLd({ path: '/parentage-test', questions: FAQ }, origin)} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">{DESCRIPTION}</p>
      </header>

      <section aria-labelledby="parentage-facts-title" className="space-y-md">
        <h2 id="parentage-facts-title" className="text-h5">
          در یک نگاه
        </h2>
        <dl className="grid gap-md sm:grid-cols-2" data-testid="parentage-facts">
          {FACTS.map((fact) => (
            <div key={fact.title} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <dt className="text-label-lg">{fact.title}</dt>
              <dd className="mt-xs text-body-sm text-text-secondary">{fact.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="parentage-steps-title" className="space-y-md">
        <h2 id="parentage-steps-title" className="text-h5">
          مراحل
        </h2>
        <ol className="list-decimal space-y-sm pr-lg text-body-md" data-testid="parentage-steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-caption text-text-secondary">
          هزینه هر مرحله در زمان پرداخت روی همان پرونده نمایش داده و همان‌جا قفل می‌شود.
        </p>
        <ButtonLink href="/services/pedigree" tone="secondary">
          راهنمای صدور شجره‌نامه
        </ButtonLink>
      </section>

      <section aria-labelledby="parentage-faq-title" className="space-y-md">
        <h2 id="parentage-faq-title" className="text-h5">
          پرسش‌های پرتکرار
        </h2>
        <dl className="space-y-md" data-testid="parentage-faq">
          {FAQ.map((entry) => (
            <div key={entry.question} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <dt className="text-label-lg">{entry.question}</dt>
              <dd className="mt-xs text-body-sm text-text-secondary">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      {related.items.length > 0 ? (
        <section aria-labelledby="parentage-related-title" className="space-y-md">
          <h2 id="parentage-related-title" className="text-h5">
            خواندن بیشتر
          </h2>
          <ul className="space-y-sm" data-testid="parentage-related">
            {related.items.map((item) => (
              <li key={item.slug}>
                <Link href={'/articles/' + item.slug} className="text-label-lg text-text-brand">
                  {item.titleFa}
                </Link>
                <p className="text-body-sm text-text-secondary">{item.summaryFa}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
