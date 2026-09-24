import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
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
        <ul className="space-y-md" data-testid="setting-history">
          {history.items.map((row) => (
            <li key={row.id} className="rounded-lg border border-border-subtle p-md" data-testid={'history-' + row.id}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <p className="text-caption text-text-secondary">{formatted(row.occurredAt)}</p>
                <StatusBadge tone="neutral">{row.actorContext ?? 'سیستم'}</StatusBadge>
              </div>
              <p className="mt-sm text-body-sm">
                <bdi className="hz-ltr font-mono" data-testid={'history-before-' + row.id}>
                  {row.beforeValue}
                </bdi>
                <span className="mx-sm text-text-disabled">←</span>
                <bdi className="hz-ltr font-mono" data-testid={'history-after-' + row.id}>
                  {row.afterValue}
                </bdi>
              </p>
              {row.reason ? <p className="mt-sm text-caption text-text-secondary">دلیل: {row.reason}</p> : null}
            </li>
          ))}
        </ul>
      );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (
      <OpsShell actor={actor} title="تاریخچه مقدار" pathname="/market/settings" nav={marketNav(actor)}>
        <Card>
          <Alert tone="error" title={error.message} />
        </Card>
      </OpsShell>
    );
  }

  return (
    <OpsShell actor={actor} title="تاریخچه مقدار" pathname="/market/settings" nav={marketNav(actor)}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">{definition?.labelFa ?? key}</h2>
          <p className="mt-2xs text-caption text-text-secondary">
            <bdi className="hz-ltr font-mono">{key}</bdi>
          </p>
          <p className="mt-md text-caption">
            <Link href="/market/settings" className="text-text-brand" data-testid="back-to-settings">
              بازگشت به تنظیمات بازار
            </Link>
          </p>
        </Card>
        <Card>{body}</Card>
      </div>
    </OpsShell>
  );
}
