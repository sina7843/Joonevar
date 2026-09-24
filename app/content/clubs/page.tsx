import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { clubReportQueue } from '../../../src/clubs/service.ts';
import { REASON_FA, type ReportReason } from '../../../src/moderation/model.ts';
import { CLUB_LIFECYCLE_FA, type ClubLifecycle } from '../../../src/clubs/model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { ClubModerationForm } from '../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * Reported clubs — Phase 2.5 §8 (PROMPT-012). All the open reports of one club
 * are decided together: dismissed, the page hidden, or the club taken out of
 * public life. Nothing is deleted and the reporters are never named.
 */
export default async function ContentClubsPage() {
  const guard = await guardRoute('/content/clubs');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const groups = await clubReportQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="گزارش کلاب‌ها" pathname="/content/clubs" nav={CONTENT_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">گزارش‌های کاربران درباره کلاب‌ها</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            گزارش‌های باز هر کلاب یک‌جا بررسی می‌شوند. نام گزارش‌دهنده در این صفحه نمی‌آید و به کلاب هم گفته نمی‌شود.
          </p>
        </Card>

        {groups.length === 0 ? (
          <EmptyState title="گزارش بازی درباره کلاب‌ها نیست" description="گزارش تازه کاربران در همین صفحه می‌آید." />
        ) : (
          <ul className="space-y-md" data-testid="club-report-queue">
            {groups.map((group) => (
              <li key={group.club.id} className="space-y-sm rounded-lg border border-border-subtle bg-bg-surface p-lg">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <Link href={'/clubs/' + (group.club.publicSlug ?? '')} className="text-label-lg text-text-brand">
                    {group.club.displayNameFa}
                  </Link>
                  <div className="flex flex-wrap gap-xs">
                    <StatusBadge tone="warning">{fa(group.openReports) + ' گزارش باز'}</StatusBadge>
                    <StatusBadge tone="neutral">{CLUB_LIFECYCLE_FA[group.club.lifecycle as ClubLifecycle]}</StatusBadge>
                  </div>
                </div>
                <p className="text-body-sm text-text-secondary">
                  {group.reasons.map((reason) => REASON_FA[reason as ReportReason] ?? reason).join('، ')}
                </p>
                <p className="text-caption text-text-secondary">{'نخستین گزارش: ' + formatInstantFa(group.firstReportedAt)}</p>
                <ClubModerationForm clubId={group.club.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
