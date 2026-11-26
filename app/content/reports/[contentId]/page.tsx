import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, CONTENT_NAV } from '../../../../src/ui/shell.tsx';
import { CaseAge, CaseHistory, Desk, DeskHead, Panel, deskPosition } from '../../../../src/ui/desk.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { ActionOwner, Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { openReportQueue, reportsForContent } from '../../../../src/moderation/service.ts';
import { restrictionMessage } from '../../../../src/moderation/restrictions.ts';
import { DECISION_FA, REASON_FA, REPORT_STATUS_FA, type ModerationDecision } from '../../../../src/moderation/model.ts';
import { KIND_FA, KIND_PATH, PUBLIC_STATE_FA, STATUS_FA, formatInstantFa } from '../../../../src/content/model.ts';
import { ReportDecisionForm } from '../../../../src/moderation/forms.tsx';

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

  const open = data.open.length > 0;
  const oldest = data.open.reduce<Date | null>((min, report) => (min === null || report.createdAt < min ? report.createdAt : min), null);
  // The latest decision closed every open report together; it is what the panel reports once nothing is open.
  const latest = data.decided.reduce<(typeof data.decided)[number] | null>(
    (last, report) => (report.decidedAt && (!last?.decidedAt || report.decidedAt > last.decidedAt) ? report : last),
    null,
  );
  // ponytail: position within the first 100 cases of the queue (its page ceiling), in queue order.
  const queue = open ? await openReportQueue(db(), guard.actor, { page: 1, pageSize: 100 }) : null;
  const position = queue ? deskPosition(queue.items.map((entry) => entry.contentId), item.id, (other) => '/content/reports/' + other) : null;
  // Reporter identities stay hidden from the content admin (DEC-0235): numbered, oldest first.
  const reporterNumber = new Map([...data.open].reverse().map((report, index) => [report.id, index + 1]));
  return (
    <OpsShell actor={guard.actor} title="بررسی گزارش محتوا" pathname="/content/reports" nav={CONTENT_NAV} headingInPage>
      <DeskHead level={1}
        title={'گزارش محتوا، ' + item.titleFa}
        status={{ tone: open ? 'info' : 'success', label: open ? 'در حال بررسی' : 'تعیین تکلیف شد' }}
        position={position}
        meta={[
          <Identifier key="id" label="شناسه محتوا" value={item.id} />,
          <>{'نوع: '}<b>{KIND_FA[item.kind]}</b></>,
          <>{'ناشر: '}<b>{data.authorName}</b></>,
          oldest ? 'نخستین گزارش: ' + formatInstantFa(oldest) : null,
          open && oldest ? <CaseAge since={oldest} /> : null,
          'نسخه ' + fa(item.revisionNumber),
          <>{'وضعیت محتوا: '}<b data-testid="reported-content-status">{STATUS_FA[item.status]}</b></>,
          PUBLIC_STATE_FA[data.publicState],
        ]}
      >
        {open ? <ActionOwner owner="SYSTEM" label="ادمین محتوا" you /> : null}
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

      <Desk
        decisionTitle={open ? 'تصمیم' : 'نتیجه'}
        decision={
          open ? (
            <ReportDecisionForm
              contentId={item.id}
              version={item.version}
              decisions={decisions}
              drafts={[...new Set(data.open.map((report) => REASON_FA[report.reason]))]}
            />
          ) : (
            <div data-testid="decision-result">
              <Alert tone="info" title={latest?.decision ? DECISION_FA[latest.decision] + ' ثبت شد.' : 'گزارش بازی برای این محتوا نیست.'}>
                {latest?.decisionReason ?? undefined}
              </Alert>
            </div>
          )
        }
      >
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
                    <b className="block">{'گزارش‌دهنده ' + fa(reporterNumber.get(report.id) ?? 0)}</b>
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

        {/* «سابقه پرونده» from the first report on (KOPS-033): received reports, then decisions, newest first. */}
        <Panel title="سابقه پرونده">
          <div data-testid={data.decided.length > 0 ? 'decided-reports' : 'case-history'}>
            <CaseHistory
              entries={[
                ...data.decided.map((report) => ({
                  id: report.id,
                  title: REASON_FA[report.reason] + (report.decision ? ' ← ' + DECISION_FA[report.decision] : ''),
                  whenFa: (report.decidedByName ?? 'ادمین محتوا') + (report.decidedAt ? ' · ' + formatInstantFa(report.decidedAt) : ''),
                  status: { tone: report.status === 'DISMISSED' ? ('neutral' as const) : ('success' as const), label: REPORT_STATUS_FA[report.status] },
                  body: report.decisionReason ?? undefined,
                  at: report.decidedAt ?? undefined,
                })),
                ...data.open.map((report, index) => ({
                  id: 'open-' + report.id,
                  title: 'گزارش دریافت شد: ' + REASON_FA[report.reason],
                  whenFa: 'گزارش‌دهنده ' + fa(reporterNumber.get(report.id) ?? 0) + ' · ' + formatInstantFa(report.createdAt),
                  current: index === 0,
                  at: report.createdAt,
                })),
              ].sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0))}
            />
          </div>
        </Panel>
      </Desk>
    </OpsShell>
  );
}
