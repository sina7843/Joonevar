import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Card } from '../../src/ui/card.tsx';

export const dynamic = 'force-dynamic';

/**
 * Association operations shell (§21.2, D11).
 *
 * A successful F14 membership never returns to a blocking approval queue (D04),
 * so membership is listed here as records to manage, not as a gate.
 */
const QUEUES = [
  { title: 'عضویت و اطلاعات عضو', note: 'مدیریت سوابق و شماره عضویت؛ بدون Gate فعال‌سازی' },
  { title: 'کنل', note: 'بررسی پرونده ثبت کنل' },
  { title: 'مجوز جفت‌گیری', note: 'بررسی و صدور مجوز پس از پرداخت' },
  { title: 'شجره‌نامه خارجی', note: 'بررسی بر اساس فهرست صادرکنندگان موردتأیید انجمن' },
];

export default async function AssocPage() {
  const guard = await guardRoute('/assoc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  return (
    <OpsShell actor={guard.actor} title="پنل انجمن" pathname="/assoc" nav={ASSOC_NAV}>
      <div className="space-y-md">
        {QUEUES.map((queue) => (
          <Card key={queue.title}>
            <h2 className="text-label-lg">{queue.title}</h2>
            <p className="mt-2xs text-caption text-text-secondary">{queue.note}</p>
            <div className="mt-md">
              <EmptyState title="پرونده‌ای در انتظار بررسی نیست" description="پرونده‌ها پس از ارسال توسط کاربر در همین صف دیده می‌شوند." />
            </div>
          </Card>
        ))}
      </div>
    </OpsShell>
  );
}
