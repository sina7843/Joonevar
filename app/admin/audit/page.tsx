import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { ViewChips, whenFa } from '../../../src/ui/desk.tsx';
import { CONTEXT_LABEL_FA } from '../../../src/ui/role-switcher.tsx';
import { db } from '../../../src/db/client.ts';
import { auditHistory, auditTargetTypes } from '../../../src/operations/service.ts';

export const dynamic = 'force-dynamic';

const FA_TIME = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });

/** A stored before/after value as one readable line; null is «تعیین‌نشده», never ۰. */
function valueText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value.toLocaleString('fa-IR');
  if (typeof value === 'boolean') return value ? 'فعال' : 'غیرفعال';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function Change({ before, after }: { before: unknown; after: unknown }) {
  const from = valueText(before);
  const to = valueText(after);
  if (from === null && to === null) return <span className="text-text-secondary">—</span>;
  const long = (from?.length ?? 0) > 40 || (to?.length ?? 0) > 40;
  const show = (text: string | null) =>
    text === null ? (
      <span className="hz-audit-change__unset">تعیین‌نشده</span>
    ) : (
      <bdi className="line-clamp-2 [overflow-wrap:anywhere]" dir="auto" title={text}>
        {text}
      </bdi>
    );
  if (long) {
    return (
      <div className="hz-audit-change hz-audit-change--text">
        <div className="hz-audit-change__block hz-audit-change__block--before">
          <span className="hz-audit-change__tag">قبل</span>
          {show(from)}
        </div>
        <div className="hz-audit-change__block hz-audit-change__block--after">
          <span className="hz-audit-change__tag">بعد</span>
          {show(to)}
        </div>
      </div>
    );
  }
  return (
    <div className="hz-audit-change">
      <span className="hz-visually-hidden">از</span>
      <span className="hz-audit-change__before">{show(from)}</span>
      <Icon name="arrowRight" size="xs" mirror className="hz-audit-change__arrow" />
      <span className="hz-visually-hidden">به</span>
      <span className="hz-audit-change__after">{show(to)}</span>
    </div>
  );
}

/**
 * The operational history — §21.4, §23.3 — DS P09 with *AuditRow*: newest
 * first, when · who · action · subject · before → after · reason; the rows
 * restack as cards below 768.
 *
 * It reads the audit rows the feature modules wrote, with the redaction they
 * applied at write time. It is a viewer: nothing here can change a record.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  const guard = await guardRoute('/admin/audit');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { target } = await searchParams;
  const [rows, targets] = await Promise.all([
    auditHistory(db(), guard.actor, { targetType: target ?? null, limit: 50 }),
    auditTargetTypes(db(), guard.actor),
  ]);

  return (
    <OpsShell actor={guard.actor} title="تاریخچه" pathname="/admin/audit" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{rows.length.toLocaleString('fa-IR') + ' رویداد · تازه‌ترین در بالا'}</span>
        {target ? (
          <span className="hz-page-header__meta-item">
            {'نوع پرونده: '}
            <bdi dir="ltr">{target}</bdi>
          </span>
        ) : null}
      </p>
      <Alert tone="info" title="این صفحه فقط خواندنی است">
        <span data-testid="audit-readonly">
          رویدادها همان‌جایی ثبت شده‌اند که تغییر رخ داده است؛ از این صفحه هیچ رکوردی تغییر نمی‌کند و مقادیر
          حساس در زمان ثبت حذف شده‌اند.
        </span>
      </Alert>

      <div data-testid="audit-filters">
        <ViewChips
          label="فیلتر بر اساس نوع پرونده"
          chips={[
            { key: 'all', href: '/admin/audit', label: 'همه', current: !target, testId: 'audit-filter-all' },
            ...targets.map((value) => ({
              key: value,
              href: '/admin/audit?target=' + encodeURIComponent(value),
              label: value,
              current: target === value,
              testId: 'audit-filter-' + value,
            })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={target ? 'تغییری با این فیلتر ثبت نشده است' : 'رویدادی ثبت نشده است'}
          description="با انجام اولین عملیات، سوابق اینجا دیده می‌شوند."
          action={
            target ? (
              <a className="hz-btn hz-btn--secondary hz-btn--sm" href="/admin/audit">
                پاک کردن فیلترها
              </a>
            ) : undefined
          }
        />
      ) : (
        <div className="hz-table-wrap">
          <table className="hz-table hz-table--stack" data-testid="audit-list">
            <caption className="hz-visually-hidden">تاریخچه تغییرات، تازه‌ترین در بالا</caption>
            <thead>
              <tr>
                <th scope="col">زمان</th>
                <th scope="col">انجام‌دهنده</th>
                <th scope="col">کنش</th>
                <th scope="col">موضوع</th>
                <th scope="col">قبل ← بعد</th>
                <th scope="col">دلیل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const system = row.actorType === 'SYSTEM';
                const role = row.actorContext
                  ? (CONTEXT_LABEL_FA[row.actorContext as keyof typeof CONTEXT_LABEL_FA] ?? row.actorContext)
                  : 'کاربر';
                return (
                  <tr key={row.id} className="hz-audit-row">
                    <td data-label="زمان">
                      <div className="hz-audit-when">
                        <span>{whenFa(row.occurredAt, false)}</span>
                        <span className="hz-audit-when__time">{FA_TIME.format(row.occurredAt)}</span>
                      </div>
                    </td>
                    <td data-label="انجام‌دهنده">
                      <div className={system ? 'hz-audit-who hz-audit-who--system' : 'hz-audit-who'}>
                        <span className="hz-audit-who__name">{system ? 'سامانه' : role}</span>
                        <span className="hz-audit-who__role">{system ? 'کنش خودکار' : 'کاربر سامانه'}</span>
                      </div>
                    </td>
                    <td className="hz-table__lead">
                      <bdi className="hz-id [overflow-wrap:anywhere]" dir="ltr" data-testid="audit-action">
                        {row.action}
                      </bdi>
                    </td>
                    <td data-label="موضوع">
                      <div className="hz-audit-target">
                        <bdi className="hz-audit-target__key" dir="ltr">
                          {row.targetType}
                        </bdi>
                        <bdi className="hz-audit-target__key [overflow-wrap:anywhere]" dir="ltr">
                          {row.targetId}
                        </bdi>
                        {row.targetVersion !== null ? (
                          <span className="hz-audit-target__meta">{'نسخه ' + row.targetVersion.toLocaleString('fa-IR')}</span>
                        ) : null}
                      </div>
                    </td>
                    <td data-label="قبل ← بعد" className="max-w-md">
                      <Change before={row.before} after={row.after} />
                    </td>
                    <td data-label="دلیل" className="min-w-48">
                      {row.reason ? (
                        <p className="hz-audit-reason">{'دلیل: ' + row.reason}</p>
                      ) : (
                        <p className="hz-audit-reason hz-audit-reason--none">— بدون دلیل ثبت‌شده</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </OpsShell>
  );
}
