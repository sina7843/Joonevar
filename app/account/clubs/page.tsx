import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { PageHeader } from '../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { ActionOwner, StatusBadge } from '../../../src/ui/status.tsx';
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

/** Who moves a club next, from its lifecycle alone (no owner for settled states). */
const NEXT: Partial<Record<ClubLifecycle, 'USER' | 'ASSOCIATION'>> = {
  DRAFT: 'USER',
  NEEDS_CORRECTION: 'USER',
  PENDING_VERIFICATION: 'ASSOCIATION',
};

/** The clubs this account has a role in — Phase 2.5 §8 (PROMPT-012). P05 list + the create form. */
export default async function AccountClubsPage() {
  const guard = await guardRoute('/account/clubs');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await myClubs(db(), guard.actor);

  return (
    <PublicShell
      actor={guard.actor}
      title="کلاب من"
      pathname="/account/clubs"
      header={
        <PageHeader
          title="کلاب من"
          back={{ href: '/dashboard' }}
          meta={[
            ...(rows.length > 0 ? [rows.length.toLocaleString('fa-IR') + ' کلاب'] : []),
            'هر نقش فقط در همان کلاب کار می‌کند. کلاب تازه به‌صورت پیش‌نویس ساخته می‌شود و پس از تأیید انجمن می‌تواند صفحه عمومی داشته باشد.',
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="usersThree"
          title="هنوز در هیچ کلابی نقشی ندارید"
          description="می‌توانید کلاب تازه‌ای بسازید یا منتظر بمانید تا مالک کلابی به شما نقش بدهد."
        />
      ) : (
        <ul className="hz-cardlist" data-testid="my-clubs">
          {rows.map((row) => {
            const lifecycle = row.club.lifecycle as ClubLifecycle;
            const owner = NEXT[lifecycle];
            return (
              <li key={row.club.id} className="hz-cardlist__item">
                <div className="hz-cardlist__row">
                  <Link
                    href={'/account/clubs/' + row.club.id}
                    className="hz-cardlist__title min-w-0 hover:underline"
                    data-testid={'my-club-' + row.club.id}
                  >
                    {row.club.displayNameFa}
                  </Link>
                  <span className="flex flex-wrap gap-xs">
                    <StatusBadge tone={TONE[lifecycle]}>{CLUB_LIFECYCLE_FA[lifecycle]}</StatusBadge>
                    {row.club.publicStatus === 'PUBLISHED' ? <StatusBadge tone="info">منتشرشده</StatusBadge> : null}
                  </span>
                </div>
                <span className="hz-cardlist__meta">{'نقش شما: ' + (CLUB_ROLE_FA[row.role as ClubRole] ?? row.role)}</span>
                <div className="hz-cardlist__row">
                  {owner ? <ActionOwner owner={owner} /> : <span />}
                  <ButtonLink tone="secondary" size="sm" href={'/account/clubs/' + row.club.id}>
                    مدیریت کلاب
                    <span className="hz-visually-hidden"> {row.club.displayNameFa}</span>
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ClubCreateForm />
    </PublicShell>
  );
}
