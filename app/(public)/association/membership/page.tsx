import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../../src/db/client.ts';
import { readSetting } from '../../../../src/settings/service.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { RichText } from '../../../../src/content/rich-text.tsx';
import { JsonLdScript } from '../../../../src/seo/json-ld.tsx';
import { faqLd } from '../../../../src/seo/structured-data.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'شرایط عضویت انجمن';
const DESCRIPTION = 'چه کسی عضو انجمن می‌شود، درخواست چگونه بررسی می‌شود، عضویت چه مدتی دارد و چطور تمدید می‌شود.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: 'شرایط عضویت انجمن', path: '/association/membership' },
];

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/association/membership' }, site());
}

/** The path a request really takes. No figure and no turnaround time (DEC-0186). */
const STEPS: readonly string[] = [
  'ورود با شماره موبایل خودتان و تکمیل اطلاعات هویتی.',
  'بارگذاری مدرک هویتی و تأیید آن در بررسی انجمن.',
  'ثبت درخواست عضویت؛ انجمن آن را بررسی می‌کند و نتیجه را با دلیل روی همان پرونده می‌نویسد.',
  'پس از تأیید، پرداخت دوره عضویت. انتظار برای پرداخت مهلت ندارد.',
  'فعال‌شدن دوره عضویت پس از تأیید پرداخت روی سرور و صدور شماره عضویت.',
];

const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'عضویت چه مدتی اعتبار دارد؟',
    answer:
      'عضویت مدت‌دار است و طول دوره را انجمن در داده مدیریت‌شده تعیین می‌کند. پیش از پایان دوره، یادآوری تمدید در پنل خودتان دیده می‌شود.',
  },
  {
    question: 'تمدید زودهنگام زمان باقی‌مانده را از بین می‌برد؟',
    answer: 'خیر. دوره تازه از پایان دوره فعلی شروع می‌شود و زمانی که پرداخت شده از دست نمی‌رود.',
  },
  {
    question: 'عضویت‌های مادام‌العمر قدیمی چه می‌شوند؟',
    answer: 'همان‌طور که بودند معتبر می‌مانند؛ برای آن‌ها تاریخ انقضای ساختگی گذاشته نشده است.',
  },
  {
    question: 'عضویت برای چه چیزهایی لازم است؟',
    answer: 'برای خدماتی که سند رسمی می‌سازند، مانند برگه ثبتی، شجره‌نامه، کنل و مجوز جفت‌گیری.',
  },
];

/**
 * What the association asks of a member — Phase 2.5 §9 (PROMPT-014).
 *
 * The steps and the states are facts of the product, written here. The terms
 * text itself belongs to the association: it is read from managed data and, if
 * it has not been entered, this page says so rather than inventing one.
 */
export default async function AssociationMembershipPage() {
  const { origin } = site();
  const terms = await readSetting(db(), 'guide_text.association_membership_terms');

  return (
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />
      <JsonLdScript data={faqLd({ path: '/association/membership', questions: FAQ }, origin)} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">{DESCRIPTION}</p>
      </header>

      <section aria-labelledby="membership-steps-title" className="space-y-md">
        <h2 id="membership-steps-title" className="text-h5">
          مسیر عضویت
        </h2>
        <ol className="list-decimal space-y-sm pr-lg text-body-md" data-testid="membership-steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-caption text-text-secondary">
          مبلغ عضویت در لحظه پرداخت و روی همان پرونده دیده می‌شود؛ در این صفحه عددی نوشته نمی‌شود.
        </p>
      </section>

      <section aria-labelledby="membership-terms-title" className="space-y-md">
        <h2 id="membership-terms-title" className="text-h5">
          متن شرایط عضویت
        </h2>
        {terms.configured ? (
          <div className="rounded-lg border border-border-subtle bg-bg-surface p-lg" data-testid="membership-terms">
            <RichText source={String(terms.value)} />
          </div>
        ) : (
          <Alert tone="info" title="متن شرایط هنوز منتشر نشده است">
            <span data-testid="membership-terms-missing">
              انجمن هنوز متن رسمی شرایط عضویت را ثبت نکرده است. مسیر و وضعیت‌های عضویت همان است که در این صفحه آمده و با انتشار متن، همین‌جا دیده می‌شود.
            </span>
          </Alert>
        )}
      </section>

      <section aria-labelledby="membership-faq-title" className="space-y-md">
        <h2 id="membership-faq-title" className="text-h5">
          پرسش‌های پرتکرار
        </h2>
        <dl className="space-y-md" data-testid="membership-faq">
          {FAQ.map((entry) => (
            <div key={entry.question} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <dt className="text-label-lg">{entry.question}</dt>
              <dd className="mt-xs text-body-sm text-text-secondary">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="صفحه‌های مرتبط" className="flex flex-wrap gap-md">
        <ButtonLink href="/association/status" tone="secondary">
          وضعیت‌ها و مراحل
        </ButtonLink>
        <Link href="/association/regulations" className="self-center text-body-sm text-text-brand">
          مقررات انجمن
        </Link>
        <Link href="/services/membership" className="self-center text-body-sm text-text-brand">
          راهنمای خدمت عضویت
        </Link>
      </nav>
    </div>
  );
}
