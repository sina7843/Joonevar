import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { reportsForContent } from '../../../../src/moderation/service.ts';
import { restrictionMessage } from '../../../../src/moderation/restrictions.ts';
import { DECISION_FA, REASON_FA, REPORT_STATUS_FA, type ModerationDecision } from '../../../../src/moderation/model.ts';
import { KIND_FA, KIND_PATH, PUBLIC_STATE_FA, STATUS_FA, formatInstantFa } from '../../../../src/content/model.ts';
import { DecisionForm } from '../../../../src/moderation/forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/** All reports of one item and the decision on them — Requirements-Phase-2 §13. */
export default async function ContentReportDetailPage({ params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  const guard = await guardRoute('/content/reports/' + encodeURIComponent(contentId));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const data = await reportsForContent(db(), guard.actor, contentId);
  if (data === null) notFound();
  const { item } = data;
  const publicPath = KIND_PATH[item.kind];

  // Only decisions that can still apply to this item are offered.
  const decisions: ModerationDecision[] = ['DISMISS'];
  if (item.status !== 'DELETED') decisions.push('REQUEST_CORRECTION');
  if (item.status !== 'HIDDEN' && item.status !== 'DELETED') decisions.push('HIDE');
  if (item.status !== 'DELETED') decisions.push('SOFT_DELETE');
  if (!data.restriction) decisions.push('RESTRICT_PUBLISHER');

  return (
    <OpsShell actor={guard.actor} title="ادمین محتوا" pathname="/content/reports" nav={CONTENT_NAV}>
      <div className="space-y-lg">
        <Link href="/content/reports" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به صف گزارش‌ها
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div className="min-w-0">
              <p className="text-caption text-text-secondary">{KIND_FA[item.kind] + ' · نویسنده: ' + data.authorName}</p>
              <h1 className="text-h4">{item.titleFa}</h1>
            </div>
            <div className="flex flex-wrap gap-xs">
              <StatusBadge tone="neutral">
                <span data-testid="reported-content-status">{STATUS_FA[item.status]}</span>
              </StatusBadge>
              <StatusBadge tone="neutral">{PUBLIC_STATE_FA[data.publicState]}</StatusBadge>
            </div>
          </div>
          <p className="mt-md flex flex-wrap gap-md text-label-md">
            <Link href={'/content/' + item.id} className="text-text-brand underline underline-offset-4">
              باز کردن در ویرایشگر
            </Link>
            {publicPath && (data.publicState === 'VISIBLE' || data.publicState === 'ARCHIVED') ? (
              <Link href={publicPath + '/' + item.slug} className="text-text-brand underline underline-offset-4">
                مشاهده در سایت
              </Link>
            ) : null}
          </p>
        </Card>

        {item.correctionNote ? (
          <Alert tone="info" title="اصلاح از نویسنده درخواست شده و هنوز پاسخ نگرفته است">
            <span data-testid="pending-correction">{item.correctionNote}</span>
          </Alert>
        ) : null}
        {data.restriction ? (
          <Alert tone="warning" title="نویسنده محدودیت انتشار دارد">
            {restrictionMessage(data.restriction)}
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">{'گزارش‌های باز (' + fa(data.open.length) + ')'}</h2>
          {data.open.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="گزارش بازی برای این محتوا نیست" description="تصمیم‌های قبلی پایین همین صفحه آمده‌اند." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="open-reports">
              {data.open.map((report) => (
                <li key={report.id} className="rounded-md border border-border-subtle p-md" data-testid="open-report">
                  <p className="text-label-md">{REASON_FA[report.reason]}</p>
                  {report.details ? <p className="mt-xs whitespace-pre-line text-body-sm">{report.details}</p> : null}
                  <p className="mt-xs text-caption text-text-secondary">
                    {formatInstantFa(report.createdAt) + (report.contentRevision ? ' · روی نسخه ' + fa(report.contentRevision) : '')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <DecisionForm contentId={item.id} decisions={decisions} hasOpenReports={data.open.length > 0} />

        {data.decided.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">تصمیم‌های قبلی</h2>
            <ul className="mt-lg space-y-sm" data-testid="decided-reports">
              {data.decided.map((report) => (
                <li key={report.id} className="rounded-md border border-border-subtle p-md">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <p className="text-label-md">
                      {REASON_FA[report.reason] + (report.decision ? ' ← ' + DECISION_FA[report.decision] : '')}
                    </p>
                    <StatusBadge tone={report.status === 'DISMISSED' ? 'neutral' : 'success'}>
                      {REPORT_STATUS_FA[report.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-xs text-caption text-text-secondary">
                    {(report.decisionReason ?? '') +
                      ' · ' +
                      (report.decidedByName ?? 'ادمین محتوا') +
                      (report.decidedAt ? ' · ' + formatInstantFa(report.decidedAt) : '')}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </OpsShell>
  );
}
