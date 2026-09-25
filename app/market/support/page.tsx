import Link from 'next/link';
import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { supportSummary } from '../../../src/security/risk.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * One account, for somebody answering a telephone — PROMPT-013.
 *
 * Counts and references rather than contents: support needs to know there is
 * an open dispute and an unpaid refund, and reading either is a different
 * screen with a different capability. The telephone number is masked even
 * here, because the person on the line has already said it and the screen's
 * job is to confirm the right record, not to be a directory.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/market/support');
  if (!guard.ok) throw guard.denied;
  const accountId = String((await searchParams).account ?? '').trim();

  let summary: Awaited<ReturnType<typeof supportSummary>> | null = null;
  let problemFa: string | null = null;
  if (accountId !== '') {
    try {
      summary = await supportSummary(db(), guard.actor, accountId);
    } catch (error) {
      problemFa = error instanceof AppError ? error.message : 'این حساب خوانده نشد.';
    }
  }

  return (
    <OpsShell actor={guard.actor} title="پشتیبانی" nav={marketNav(guard.actor)} pathname="/market/support">
      <div className="space-y-lg p-lg">
        <Alert tone="info" title="این صفحه شمارش نشان می‌دهد، نه محتوا">
          <span data-testid="support-note">
            برای خواندن خود پرونده — گفت‌وگو، مدرک یا سند — باید به همان صفحه بروید؛ اختیار آن جداست.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">یافتن حساب</h2>
          <form className="mt-md flex flex-wrap items-end gap-sm" data-testid="support-search">
            <label className="flex flex-col gap-2xs text-caption">
              شناسه حساب
              <input
                type="text"
                name="account"
                defaultValue={accountId}
                dir="ltr"
                className="rounded-md border border-border-subtle px-md py-sm text-body-sm"
                data-testid="support-account-input"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-border-subtle px-lg py-sm text-body-sm"
              data-testid="support-account-submit"
            >
              نمایش
            </button>
          </form>
          <p className="mt-sm text-caption text-text-secondary" data-testid="support-search-note">
            جست‌وجو با شماره تماس در دسترس نیست: فهرست‌کردن حساب‌ها از روی شماره، همان چیزی است که یک نشتی به آن
            تبدیل می‌شود. شناسه را از همان پرونده‌ای بردارید که در دست دارید.
          </p>
        </Card>

        {problemFa !== null ? (
          <Alert tone="error" title="این حساب نمایش داده نشد">
            <span data-testid="support-problem">{problemFa}</span>
          </Alert>
        ) : null}

        {summary !== null ? (
          <Card>
            <h2 className="text-label-lg" data-testid="support-account">
              حساب {summary.maskedMobile}
            </h2>
            <dl className="mt-md grid gap-sm md:grid-cols-3" data-testid="support-counts">
              <div>
                <dt className="text-caption text-text-secondary">درخواست خرید باز</dt>
                <dd className="text-label-lg" data-testid="support-inquiries">
                  {fa(summary.openInquiries)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">گزارش باز</dt>
                <dd className="text-label-lg" data-testid="support-reports">
                  {fa(summary.openReports)}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">بازپرداخت در انتظار</dt>
                <dd className="text-label-lg" data-testid="support-refunds">
                  {fa(summary.refundsOwed)}
                </dd>
              </div>
            </dl>

            {summary.signals.length > 0 ? (
              <ul className="mt-lg space-y-sm" data-testid="support-signals">
                {summary.signals.map((signal) => (
                  <li key={signal.kind} className="text-body-sm">
                    <strong>{signal.labelFa}</strong>: {fa(signal.count)} —{' '}
                    <span className="text-caption text-text-secondary">{signal.noteFa}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-lg text-caption text-text-secondary" data-testid="support-no-signals">
                نشانه پرخطری برای این حساب ثبت نشده است.
              </p>
            )}

            <p className="mt-lg text-caption">
              <Link href="/market/refunds" className="text-text-brand" data-testid="support-to-refunds">
                صف بازپرداخت‌ها
              </Link>
            </p>
          </Card>
        ) : null}
      </div>
    </OpsShell>
  );
}
