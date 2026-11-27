import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
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
export default async function ContentClubsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/content/clubs');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const groups = await clubReportQueue(db(), guard.actor);
  const query = readQueueQuery(await searchParams);
  const page = sliceQueue(groups, query, {
    text: (group) => group.club.displayNameFa,
    at: (group) => group.firstReportedAt,
    name: (group) => group.club.displayNameFa,
  });

  return (
    <OpsShell actor={guard.actor} title="گزارش کلاب‌ها" pathname="/content/clubs" nav={CONTENT_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{fa(groups.length) + ' کلاب با گزارش باز'}</span>
        <span className="hz-page-header__meta-item">
          گزارش‌های باز هر کلاب یک‌جا بررسی می‌شوند. نام گزارش‌دهنده در این صفحه نمی‌آید و به کلاب هم گفته نمی‌شود.
        </span>
      </p>

      {groups.length === 0 ? (
        <EmptyState title="گزارش بازی درباره کلاب‌ها نیست" description="گزارش تازه کاربران در همین صفحه می‌آید." />
      ) : (
            <QueueFrame
              path="/content/clubs"
              params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
              query={query}
              page={page}
              all={page.all}
              noun="کلاب"
              searchLabel="جست‌وجوی نام کلاب"
              defaultSort="oldest"
              testId="club-report-queue-frame"
            >
              {page.items.length === 0 ? (
                <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
              ) : (
        <CaseList label="گزارش‌های کلاب" testId="club-report-queue">
          {page.items.map((group) => (
            <CaseItem
              key={group.club.id}
              type={CLUB_LIFECYCLE_FA[group.club.lifecycle as ClubLifecycle]}
              name={group.club.displayNameFa}
              href={'/clubs/' + (group.club.publicSlug ?? '')}
              sub={
                <>
                  {group.reasons.map((reason) => REASON_FA[reason as ReportReason] ?? reason).join('، ')}
                  {' · '}
                  <span className={group.openReports >= 3 ? 'hz-report__count hz-report__count--high' : 'hz-report__count'}>
                    {fa(group.openReports) + ' گزارش باز'}
                  </span>
                  {' · نخستین گزارش: ' + formatInstantFa(group.firstReportedAt)}
                </>
              }
              ageDays={ageInDays(group.firstReportedAt)}
              status={{ tone: 'info', label: 'در انتظار بررسی' }}
              owner="SYSTEM"
              ownerLabel="ادمین محتوا"
              ownerIsUs
            >
              <ClubModerationForm clubId={group.club.id} />
            </CaseItem>
          ))}
        </CaseList>
              )}
            </QueueFrame>
      )}
    </OpsShell>
  );
}
