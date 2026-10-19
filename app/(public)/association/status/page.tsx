import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import type { MembershipStatus } from '../../../../src/billing/membership-model.ts';

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
/** Membership values that differ from the status-dictionary key; the rest are the key. */
const membershipKey = (status: MembershipStatus): string =>
  status === 'APPROVED_AWAITING_PAYMENT' ? 'AWAITING_PAYMENT' : status === 'PAYMENT_PENDING' ? 'PENDING_PAYMENT' : status;

const MEMBERSHIP: ReadonlyArray<{ status: MembershipStatus; meaning: string }> = [
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
    <div className="mx-auto max-w-[var(--container-reading)] space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={CRUMBS} origin={origin} />
        <PageHeader title={TITLE} meta={[DESCRIPTION]} />
      </div>

      <section aria-labelledby="status-membership-title" className="hz-card space-y-md">
        <SectionHeader id="status-membership-title" title="وضعیت‌های عضویت انجمن" size="sm" />
        <dl className="divide-y divide-border-subtle" data-testid="status-membership">
          {MEMBERSHIP.map((entry) => (
            <div key={entry.status} className="space-y-xs py-md first:pt-0 last:pb-0">
              <dt>
                <StatusBadge status={membershipKey(entry.status)} />
              </dt>
              <dd className="hz-body-sm text-text-secondary">{entry.meaning}</dd>
            </div>
          ))}
        </dl>
        <Link href="/association/membership" className="hz-link hz-link--standalone hz-body-sm">
          شرایط و مسیر عضویت
          <Icon name="arrowRight" size="xs" mirror />
        </Link>
      </section>

      <section aria-labelledby="status-trusted-title" className="hz-card space-y-md">
        <SectionHeader id="status-trusted-title" title="مراحل دامپزشک معتمد" size="sm" />
        <ol className="space-y-lg" data-testid="status-trusted">
          {TRUSTED_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-md">
              <span className="hz-avatar shrink-0" aria-hidden="true">
                {(index + 1).toLocaleString('fa-IR')}
              </span>
              <span className="min-w-0">
                <span className="block text-label-lg">{step.title}</span>
                <span className="hz-body-sm mt-xs block text-text-secondary">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <ButtonLink href="/veterinarians" tone="secondary">
          فهرست دامپزشکان
        </ButtonLink>
      </section>

      <section aria-labelledby="status-club-title" className="hz-card space-y-md">
        <SectionHeader id="status-club-title" title="چرخه یک کلاب" size="sm" />
        <dl className="divide-y divide-border-subtle" data-testid="status-club">
          {CLUB_ORDER.map((state) => (
            <div key={state} className="space-y-xs py-md first:pt-0 last:pb-0">
              <dt>
                <StatusBadge status={state} />
              </dt>
              <dd className="hz-body-sm text-text-secondary">{CLUB_MEANING[state]}</dd>
            </div>
          ))}
        </dl>
        <Link href="/clubs" className="hz-link hz-link--standalone hz-body-sm">
          فهرست کلاب‌ها
          <Icon name="arrowRight" size="xs" mirror />
        </Link>
      </section>
    </div>
  );
}
