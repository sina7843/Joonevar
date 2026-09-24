import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { MEMBERSHIP_STATUS_FA } from '../../../../src/billing/membership-model.ts';
import { CLUB_LIFECYCLE_FA } from '../../../../src/clubs/model.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'وضعیت‌ها و مراحل';
const DESCRIPTION =
  'معنی هر وضعیت در همزیست: عضویت انجمن، مراحل دامپزشک معتمد و چرخه یک کلاب، با همان واژه‌هایی که در پنل دیده می‌شوند.';
const CRUMBS = [
  { name: 'خانه', path: '/' },
  { name: 'وضعیت‌ها و مراحل', path: '/association/status' },
];

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/association/status' }, site());
}

/** The membership states a person can actually be in, with what each one means. */
const MEMBERSHIP: ReadonlyArray<{ status: keyof typeof MEMBERSHIP_STATUS_FA; meaning: string }> = [
  { status: 'NONE', meaning: 'هنوز درخواستی ثبت نشده است.' },
  { status: 'PENDING_REVIEW', meaning: 'درخواست ثبت شده و در انتظار بررسی انجمن است.' },
  { status: 'NEEDS_CORRECTION', meaning: 'انجمن اصلاحی خواسته است؛ دلیل روی همان پرونده نوشته شده.' },
  { status: 'APPROVED_AWAITING_PAYMENT', meaning: 'درخواست تأیید شده و منتظر پرداخت دوره است. این انتظار مهلت ندارد.' },
  { status: 'ACTIVE', meaning: 'دوره عضویت فعال است و خدمات عضو باز است.' },
  { status: 'EXPIRED', meaning: 'دوره به پایان رسیده است؛ با تمدید دوباره فعال می‌شود.' },
  { status: 'SUSPENDED', meaning: 'انجمن عضویت را با دلیل معلق کرده است.' },
  { status: 'REVOKED', meaning: 'عضویت لغو شده است؛ سابقه آن پاک نمی‌شود.' },
  { status: 'REJECTED', meaning: 'درخواست رد شده و دلیل آن ثبت شده است.' },
];

/** The trusted-veterinarian path, in the order it is really walked (§7). */
const TRUSTED_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'دامپزشک با پروانه فعال',
    body: 'نخست باید دوره پروانه فعالیت تأییدشده و پرداخت‌شده باشد؛ بدون آن درخواست معتمد باز نمی‌شود.',
  },
  {
    title: 'عضویت معتبر انجمن',
    body: 'عضویت باید در همان لحظه معتبر باشد. اگر عضویت منقضی یا معلق شود، شرط برقرار نیست.',
  },
  {
    title: 'پذیرش تعهدنامه و خوداظهاری تجهیزات',
    body: 'متن تعهدنامه را انجمن منتشر می‌کند و نسخه پذیرفته‌شده روی همان درخواست ثبت می‌ماند. داشتن میکروچیپ‌ریدر خوداظهاری است و همه‌جا «تجهیزات اعلام‌شده» نوشته می‌شود، نه تأییدشده.',
  },
  {
    title: 'بررسی انجمن',
    body: 'درخواست بررسی می‌شود و نتیجه — تأیید، درخواست اصلاح یا رد — با دلیل ثبت می‌شود.',
  },
  {
    title: 'پرداخت دوره معتمد',
    body: 'تأیید، تنها اجازه پرداخت می‌دهد. جایگاه معتمد فقط با پرداخت تأییدشده روی سرور ساخته می‌شود.',
  },
  {
    title: 'نشان عمومی معتمد',
    body: 'تا وقتی دوره معتمد معتبر است، نشان «دکتر دامپزشک معتمد» در صفحه عمومی دیده می‌شود. با پایان یا تعلیق دوره، نشان به وضعیت پیشین برمی‌گردد و سابقه کار پاک نمی‌شود.',
  },
];

/** The club lifecycle, named with the same words the club's own screen uses. */
const CLUB_ORDER = ['DRAFT', 'PENDING_VERIFICATION', 'NEEDS_CORRECTION', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'ARCHIVED'] as const;
const CLUB_MEANING: Record<(typeof CLUB_ORDER)[number], string> = {
  DRAFT: 'کلاب ساخته شده ولی هنوز برای بررسی فرستاده نشده و صفحه عمومی ندارد.',
  PENDING_VERIFICATION: 'کلاب در انتظار تأیید انجمن است.',
  NEEDS_CORRECTION: 'انجمن اصلاحی خواسته است؛ پس از ارسال دوباره بررسی می‌شود.',
  ACTIVE: 'کلاب تأیید شده است و می‌تواند صفحه عمومی خود را منتشر کند و عضو بپذیرد.',
  SUSPENDED: 'کلاب تعلیق شده و از دسترس عمومی خارج است؛ پرونده و تاریخچه می‌مانند.',
  REJECTED: 'درخواست تأیید رد شده است.',
  ARCHIVED: 'کلاب بایگانی شده است.',
};

/**
 * What every state means — Phase 2.5 §9 (PROMPT-014). The words here are read
 * from the same label maps the application uses, so this page cannot drift into
 * describing states the product does not have.
 */
export default function AssociationStatusPage() {
  const { origin } = site();

  return (
    <div className="mx-auto max-w-3xl space-y-xl">
      <Breadcrumbs items={CRUMBS} origin={origin} />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{TITLE}</h1>
        <p className="text-body-md text-text-secondary">{DESCRIPTION}</p>
      </header>

      <section aria-labelledby="status-membership-title" className="space-y-md">
        <h2 id="status-membership-title" className="text-h5">
          وضعیت‌های عضویت انجمن
        </h2>
        <dl className="space-y-sm" data-testid="status-membership">
          {MEMBERSHIP.map((entry) => (
            <div key={entry.status} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <dt className="text-label-lg">{MEMBERSHIP_STATUS_FA[entry.status]}</dt>
              <dd className="mt-xs text-body-sm text-text-secondary">{entry.meaning}</dd>
            </div>
          ))}
        </dl>
        <Link href="/association/membership" className="inline-block text-body-sm text-text-brand">
          شرایط و مسیر عضویت
        </Link>
      </section>

      <section aria-labelledby="status-trusted-title" className="space-y-md">
        <h2 id="status-trusted-title" className="text-h5">
          مراحل دامپزشک معتمد
        </h2>
        <ol className="space-y-sm" data-testid="status-trusted">
          {TRUSTED_STEPS.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <p className="text-label-lg">{(index + 1).toLocaleString('fa-IR') + '. ' + step.title}</p>
              <p className="mt-xs text-body-sm text-text-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
        <ButtonLink href="/veterinarians" tone="secondary">
          فهرست دامپزشکان
        </ButtonLink>
      </section>

      <section aria-labelledby="status-club-title" className="space-y-md">
        <h2 id="status-club-title" className="text-h5">
          چرخه یک کلاب
        </h2>
        <dl className="space-y-sm" data-testid="status-club">
          {CLUB_ORDER.map((state) => (
            <div key={state} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <dt className="flex flex-wrap items-center gap-sm text-label-lg">
                <StatusBadge tone={state === 'ACTIVE' ? 'success' : state === 'SUSPENDED' || state === 'REJECTED' ? 'error' : 'neutral'}>
                  {CLUB_LIFECYCLE_FA[state]}
                </StatusBadge>
              </dt>
              <dd className="mt-xs text-body-sm text-text-secondary">{CLUB_MEANING[state]}</dd>
            </div>
          ))}
        </dl>
        <Link href="/clubs" className="inline-block text-body-sm text-text-brand">
          فهرست کلاب‌ها
        </Link>
      </section>
    </div>
  );
}
