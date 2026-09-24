import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { myClubs } from '../../../src/clubs/service.ts';
import { CLUB_LIFECYCLE_FA, CLUB_ROLE_FA, type ClubLifecycle, type ClubRole } from '../../../src/clubs/model.ts';
import { ClubCreateForm } from '../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

const TONE: Record<ClubLifecycle, 'success' | 'warning' | 'neutral' | 'error'> = {
  DRAFT: 'neutral',
  PENDING_VERIFICATION: 'warning',
  NEEDS_CORRECTION: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'error',
  REJECTED: 'error',
  ARCHIVED: 'neutral',
};

/** The clubs this account has a role in — Phase 2.5 §8 (PROMPT-012). */
export default async function AccountClubsPage() {
  const guard = await guardRoute('/account/clubs');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await myClubs(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="کلاب من" pathname="/account/clubs">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">کلاب‌های شما</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            هر نقش فقط در همان کلاب کار می‌کند. کلاب تازه به‌صورت پیش‌نویس ساخته می‌شود و پس از تأیید انجمن می‌تواند صفحه عمومی داشته باشد.
          </p>
        </Card>

        {rows.length === 0 ? (
          <EmptyState title="هنوز در هیچ کلابی نقشی ندارید" description="می‌توانید کلاب تازه‌ای بسازید یا منتظر بمانید تا مالک کلابی به شما نقش بدهد." />
        ) : (
          <ul className="space-y-sm" data-testid="my-clubs">
            {rows.map((row) => (
              <li key={row.club.id}>
                <Link
                  href={'/account/clubs/' + row.club.id}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                  data-testid={'my-club-' + row.club.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-label-lg">{row.club.displayNameFa}</p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {'نقش شما: ' + (CLUB_ROLE_FA[row.role as ClubRole] ?? row.role)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-xs">
                      <StatusBadge tone={TONE[row.club.lifecycle as ClubLifecycle]}>
                        {CLUB_LIFECYCLE_FA[row.club.lifecycle as ClubLifecycle]}
                      </StatusBadge>
                      {row.club.publicStatus === 'PUBLISHED' ? <StatusBadge tone="info">منتشرشده</StatusBadge> : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ClubCreateForm />
      </div>
    </PublicShell>
  );
}
