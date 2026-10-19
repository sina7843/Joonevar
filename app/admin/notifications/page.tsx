import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ADMIN_NAV } from '../../../src/ui/shell.tsx';
import { Panel, StatTiles } from '../../../src/ui/desk.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
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
      <div className="flex flex-wrap items-center gap-sm">
        {/* GAPS #4: no dictionary key for the SMS channel switch. */}
        <StatusBadge tone={policy.smsEnabled ? 'success' : 'neutral'}>{policy.smsEnabled ? 'پیامک روشن' : 'پیامک خاموش'}</StatusBadge>
        <p className="hz-page-header__meta">
          <span className="hz-page-header__meta-item">
            اعلان در همان تراکنش تصمیم ثبت می‌شود و ارسال بیرون از آن انجام می‌گیرد؛ خطای ارائه‌دهنده هیچ تصمیمی را برنمی‌گرداند.
          </span>
        </p>
      </div>
      {!policy.smsEnabled ? (
        <Alert tone="info" title="کانال پیامک خاموش است">
          <span data-testid="outbox-channel-off">
            تا روشن‌شدن آن در تنظیمات، اعلان‌ها فقط در خود سامانه ثبت می‌شوند و هیچ پیامی در صف ارسال نمی‌نشیند.
          </span>
        </Alert>
      ) : null}

      <section className="space-y-md" aria-labelledby="outbox-title" data-testid="outbox-standing">
        <SectionHeader title="صف ارسال اعلان‌ها" size="sm" id="outbox-title" />
        <StatTiles
          tiles={[
            {
              label: 'در صف',
              value: standing.pending,
              sub: standing.oldestPendingAt ? 'قدیمی‌ترین: ' + formatInstantFa(standing.oldestPendingAt) : 'قدیمی‌ترین در صف: —',
            },
            { label: 'رسیده به موعد', value: standing.due },
            { label: 'ارسال‌شده', value: standing.sent, sub: 'صرف‌نظرشده: ' + fa(standing.suppressed) },
            {
              label: 'ناموفق',
              value: standing.failed,
              alert: standing.failed > 0 ? 'پس از آخرین تلاش، شاهد باقی می‌ماند' : undefined,
            },
          ]}
        />
        <p className="text-caption text-text-secondary">
          {'هر پیام ناموفق تا ' +
            fa(policy.maxAttempts) +
            ' بار با فاصله فزاینده (از ' +
            fa(policy.firstRetrySeconds) +
            ' ثانیه) دوباره تلاش می‌شود و پس از آن به‌عنوان شاهد باقی می‌ماند.'}
        </p>
      </section>

      <Panel title="متن‌های تأییدشده" count={fa(NOTIFICATION_TEMPLATES.length)} aside={'نسخه ' + TEMPLATE_VERSION}>
        <p className="text-body-sm text-text-secondary">
          متن پیامک از این فهرست خوانده می‌شود و هیچ مقداری از پرونده در آن قرار نمی‌گیرد؛ به همین دلیل کد ملی، شماره سند، مبلغ و دلیل بررسی هرگز از سامانه بیرون نمی‌رود.
        </p>
        <ul data-testid="outbox-templates">
          {NOTIFICATION_TEMPLATES.map((template) => (
            <li key={template.kind} className="hz-setting hz-setting--text">
              <div className="hz-setting__label">
                <bdi className="hz-setting__key" dir="ltr">
                  {template.kind}
                </bdi>
                <span className="hz-setting__hint text-body-sm text-text-primary">{template.smsFa}</span>
              </div>
              <div className="hz-setting__end">
                <span className="hz-tag hz-tag--neutral">{template.channels.join(' · ')}</span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </OpsShell>
  );
}
