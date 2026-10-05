import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel } from '../../../../src/ui/desk.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { settingHistory } from '../../../../src/marketplace/operations.ts';
import { SETTING_BY_KEY } from '../../../../src/settings/keys.ts';
import { parsePageRequest } from '../../../../src/domain/pagination.ts';

export const dynamic = 'force-dynamic';

const formatted = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * The history of one managed value — Phase 3, PROMPT-002.
 *
 * Read-only, and each entry is the pair the audit row already holds: what the
 * value was, what it became, and the reason the person gave. This is what makes
 * a later argument about a tariff answerable instead of a memory test.
 */
export default async function MarketSettingHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const guard = await guardRoute('/market/settings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const { key } = await params;
  const { page } = await searchParams;
  const definition = SETTING_BY_KEY.get(key);

  let body;
  try {
    const history = await settingHistory(db(), actor, key, parsePageRequest({ page }));
    body =
      history.items.length === 0 ? (
        <EmptyState
          title="هنوز تغییری ثبت نشده است"
          description="این مقدار از زمان نصب دست نخورده است؛ اولین تغییر همین‌جا با نام، زمان و دلیل ثبت می‌شود."
        />
      ) : (
        <div className="hz-table-wrap">
          <table className="hz-table hz-table--stack" data-testid="setting-history">
            <caption className="hz-visually-hidden">تاریخچه تغییرات، تازه‌ترین در بالا</caption>
            <thead>
              <tr>
                <th scope="col">زمان</th>
                <th scope="col">انجام‌دهنده</th>
                <th scope="col">قبل ← بعد</th>
                <th scope="col">دلیل</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((row) => (
                <tr key={row.id} className="hz-audit-row" data-testid={'history-' + row.id}>
                  <td className="hz-table__lead">
                    <span className="hz-audit-when">{formatted(row.occurredAt)}</span>
                  </td>
                  <td data-label="انجام‌دهنده">
                    <span className={row.actorContext ? 'hz-audit-who' : 'hz-audit-who hz-audit-who--system'}>
                      <span className="hz-audit-who__name">
                        <bdi dir="auto">{row.actorContext ?? 'سیستم'}</bdi>
                      </span>
                    </span>
                  </td>
                  <td data-label="قبل ← بعد" className="max-w-md">
                    <div className="hz-audit-change">
                      <span className="hz-visually-hidden">از</span>
                      <bdi className="hz-audit-change__before [overflow-wrap:anywhere]" dir="ltr" data-testid={'history-before-' + row.id}>
                        {row.beforeValue}
                      </bdi>
                      <Icon name="arrowRight" size="xs" mirror className="hz-audit-change__arrow" />
                      <span className="hz-visually-hidden">به</span>
                      <bdi className="hz-audit-change__after [overflow-wrap:anywhere]" dir="ltr" data-testid={'history-after-' + row.id}>
                        {row.afterValue}
                      </bdi>
                    </div>
                  </td>
                  <td data-label="دلیل" className="min-w-48">
                    {row.reason ? (
                      <p className="hz-audit-reason">دلیل: {row.reason}</p>
                    ) : (
                      <p className="hz-audit-reason hz-audit-reason--none">— بدون دلیل ثبت‌شده</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (
      <OpsShell actor={actor} title="تاریخچه مقدار" pathname="/market/settings" nav={marketNav(actor)}>
        <Alert tone="error" title={error.message} />
      </OpsShell>
    );
  }

  return (
    <OpsShell actor={actor} title="تاریخچه مقدار" pathname="/market/settings" nav={marketNav(actor)}>
      <Link href="/market/settings" className="hz-link hz-link--standalone" data-testid="back-to-settings">
        بازگشت به تنظیمات بازار
      </Link>
      <Panel
        title={definition?.labelFa ?? key}
        aside={
          <bdi className="hz-setting__key" dir="ltr">
            {key}
          </bdi>
        }
      >
        {body}
      </Panel>
    </OpsShell>
  );
}
