import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
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
    <OpsShell actor={guard.actor} title="ادمین محتوا" pathname="/content/reports" nav={CONTENT_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">گزارش‌های کاربران</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            گزارش‌های باز هر محتوا یک‌جا بررسی می‌شوند. نام گزارش‌دهنده در این صفحه نمی‌آید.
          </p>
          <nav aria-label="نمای گزارش‌ها" className="mt-lg flex gap-sm">
            <Link
              href="/content/reports"
              aria-current={decided ? undefined : 'page'}
              className={['rounded-full border px-lg py-xs text-label-md', decided ? 'border-border-subtle text-text-secondary' : 'border-border-brand bg-bg-brand-subtle text-text-brand'].join(' ')}
            >
              در انتظار بررسی
            </Link>
            <Link
              href="/content/reports?view=decided"
              aria-current={decided ? 'page' : undefined}
              className={['rounded-full border px-lg py-xs text-label-md', decided ? 'border-border-brand bg-bg-brand-subtle text-text-brand' : 'border-border-subtle text-text-secondary'].join(' ')}
            >
              تصمیم‌گرفته
            </Link>
          </nav>
        </Card>

        {open ? (
          open.items.length === 0 ? (
            <EmptyState title="گزارشی در انتظار بررسی نیست" description="گزارش‌های تازه کاربران اینجا نشان داده می‌شوند." />
          ) : (
            <ul className="space-y-sm" data-testid="report-queue">
              {open.items.map((entry) => (
                <li key={entry.contentId}>
                  <Link
                    href={'/content/reports/' + entry.contentId}
                    className="block rounded-lg border border-border-subtle bg-bg-surface p-lg hover:border-border-brand"
                    data-testid={'report-queue-item-' + entry.contentId}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-sm">
                      <div className="min-w-0">
                        <p className="text-caption text-text-secondary">{KIND_FA[entry.kind]}</p>
                        <p className="text-label-lg text-text-primary">{entry.titleFa}</p>
                      </div>
                      <div className="flex flex-wrap gap-xs">
                        <StatusBadge tone="warning">{fa(entry.openReports) + ' گزارش باز'}</StatusBadge>
                        <StatusBadge tone="neutral">{STATUS_FA[entry.status]}</StatusBadge>
                        {entry.correctionRequested ? <StatusBadge tone="info">اصلاح درخواست شده</StatusBadge> : null}
                      </div>
                    </div>
                    <p className="mt-sm text-caption text-text-secondary">
                      {entry.reasons.map((reason) => REASON_FA[reason]).join('، ') + ' · آخرین گزارش: ' + formatInstantFa(entry.latestAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : history!.items.length === 0 ? (
          <EmptyState title="هنوز تصمیمی ثبت نشده است" description="گزارش‌های بررسی‌شده با تصمیم و دلیلشان اینجا می‌مانند." />
        ) : (
          <ul className="space-y-sm" data-testid="report-history">
            {history!.items.map((report) => (
              <li key={report.id} className="rounded-lg border border-border-subtle bg-bg-surface p-lg">
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <Link href={'/content/reports/' + report.contentId} className="text-label-md text-text-brand underline underline-offset-4">
                    {report.titleFa}
                  </Link>
                  <StatusBadge tone={report.status === 'DISMISSED' ? 'neutral' : 'success'}>{REPORT_STATUS_FA[report.status]}</StatusBadge>
                </div>
                <p className="mt-xs text-body-sm">{REASON_FA[report.reason] + ' ← ' + DECISION_FA[report.decision]}</p>
                <p className="mt-xs text-caption text-text-secondary">
                  {(report.decisionReason ?? '') + ' · ' + (report.decidedByName ?? 'ادمین محتوا') + ' · ' + formatInstantFa(report.decidedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {result.totalPages > 1 ? (
          <nav aria-label="صفحه‌بندی" className="flex items-center justify-between gap-md">
            {result.page > 1 ? <ButtonLink tone="secondary" href={pageHref(result.page - 1)}>صفحه قبل</ButtonLink> : <span />}
            <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
            {result.page < result.totalPages ? <ButtonLink tone="secondary" href={pageHref(result.page + 1)}>صفحه بعد</ButtonLink> : <span />}
          </nav>
        ) : null}
      </div>
    </OpsShell>
  );
}
