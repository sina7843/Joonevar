import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { db } from '../../../src/db/client.ts';
import { decidedReports, openReportQueue } from '../../../src/moderation/service.ts';
import { DECISION_FA, REASON_FA, REPORT_STATUS_FA } from '../../../src/moderation/model.ts';
import { KIND_FA, STATUS_FA, formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type Search = Promise<{ view?: string | string[]; page?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

/** The report queue — Requirements-Phase-2 §13, §21 (PROMPT-005). */
export default async function ContentReportsPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/content/reports');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const search = await searchParams;
  const decided = one(search.view) === 'decided';
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const base = '/content/reports' + (decided ? '?view=decided' : '');
  const pageHref = (target: number) => (target <= 1 ? base : base + (decided ? '&' : '?') + 'page=' + target);

  const open = decided ? null : await openReportQueue(db(), guard.actor, { page });
  const history = decided ? await decidedReports(db(), guard.actor, { page }) : null;
  const result = open ?? history!;

  return (
    <OpsShell actor={guard.actor} title="گزارش‌ها" pathname="/content/reports" nav={CONTENT_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          گزارش‌های باز هر محتوا یک‌جا بررسی می‌شوند. نام گزارش‌دهنده در این صفحه نمی‌آید.
        </span>
      </p>
      <ViewChips
        label="نمای گزارش‌ها"
        chips={[
          { key: 'open', href: '/content/reports', label: 'در انتظار بررسی', current: !decided },
          { key: 'decided', href: '/content/reports?view=decided', label: 'تصمیم‌گرفته', current: decided },
        ]}
      />

      {open ? (
        open.items.length === 0 ? (
          <EmptyState title="گزارشی در انتظار بررسی نیست" description="گزارش‌های تازه کاربران اینجا نشان داده می‌شوند." />
        ) : (
          <CaseList label="صف گزارش‌ها" testId="report-queue">
            {open.items.map((entry) => (
              <CaseItem
                key={entry.contentId}
                type={KIND_FA[entry.kind]}
                name={
                  <>
                    {entry.titleFa}
                    {/* The reasons belong to the link: it names the case by what was reported. */}
                    <span className="block text-caption font-normal text-text-secondary">
                      {entry.reasons.map((reason) => REASON_FA[reason]).join('، ')}
                    </span>
                  </>
                }
                href={'/content/reports/' + entry.contentId}
                linkTestId={'report-queue-item-' + entry.contentId}
                sub={
                  <>
                    {'آخرین گزارش: ' + formatInstantFa(entry.latestAt)}
                    {' · '}
                    <span className={entry.openReports >= 3 ? 'hz-report__count hz-report__count--high' : 'hz-report__count'}>
                      {fa(entry.openReports) + ' گزارش باز'}
                    </span>
                    {' · وضعیت محتوا: ' + STATUS_FA[entry.status]}
                    {entry.correctionRequested ? ' · اصلاح درخواست شده' : ''}
                  </>
                }
                ageDays={ageInDays(entry.latestAt)}
                status={{ tone: 'info', label: 'در انتظار بررسی' }}
                owner="SYSTEM"
                ownerLabel="ادمین محتوا"
                ownerIsUs
              />
            ))}
          </CaseList>
        )
      ) : history!.items.length === 0 ? (
        <EmptyState title="هنوز تصمیمی ثبت نشده است" description="گزارش‌های بررسی‌شده با تصمیم و دلیلشان اینجا می‌مانند." />
      ) : (
        <CaseList label="گزارش‌های تصمیم‌گرفته" testId="report-history">
          {history!.items.map((report) => (
            <CaseItem
              key={report.id}
              name={report.titleFa}
              href={'/content/reports/' + report.contentId}
              sub={
                REASON_FA[report.reason] +
                ' ← ' +
                DECISION_FA[report.decision] +
                ' · ' +
                (report.decisionReason ?? '') +
                ' · ' +
                (report.decidedByName ?? 'ادمین محتوا') +
                ' · ' +
                formatInstantFa(report.decidedAt)
              }
              status={{ tone: report.status === 'DISMISSED' ? 'neutral' : 'success', label: REPORT_STATUS_FA[report.status] }}
            />
          ))}
        </CaseList>
      )}

      {result.totalPages > 1 ? (
        <nav aria-label="صفحه‌بندی" className="flex items-center justify-between gap-md">
          {result.page > 1 ? <ButtonLink tone="secondary" size="sm" href={pageHref(result.page - 1)}>صفحه قبل</ButtonLink> : <span />}
          <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
          {result.page < result.totalPages ? <ButtonLink tone="secondary" size="sm" href={pageHref(result.page + 1)}>صفحه بعد</ButtonLink> : <span />}
        </nav>
      ) : null}
    </OpsShell>
  );
}
