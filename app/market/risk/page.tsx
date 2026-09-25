import Link from 'next/link';
import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
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
      <div className="space-y-lg p-lg">
        <Alert tone="info" title="این نشانه‌ها دلیل نگاه‌کردن‌اند، نه حکم">
          <span data-testid="risk-note">
            هیچ‌کدام از این عددها به‌تنهایی تصمیم نیست و این صفحه وضعیت هیچ حسابی را تغییر نمی‌دهد. برای اقدام،
            به همان پرونده بروید و تصمیم را با دلیلش ثبت کنید.
          </span>
        </Alert>

        {rows.length === 0 ? (
          <p className="text-body-sm text-text-secondary" data-testid="risk-empty">
            در این بازه نشانه‌ای ثبت نشده است.
          </p>
        ) : (
          <ul className="space-y-lg" data-testid="risk-queue">
            {rows.map((row) => (
              <li key={row.accountId}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <h2 className="text-label-lg" data-testid={'risk-account-' + row.accountId}>
                      حساب {row.maskedMobile}
                    </h2>
                    <Link
                      href={'/market/support?account=' + row.accountId}
                      className="text-caption text-text-brand"
                      data-testid={'risk-support-' + row.accountId}
                    >
                      باز کردن در پشتیبانی
                    </Link>
                  </div>
                  <ul className="mt-md space-y-sm" data-testid={'risk-signals-' + row.accountId}>
                    {row.signals.map((signal) => (
                      <li key={signal.kind} className="text-body-sm">
                        <strong>{signal.labelFa}</strong>: {fa(signal.count)}
                        <br />
                        <span className="text-caption text-text-secondary">{signal.noteFa}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
