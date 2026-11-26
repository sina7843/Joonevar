import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, DeskHead, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../src/ui/desk-drawer.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { messageReportQueue } from '../../../src/marketplace/listing-moderation.ts';
import { REASON_FA, type ReportReason } from '../../../src/moderation/model.ts';
import { MessageDecisionForm } from '../../../src/marketplace/moderation-forms.tsx';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';

export const dynamic = 'force-dynamic';

const when = (value: Date) =>
  new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);

/**
 * Reported chat messages — PROMPT-005.
 *
 * The only place outside a deal thread where its messages can be read, and only
 * the reported ones. A moderator sees what was actually stored, including the
 * note saying the server removed contact details from it, because deciding
 * about a message means reading the message.
 */
export default async function MessageModerationPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/market/messages');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  let queue;
  try {
    queue = await messageReportQueue(db(), actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const query = readQueueQuery(await searchParams);
  const page = sliceQueue(queue, query, {
    text: (entry) => [REASON_FA[entry.reason as ReportReason] ?? entry.reason, entry.bodyFa, entry.detailsFa].filter(Boolean).join(' '),
    at: (entry) => entry.createdAt,
    name: (entry) => REASON_FA[entry.reason as ReportReason] ?? entry.reason,
  });

  return (
    <OpsShell actor={actor} title="گزارش پیام‌های گفت‌وگوی خرید" nav={marketNav(actor)} pathname="/market/messages" meta={<QueueMeta total={queue.length} noun="گزارش باز" oldestDays={queue.length > 0 ? Math.max(...queue.map((entry) => ageInDays(entry.createdAt) ?? 0)) : null} />}>
      <Alert tone="info" title="این صفحه متن پیام گزارش‌شده را نشان می‌دهد">
        <span data-testid="message-queue-note">
          سیاست حذف اطلاعات تماس پیش از بیعانه، الگوهای متداول را می‌گیرد و ادعای تشخیص کامل ندارد؛ هر
          اعمال آن در تاریخچه ثبت می‌شود و تصمیم نهایی با ناظر است.
        </span>
      </Alert>

      {queue.length === 0 ? (
        <div data-testid="message-queue-empty">
          <EmptyState title="گزارشی درباره پیام‌ها باز نیست" description="هر گزارشی که طرفین یک معامله درباره پیام ثبت کنند، اینجا می‌آید." />
        </div>
      ) : (
        <QueueFrame
          path="/market/messages"
          params={{ q: query.q || undefined, sort: query.sort === 'oldest' ? undefined : query.sort }}
          query={query}
          page={page}
          all={page.all}
          noun="گزارش"
          searchLabel="جست‌وجوی نام یا کد"
          testId="message-queue-frame"
        >
          {page.items.length === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را کوتاه‌تر کنید یا پاک کنید." />
          ) : (
            <CaseList label="پیام‌های گزارش‌شده" testId="message-queue">
              {page.items.map((entry) => (
                <CaseItem
                  key={entry.reportId}
                  type="گزارش پیام"
                  name={REASON_FA[entry.reason as ReportReason] ?? entry.reason}
                  sub={when(entry.createdAt)}
                  ageDays={ageInDays(entry.createdAt)}
                  status={keyStatus(entry.hiddenAt ? 'HIDDEN' : 'SUBMITTED')}
                  owner="SYSTEM"
                  ownerLabel="ناظر آگهی"
                  ownerIsUs
                >
                  <CaseDrawer title="پرونده گزارش پیام" testId={'open-message-' + entry.reportId}>
                    <DeskHead
                      title={REASON_FA[entry.reason as ReportReason] ?? entry.reason}
                      status={keyStatus(entry.hiddenAt ? 'HIDDEN' : 'SUBMITTED')}
                      meta={[when(entry.createdAt)]}
                    />
                    <Panel title="پیام گزارش‌شده">
                      <blockquote className="hz-card hz-card--subtle text-body-sm" data-testid={'message-body-' + entry.reportId}>
                        {entry.bodyFa ?? 'این پیام متنی ندارد (پیوست یا رویداد پیشنهاد قیمت).'}
                      </blockquote>
                      {entry.redactedNoteFa ? <p className="text-caption text-text-secondary">{entry.redactedNoteFa}</p> : null}
                      {entry.detailsFa ? (
                        <p className="text-caption text-text-secondary">توضیح گزارش‌دهنده: {entry.detailsFa}</p>
                      ) : null}
                      {entry.hiddenAt ? (
                        <p className="text-caption text-text-secondary" data-testid={'already-hidden-' + entry.reportId}>
                          این پیام پیش‌تر پنهان شده است.
                        </p>
                      ) : null}
                    </Panel>
                    <Panel title="تصمیم">
                      <MessageDecisionForm reportId={entry.reportId} />
                    </Panel>
                  </CaseDrawer>
                </CaseItem>
              ))}
            </CaseList>
          )}
        </QueueFrame>
      )}
    </OpsShell>
  );
}
