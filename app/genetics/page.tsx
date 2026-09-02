import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, GENETICS_NAV } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Card } from '../../src/ui/card.tsx';
import { Alert } from '../../src/ui/alert.tsx';

export const dynamic = 'force-dynamic';

/**
 * Genetics centre operations shell (§21.3, D07, D11).
 *
 * One fixed centre; the centre does not collect samples and cannot change
 * ownership, microchip or permit status from this panel.
 */
const QUEUES = [
  { title: 'فیش‌های منتظر بررسی', note: 'تأیید فیش، دستور ارسال به همان دامپزشک نگهدارنده را صادر می‌کند' },
  { title: 'نمونه‌های در انتظار رسیدن', note: 'نمونه‌ها توسط دامپزشک نگهدارنده ارسال می‌شوند' },
  { title: 'در حال پردازش', note: 'اعتبارسنجی، پردازش و تأیید فنی' },
  { title: 'در انتظار نتایج والدین', note: 'برای G1+ نتیجه کامل هر دو والد لازم است' },
];

export default async function GeneticsPage() {
  const guard = await guardRoute('/genetics');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  return (
    <OpsShell actor={guard.actor} title="پنل مرکز ژنتیک" pathname="/genetics" nav={GENETICS_NAV}>
      <div className="space-y-md">
        <Alert tone="info" title="مرکز نمونه‌گیری نمی‌کند">
          نمونه توسط دامپزشک معتمد گرفته و نگهداری می‌شود. مشخصات مرکز از تنظیمات مدیریتی خوانده می‌شود و تا ورود
          داده واقعی «تعیین‌نشده» است.
        </Alert>
        {QUEUES.map((queue) => (
          <Card key={queue.title}>
            <h2 className="text-label-lg">{queue.title}</h2>
            <p className="mt-2xs text-caption text-text-secondary">{queue.note}</p>
            <div className="mt-md">
              <EmptyState title="موردی وجود ندارد" description="با شروع مسیر شجره‌نامه، پرونده‌ها در همین صف ظاهر می‌شوند." />
            </div>
          </Card>
        ))}
      </div>
    </OpsShell>
  );
}
