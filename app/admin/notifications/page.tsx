import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Card, CardHeader } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { channelPolicy, outboxStanding } from '../../../src/notifications/outbox.ts';
import { NOTIFICATION_TEMPLATES, TEMPLATE_VERSION } from '../../../src/notifications/templates.ts';
import { formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * What the outbox is doing — Phase 2.5 §10 (PROMPT-015).
 *
 * An operator who is answerable for messages leaving the product needs to see
 * three things: whether the channel is on, what is waiting, and what failed.
 * This is read-only: a message is not re-sent from a dashboard by hand, it is
 * re-queued by the operator who understands why it failed.
 */
export default async function AdminNotificationsPage() {
  const guard = await guardRoute('/admin/notifications');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [standing, policy] = await Promise.all([outboxStanding(db()), channelPolicy(db())]);

  return (
    <OpsShell actor={guard.actor} title="اعلان‌ها و پیامک" pathname="/admin/notifications" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Card>
          <CardHeader
            title="صف ارسال اعلان‌ها"
            subtitle="اعلان در همان تراکنش تصمیم ثبت می‌شود و ارسال بیرون از آن انجام می‌گیرد؛ خطای ارائه‌دهنده هیچ تصمیمی را برنمی‌گرداند."
            badge={policy.smsEnabled ? { tone: 'success', label: 'پیامک روشن' } : { tone: 'neutral', label: 'پیامک خاموش' }}
          />
          {!policy.smsEnabled ? (
            <div className="mt-md">
              <Alert tone="info" title="کانال پیامک خاموش است">
                <span data-testid="outbox-channel-off">
                  تا روشن‌شدن آن در تنظیمات، اعلان‌ها فقط در خود سامانه ثبت می‌شوند و هیچ پیامی در صف ارسال نمی‌نشیند.
                </span>
              </Alert>
            </div>
          ) : null}
          <dl className="mt-lg grid gap-md text-body-sm sm:grid-cols-3" data-testid="outbox-standing">
            <div>
              <dt className="text-caption text-text-secondary">در صف</dt>
              <dd className="text-h5">{fa(standing.pending)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">رسیده به موعد</dt>
              <dd className="text-h5">{fa(standing.due)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">ارسال‌شده</dt>
              <dd className="text-h5">{fa(standing.sent)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">ناموفق</dt>
              <dd className="text-h5">{fa(standing.failed)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">صرف‌نظرشده</dt>
              <dd className="text-h5">{fa(standing.suppressed)}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">قدیمی‌ترین در صف</dt>
              <dd className="text-body-md">{standing.oldestPendingAt ? formatInstantFa(standing.oldestPendingAt) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-md text-caption text-text-secondary">
            {'هر پیام ناموفق تا ' +
              fa(policy.maxAttempts) +
              ' بار با فاصله فزاینده (از ' +
              fa(policy.firstRetrySeconds) +
              ' ثانیه) دوباره تلاش می‌شود و پس از آن به‌عنوان شاهد باقی می‌ماند.'}
          </p>
        </Card>

        <Card>
          <CardHeader title="متن‌های تأییدشده" subtitle={'نسخه ' + TEMPLATE_VERSION} />
          <p className="mt-md text-body-sm text-text-secondary">
            متن پیامک از این فهرست خوانده می‌شود و هیچ مقداری از پرونده در آن قرار نمی‌گیرد؛ به همین دلیل کد ملی، شماره سند، مبلغ و دلیل بررسی هرگز از سامانه بیرون نمی‌رود.
          </p>
          <ul className="mt-lg space-y-sm" data-testid="outbox-templates">
            {NOTIFICATION_TEMPLATES.map((template) => (
              <li key={template.kind} className="rounded-md border border-border-subtle p-md">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <span dir="ltr" className="text-caption text-text-secondary">
                    {template.kind}
                  </span>
                  <StatusBadge tone="neutral">{template.channels.join(' · ')}</StatusBadge>
                </div>
                <p className="mt-xs text-body-sm">{template.smsFa}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </OpsShell>
  );
}
