import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card, LockedServiceCard } from '../../src/ui/card.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import {
  declarationsOfActor,
  NO_OFFICIAL_EFFECT_NOTE_FA,
  SCOPE_NOTE_FA,
} from '../../src/mating/declaration.ts';
import { PageHeader } from '../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

/** Declaration status → status-dictionary key (the counterparty wait is AWAITING_COUNTERPARTY). */
const statusKey = (status: string): string =>
  status === 'PENDING_COUNTERPARTY_CONFIRMATION' ? 'AWAITING_COUNTERPARTY' : status;

/**
 * The personal declarations of this account — §20.
 *
 * This is a separate route from the official permit, and the page says plainly
 * what the service is and what it cannot produce.
 */
export default async function DeclarationsPage() {
  const guard = await guardRoute('/declaration');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [eligibility, rows] = await Promise.all([
    eligibilityFor(db(), guard.actor.accountId, 'PERSONAL_DECLARATION'),
    declarationsOfActor(db(), guard.actor),
  ]);

  return (
    <PublicShell
      actor={guard.actor}
      title="اعلام توافق شخصی"
      pathname="/declaration"
      header={<PageHeader title={'اعلام توافق شخصی'} back={{ href: '/dashboard' }} />}
    >
      <div className="space-y-lg">
        {eligibility.allowed ? (
          <Card>
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>اعلام توافق شخصی جفت‌گیری</span>
              </h2>
            </div>
            <p className="mt-md text-caption text-text-secondary" data-testid="scope-note">
              {SCOPE_NOTE_FA}
            </p>
            <p className="mt-sm text-caption text-text-secondary" data-testid="no-official-effect">
              {NO_OFFICIAL_EFFECT_NOTE_FA}
            </p>
            <div className="mt-lg">
              <ButtonLink href="/declaration/new" block data-testid="new-declaration">
                ثبت اعلام توافق شخصی
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <LockedServiceCard serviceLabel="اعلام توافق شخصی" lock={eligibility.lock} />
        )}

        {rows.length === 0 ? (
          <EmptyState
            title="هنوز اعلامی ثبت نشده است"
            description="اعلام‌هایی که خودتان ثبت کرده‌اید یا به آن‌ها دعوت شده‌اید در همین فهرست دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="declaration-list">
            {rows.map((row) => (
              <li key={row.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h3 className="text-label-sm">اعلام توافق شخصی</h3>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {row.initiatorAccountId === guard.actor.accountId
                          ? 'آغازکننده: شما'
                          : 'شما طرف مقابل این اعلام هستید'}
                      </p>
                    </div>
                    <StatusBadge status={statusKey(row.status)} />
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link href={'/declaration/' + row.id} className="hz-link" data-testid="open-declaration">
                      مشاهده اعلام
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
