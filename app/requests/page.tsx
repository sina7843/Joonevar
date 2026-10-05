import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { PageHeader } from '../../src/ui/section-header.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { listOwnerRequests } from '../../src/vets/visits.ts';
import { REQUEST_STATUS_FA, REQUEST_STATUS_TONE, SERVICE_TYPE_FA } from '../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Active requests (§8, §11.2) — P05 DataTable, restacked as cards below 768.
 *
 * Each row carries its own status, animal, deadline and a link that reopens the
 * same case — the group the animals were created in never becomes the unit of
 * action. One link per row (the title), so a row is never two destinations.
 */
export default async function RequestsPage() {
  const guard = await guardRoute('/requests');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await listOwnerRequests(db(), guard.actor);
  const yours = rows.filter((row) => row.request.status === 'ACTIVE').length;

  return (
    <PublicShell
      actor={guard.actor}
      title="درخواست‌ها"
      pathname="/requests"
      header={
        <PageHeader
          title="درخواست‌ها"
          meta={
            rows.length > 0
              ? [
                  rows.length.toLocaleString('fa-IR') + ' درخواست',
                  yours > 0 ? yours.toLocaleString('fa-IR') + ' منتظر مراجعه شما' : null,
                ].filter(Boolean)
              : undefined
          }
          actions={
            <ButtonLink href="/requests/new" iconStart="plus" data-testid="start-visit-request">
              درخواست مراجعه جدید
            </ButtonLink>
          }
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="درخواستی ثبت نشده است"
          description="درخواست مراجعه، صدور سند و بررسی‌ها پس از ایجاد، همراه وضعیت و مهلت معتبر در این فهرست دیده می‌شوند."
        />
      ) : (
        <div className="hz-table-wrap" data-testid="request-list">
          <table className="hz-table hz-table--stack">
            <caption className="hz-visually-hidden">درخواست‌های من</caption>
            <thead>
              <tr>
                <th scope="col">درخواست</th>
                <th scope="col">کد مراجعه</th>
                <th scope="col">وضعیت</th>
                <th scope="col">اقدام بعدی با</th>
                <th scope="col">مهلت مراجعه</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const owner = row.request.status === 'ACTIVE' ? 'USER' : 'VET';
                return (
                  <tr key={row.request.id}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <Link className="hz-case__name" href={'/requests/' + row.request.id}>
                          {SERVICE_TYPE_FA[row.request.serviceType]}
                        </Link>
                        <span className="hz-case__sub">حیوان: {row.animalName ?? 'بدون نام'}</span>
                      </div>
                    </td>
                    <td data-label="کد مراجعه">
                      {row.referral ? (
                        <bdi className="hz-id" dir="ltr" data-testid="identifier">
                          {row.referral.code}
                        </bdi>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="وضعیت">
                      <StatusBadge size="sm" tone={row.expired ? 'warning' : REQUEST_STATUS_TONE[row.request.status]!}>
                        {row.expired ? 'مهلت گذشته' : REQUEST_STATUS_FA[row.request.status]!}
                      </StatusBadge>
                    </td>
                    <td data-label="اقدام بعدی با">
                      <span
                        className={
                          owner === 'USER' ? 'hz-owner hz-owner--inline hz-owner--you' : 'hz-owner hz-owner--inline'
                        }
                      >
                        <span className="hz-owner__who">{owner === 'USER' ? 'شما' : 'دامپزشک معتمد'}</span>
                      </span>
                    </td>
                    <td data-label="مهلت مراجعه">
                      {row.referral ? formatCivilDateFa(row.referral.expiresAt.toISOString().slice(0, 10)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PublicShell>
  );
}
