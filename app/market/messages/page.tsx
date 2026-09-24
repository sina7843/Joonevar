import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { messageReportQueue } from '../../../src/marketplace/listing-moderation.ts';
import { REASON_FA, type ReportReason } from '../../../src/moderation/model.ts';
import { MessageDecisionForm } from '../../../src/marketplace/moderation-forms.tsx';

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
export default async function MessageModerationPage() {
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

  return (
    <OpsShell actor={actor} title="گزارش پیام‌های گفت‌وگوی خرید" nav={marketNav(actor)} pathname="/market/messages">
      <div className="space-y-lg">
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
          <ul className="space-y-lg" data-testid="message-queue">
            {queue.map((entry) => (
              <li key={entry.reportId}>
                <Card>
                  <p className="text-caption text-text-secondary">
                    {REASON_FA[entry.reason as ReportReason] ?? entry.reason}
                    <span className="mx-sm text-text-disabled">|</span>
                    {when(entry.createdAt)}
                  </p>
                  <p className="mt-sm text-body-sm" data-testid={'message-body-' + entry.reportId}>
                    {entry.bodyFa ?? 'این پیام متنی ندارد (پیوست یا رویداد پیشنهاد قیمت).'}
                  </p>
                  {entry.redactedNoteFa ? (
                    <p className="mt-2xs text-caption text-text-secondary">{entry.redactedNoteFa}</p>
                  ) : null}
                  {entry.detailsFa ? (
                    <p className="mt-sm text-caption text-text-secondary">
                      توضیح گزارش‌دهنده: {entry.detailsFa}
                    </p>
                  ) : null}
                  {entry.hiddenAt ? (
                    <p className="mt-sm text-caption text-text-secondary" data-testid={'already-hidden-' + entry.reportId}>
                      این پیام پیش‌تر پنهان شده است.
                    </p>
                  ) : null}
                  <MessageDecisionForm reportId={entry.reportId} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
