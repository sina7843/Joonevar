import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel } from '../../../../src/ui/desk.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { DataTable } from '../../../../src/ui/data-table.tsx';
import { Pagination } from '../../../../src/ui/pagination.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { settingHistory } from '../../../../src/marketplace/operations.ts';
import { SETTING_BY_KEY } from '../../../../src/settings/keys.ts';
import { parsePageRequest } from '../../../../src/domain/pagination.ts';
import { readSettingForActor } from '../../../../src/settings/service.ts';
import { displaySetting } from '../../../../src/settings/display.ts';
import { canWriteSettingGroup, type SettingGroupName } from '../../../../src/authz/policy.ts';
import { isMarketSettingGroup } from '../../../../src/marketplace/operations.ts';
import { SettingRow } from '../../../../src/ui/setting-row.tsx';
import { updateMarketSettingAction } from '../../actions.ts';

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
        <>
          <div data-testid="setting-history">
            <DataTable
              label="تاریخچه تغییرات، تازه‌ترین در بالا"
              rows={history.items}
              rowKey={(row) => row.id}
              rowTestId={(row) => 'history-' + row.id}
              rowClassName="hz-audit-row"
              columns={[
                {
                  key: 'when',
                  header: 'زمان',
                  lead: true,
                  cell: (row) => <span className="hz-audit-when">{formatted(row.occurredAt)}</span>,
                },
                {
                  key: 'who',
                  header: 'انجام‌دهنده',
                  cell: (row) => (
                    <span className={row.actorContext ? 'hz-audit-who' : 'hz-audit-who hz-audit-who--system'}>
                      <span className="hz-audit-who__name">
                        <bdi dir="auto">{row.actorContext ?? 'سیستم'}</bdi>
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'change',
                  header: 'قبل ← بعد',
                  cell: (row) => (
                    <div className="hz-audit-change max-w-md">
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
                  ),
                },
                {
                  key: 'reason',
                  header: 'دلیل',
                  cell: (row) => (
                    <div className="min-w-48">
                      {row.reason ? (
                        <p className="hz-audit-reason">دلیل: {row.reason}</p>
                      ) : (
                        <p className="hz-audit-reason hz-audit-reason--none">— بدون دلیل ثبت‌شده</p>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
          <Pagination
            page={history.page}
            pageSize={history.pageSize}
            total={history.total}
            totalPages={history.totalPages}
            hrefFor={(n) => '/market/settings/' + encodeURIComponent(key) + '?page=' + n}
            label="صفحه‌بندی تاریخچه"
          />
        </>
      );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (
      <OpsShell actor={actor} title="تاریخچه مقدار" pathname="/market/settings" nav={marketNav(actor)}>
        <Alert tone="error" title={error.message} />
      </OpsShell>
    );
  }

  // P11 below 768: this page is also the key's edit page — the row open on top, its history under it.
  const setting = definition && isMarketSettingGroup(definition.group) ? await readSettingForActor(db(), actor, key).catch(() => null) : null;
  const writable = setting ? canWriteSettingGroup(actor, setting.group as SettingGroupName) : false;

  return (
    <OpsShell actor={actor} title="تاریخچه مقدار" pathname="/market/settings" nav={marketNav(actor)}>
      <Link href="/market/settings" className="hz-link hz-link--standalone" data-testid="back-to-settings">
        بازگشت به تنظیمات بازار
      </Link>
      {setting ? (
        <section className="hz-card">
          <SettingRow
            setting={{
              key: setting.key,
              labelFa: setting.labelFa,
              kind: setting.kind,
              configured: setting.configured,
              raw: setting.configured ? (typeof setting.value === 'object' ? JSON.stringify(setting.value) : String(setting.value)) : '',
              display: displaySetting(setting),
              version: setting.version,
            }}
            writable={writable}
            startOpen={writable}
            action={updateMarketSettingAction}
            ids={{
              value: 'market-setting-value-' + key,
              reason: 'market-setting-reason-' + key,
              save: 'market-setting-save-' + key,
              edit: 'market-setting-edit-' + key,
              form: 'market-setting-form-' + key,
              display: 'market-value-' + key,
            }}
          />
        </section>
      ) : null}
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
