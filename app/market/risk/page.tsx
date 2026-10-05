import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { riskQueue } from '../../../src/security/risk.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * Accounts with something worth reading — PROMPT-013.
 *
 * Every row is a count that passed a threshold, with the sentence saying what
 * it might mean and what it does not. Nothing on this screen changes
 * anybody's standing: acting on a signal means going to the record it points
 * at and using the ordinary tool, with the ordinary reason and the ordinary
 * audit. A page that could suspend somebody from a list of numbers would be a
 * page where nobody reads the numbers.
 */
export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/market/risk');
  if (!guard.ok) throw guard.denied;
  const days = Number(String((await searchParams).days ?? '30')) || 30;
  const rows = await riskQueue(db(), guard.actor, { sinceDays: days });

  return (
    <OpsShell actor={guard.actor} title="نشانه‌های پرخطر" nav={marketNav(guard.actor)} pathname="/market/risk">
      <QueueMeta total={rows.length} noun={'حساب با نشانه در ' + fa(days) + ' روز گذشته'} />
      <Alert tone="info" title="این نشانه‌ها دلیل نگاه‌کردن‌اند، نه حکم">
        <span data-testid="risk-note">
          هیچ‌کدام از این عددها به‌تنهایی تصمیم نیست و این صفحه وضعیت هیچ حسابی را تغییر نمی‌دهد. برای اقدام،
          به همان پرونده بروید و تصمیم را با دلیلش ثبت کنید.
        </span>
      </Alert>

      {rows.length === 0 ? (
        <div data-testid="risk-empty">
          <EmptyState title="در این بازه نشانه‌ای ثبت نشده است." description="هر شماری که از آستانه‌اش بگذرد، اینجا با توضیحش می‌آید." />
        </div>
      ) : (
        <CaseList label="حساب‌های دارای نشانه" testId="risk-queue">
          {rows.map((row) => (
            <CaseItem
              key={row.accountId}
              type="نشانه پرخطر"
              name={
                <span data-testid={'risk-account-' + row.accountId}>
                  {'حساب '}
                  <bdi dir="ltr">{row.maskedMobile}</bdi>
                </span>
              }
              href={'/market/support?account=' + row.accountId}
              linkLabel="باز کردن در پشتیبانی"
              linkTestId={'risk-support-' + row.accountId}
            >
              <dl className="hz-kv" data-testid={'risk-signals-' + row.accountId}>
                {row.signals.map((signal) => (
                  <div key={signal.kind} className="hz-kv__row">
                    <dt className="hz-kv__key">
                      {signal.labelFa}
                      <span className="block text-caption font-normal text-text-secondary">{signal.noteFa}</span>
                    </dt>
                    <dd className="hz-kv__value hz-num">{fa(signal.count)}</dd>
                  </div>
                ))}
              </dl>
            </CaseItem>
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
