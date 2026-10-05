import Link from 'next/link';
import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Panel, StatTiles } from '../../../src/ui/desk.tsx';
import { TextField } from '../../../src/ui/field.tsx';
import { Button } from '../../../src/ui/button.tsx';
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
      <Alert tone="info" title="این صفحه شمارش نشان می‌دهد، نه محتوا">
        <span data-testid="support-note">
          برای خواندن خود پرونده — گفت‌وگو، مدرک یا سند — باید به همان صفحه بروید؛ اختیار آن جداست.
        </span>
      </Alert>

      <Panel title="یافتن حساب">
        <form className="flex flex-wrap items-end gap-sm" data-testid="support-search" role="search">
          <div className="min-w-0 flex-1 basis-64">
            <TextField label="شناسه حساب" name="account" defaultValue={accountId} ltr data-testid="support-account-input" />
          </div>
          <Button type="submit" data-testid="support-account-submit">
            نمایش
          </Button>
        </form>
        <p className="text-caption text-text-secondary" data-testid="support-search-note">
          جست‌وجو با شماره تماس در دسترس نیست: فهرست‌کردن حساب‌ها از روی شماره، همان چیزی است که یک نشتی به آن
          تبدیل می‌شود. شناسه را از همان پرونده‌ای بردارید که در دست دارید.
        </p>
      </Panel>

      {problemFa !== null ? (
        <Alert tone="error" title="این حساب نمایش داده نشد">
          <span data-testid="support-problem">{problemFa}</span>
        </Alert>
      ) : null}

      {summary !== null ? (
        <Panel
          title={
            <span data-testid="support-account">
              {'حساب '}
              <bdi dir="ltr">{summary.maskedMobile}</bdi>
            </span>
          }
          aside={
            <Link href="/market/refunds" className="hz-link" data-testid="support-to-refunds">
              صف بازپرداخت‌ها
            </Link>
          }
        >
          <div data-testid="support-counts">
            <StatTiles
              tiles={[
                { label: 'درخواست خرید باز', value: fa(summary.openInquiries), valueTestId: 'support-inquiries' },
                { label: 'گزارش باز', value: fa(summary.openReports), valueTestId: 'support-reports' },
                { label: 'بازپرداخت در انتظار', value: fa(summary.refundsOwed), valueTestId: 'support-refunds' },
              ]}
            />
          </div>

          {summary.signals.length > 0 ? (
            <dl className="hz-kv" data-testid="support-signals">
              {summary.signals.map((signal) => (
                <div key={signal.kind} className="hz-kv__row">
                  <dt className="hz-kv__key">
                    {signal.labelFa}
                    <span className="block text-caption font-normal text-text-secondary">{signal.noteFa}</span>
                  </dt>
                  <dd className="hz-kv__value hz-num">{fa(signal.count)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-caption text-text-secondary" data-testid="support-no-signals">
              نشانه پرخطری برای این حساب ثبت نشده است.
            </p>
          )}
        </Panel>
      ) : null}
    </OpsShell>
  );
}
