import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { RequestCard } from '../../src/ui/card.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { db } from '../../src/db/client.ts';
import { listOwnerRequests } from '../../src/vets/visits.ts';
import { REQUEST_STATUS_FA, SERVICE_TYPE_FA } from '../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Active requests (§8, §11.2).
 *
 * Each row carries its own status, animal, deadline and a CTA that reopens the
 * same case — the group the animals were created in never becomes the unit of
 * action.
 */
export default async function RequestsPage() {
  const guard = await guardRoute('/requests');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await listOwnerRequests(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="درخواست‌ها" pathname="/requests">
      <div className="space-y-lg">
        <ButtonLink href="/requests/new" block data-testid="start-visit-request">
          درخواست مراجعه جدید
        </ButtonLink>

        {rows.length === 0 ? (
          <EmptyState
            title="درخواستی ثبت نشده است"
            description="درخواست مراجعه، صدور سند و بررسی‌ها پس از ایجاد، همراه وضعیت و مهلت معتبر در این فهرست دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="request-list">
            {rows.map((row) => (
              <li key={row.request.id}>
                <RequestCard
                  title={SERVICE_TYPE_FA[row.request.serviceType]}
                  requestCode={row.referral?.code ?? '—'}
                  animalName={row.animalName ?? 'بدون نام'}
                  status={{
                    tone:
                      row.request.status === 'ACTIVE'
                        ? row.expired
                          ? 'warning'
                          : 'info'
                        : row.request.status === 'CHECKED_IN'
                          ? 'success'
                          : 'neutral',
                    label: row.expired ? 'مهلت گذشته' : REQUEST_STATUS_FA[row.request.status]!,
                  }}
                  owner={row.request.status === 'ACTIVE' ? 'USER' : 'VET'}
                  {...(row.referral
                    ? { deadlineFa: formatCivilDateFa(row.referral.expiresAt.toISOString().slice(0, 10)) }
                    : {})}
                  resumeHref={'/requests/' + row.request.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
