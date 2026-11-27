import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { QueueFrame, hrefWith, param } from '../../../src/ui/queue-head.tsx';
import { readQueueQuery } from '../../../src/domain/queue-query.ts';
import { db } from '../../../src/db/client.ts';
import { decidedReports, openReportQueue } from '../../../src/moderation/service.ts';
import { DECISION_FA, REASON_FA, REPORT_STATUS_FA } from '../../../src/moderation/model.ts';
import { KIND_FA, STATUS_FA, formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type Search = Promise<{ view?: string | string[]; page?: string | string[]; q?: string | string[]; sort?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

/** The report queue — Requirements-Phase-2 §13, §21 (PROMPT-005). */
export default async function ContentReportsPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/content/reports');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const search = await searchParams;
  const decided = one(search.view) === 'decided';
  const defaultSort = decided ? 'newest' : 'oldest';
  const query = readQueueQuery({ q: param(search.q), sort: param(search.sort), page: param(search.page) }, defaultSort);
  const ask = { page: query.page, q: query.q, sort: query.sort };
  const open = decided ? null : await openReportQueue(db(), guard.actor, ask);
  const history = decided ? await decidedReports(db(), guard.actor, ask) : null;
  const result = open ?? history!;
  const unsearched =
    query.q === '' ? null : await (decided ? decidedReports : openReportQueue)(db(), guard.actor, { page: 1, pageSize: 1 });
  const all = unsearched?.total ?? result.total;
  const params = { view: decided ? 'decided' : undefined, q: query.q, sort: query.sort === defaultSort ? undefined : query.sort };
  const noResult = <EmptyState title="نتیجه‌ای پیدا نشد" description="عنوان محتوا را دوباره بررسی کنید." />;

  return (
    <OpsShell actor={guard.actor} title="گزارش‌ها" pathname="/content/reports" nav={CONTENT_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          گزارش‌های باز هر محتوا یک‌جا بررسی می‌شوند. نام گزارش‌دهنده در این صفحه نمی‌آید.
        </span>
      </p>
      <QueueFrame
        path="/content/reports"
        params={params}
        query={query}
        page={result}
        all={all}
        noun={decided ? 'گزارش' : 'محتوا'}
        searchLabel="جست‌وجوی عنوان محتوا"
        defaultSort={defaultSort}
        testId="report-queue-frame"
        chips={
          <ViewChips
            label="نمای گزارش‌ها"
            chips={[
              { key: 'open', href: hrefWith('/content/reports', params, { view: undefined, page: undefined }), label: 'در انتظار بررسی', current: !decided },
              { key: 'decided', href: hrefWith('/content/reports', params, { view: 'decided', page: undefined }), label: 'تصمیم‌گرفته', current: decided },
            ]}
          />
        }
      >
      {open ? (
        open.items.length === 0 ? (
          query.q !== '' ? noResult : <EmptyState title="گزارشی در انتظار بررسی نیست" description="گزارش‌های تازه کاربران اینجا نشان داده می‌شوند." />
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
                    {'نخستین گزارش: ' + formatInstantFa(entry.firstAt) + ' · آخرین گزارش: ' + formatInstantFa(entry.latestAt)}
                    {' · '}
                    <span className={entry.openReports >= 3 ? 'hz-report__count hz-report__count--high' : 'hz-report__count'}>
                      {fa(entry.openReports) + ' گزارش باز'}
                    </span>
                    {' · وضعیت محتوا: ' + STATUS_FA[entry.status]}
                    {entry.correctionRequested ? ' · اصلاح درخواست شده' : ''}
                  </>
                }
                ageDays={ageInDays(entry.firstAt)}
                status={{ tone: 'info', label: 'در انتظار بررسی' }}
                owner="SYSTEM"
                ownerLabel="ادمین محتوا"
                ownerIsUs
              />
            ))}
          </CaseList>
        )
      ) : history!.items.length === 0 ? (
        query.q !== '' ? noResult : <EmptyState title="هنوز تصمیمی ثبت نشده است" description="گزارش‌های بررسی‌شده با تصمیم و دلیلشان اینجا می‌مانند." />
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

      </QueueFrame>
    </OpsShell>
  );
}
