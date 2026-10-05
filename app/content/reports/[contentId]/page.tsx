import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../../src/ui/shell.tsx';
import { DeskHead, Panel, CaseHistory } from '../../../../src/ui/desk.tsx';
import { ageInDays } from '../../../../src/ui/queue.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
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

  const oldest = data.open.reduce<Date | null>((min, report) => (min === null || report.createdAt < min ? report.createdAt : min), null);
  const age = ageInDays(oldest);
  return (
    <OpsShell actor={guard.actor} title="بررسی گزارش محتوا" pathname="/content/reports" nav={CONTENT_NAV}>
      <DeskHead
        title={'گزارش محتوا، ' + item.titleFa}
        status={{ tone: data.open.length > 0 ? 'info' : 'success', label: data.open.length > 0 ? 'در حال بررسی' : 'تعیین تکلیف شد' }}
        meta={[
          <>{'نوع: '}<b>{KIND_FA[item.kind]}</b></>,
          <>{'نویسنده: '}<b>{data.authorName}</b></>,
          <>{'وضعیت محتوا: '}<b data-testid="reported-content-status">{STATUS_FA[item.status]}</b></>,
          PUBLIC_STATE_FA[data.publicState],
          data.open.length > 0 && age !== null ? (
            <span className="hz-age">
              <Icon name="clock" size="xs" />
              {fa(age) + ' روز در صف'}
            </span>
          ) : null,
        ]}
        owner={data.open.length > 0 ? 'SYSTEM' : null}
        ownerExtra={data.open.length > 0 ? 'ادمین محتوا' : undefined}
      >
        <p className="flex flex-wrap gap-lg">
          <Link href="/content/reports" className="hz-link hz-link--standalone">
            <Icon name="arrowLeft" size="xs" mirror />
            بازگشت به صف گزارش‌ها
          </Link>
          <Link href={'/content/' + item.id} className="hz-link hz-link--standalone">
            باز کردن در ویرایشگر
          </Link>
          {publicPath && (data.publicState === 'VISIBLE' || data.publicState === 'ARCHIVED') ? (
            <Link href={publicPath + '/' + item.slug} className="hz-link hz-link--standalone">
              مشاهده در سایت
              <Icon name="arrowSquareOut" size="xs" />
            </Link>
          ) : null}
        </p>
      </DeskHead>

      <div className="hz-desk">
        <div className="min-w-0 space-y-lg">
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

          <Panel title="گزارش‌ها" count={fa(data.open.length)} aside="هویت گزارش‌دهندگان در این صفحه نمی‌آید">
            {data.open.length === 0 ? (
              <EmptyState title="گزارش بازی برای این محتوا نیست" description="تصمیم‌های قبلی پایین همین صفحه آمده‌اند." />
            ) : (
              <ul className="hz-kv" data-testid="open-reports">
                {data.open.map((report) => (
                  <li key={report.id} className="hz-kv__row" data-testid="open-report">
                    <span className="hz-kv__key">
                      {formatInstantFa(report.createdAt) + (report.contentRevision ? ' · روی نسخه ' + fa(report.contentRevision) : '')}
                    </span>
                    <span className="hz-kv__value">
                      <span className="hz-tag hz-tag--neutral">{REASON_FA[report.reason]}</span>
                      {report.details ? <span className="mt-xs block whitespace-pre-line font-normal">{report.details}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {data.decided.length > 0 ? (
            <Panel title="سابقه پرونده">
              <div data-testid="decided-reports">
                <CaseHistory
                  entries={data.decided.map((report) => ({
                    id: report.id,
                    title: REASON_FA[report.reason] + (report.decision ? ' ← ' + DECISION_FA[report.decision] : ''),
                    whenFa: (report.decidedByName ?? 'ادمین محتوا') + (report.decidedAt ? ' · ' + formatInstantFa(report.decidedAt) : ''),
                    status: { tone: report.status === 'DISMISSED' ? 'neutral' : 'success', label: REPORT_STATUS_FA[report.status] },
                    body: report.decisionReason ?? undefined,
                  }))}
                />
              </div>
            </Panel>
          ) : null}
        </div>
        <div className="hz-desk__decision">
          <DecisionForm contentId={item.id} decisions={decisions} hasOpenReports={data.open.length > 0} />
        </div>
      </div>
    </OpsShell>
  );
}
