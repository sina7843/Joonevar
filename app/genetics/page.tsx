import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, GENETICS_NAV } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { geneticsQueues } from '../../src/operations/service.ts';
import { readSetting } from '../../src/settings/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Genetics centre operations — §21.3, D07, D11.
 *
 * The counts are real, and the centre's own details come from managed data: an
 * unset value is shown as unset rather than filled in with an invented one.
 */
export default async function GeneticsPage() {
  const guard = await guardRoute('/genetics');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [queues, centreName] = await Promise.all([
    geneticsQueues(db(), guard.actor),
    readSetting(db(), 'genetics_centre.name'),
  ]);

  return (
    <OpsShell actor={guard.actor} title="پنل مرکز ژنتیک" pathname="/genetics" nav={GENETICS_NAV}>
      <div className="space-y-md">
        <Alert tone="info" title="مرکز نمونه‌گیری نمی‌کند">
          <span data-testid="centre-name">
            {centreName.value === null
              ? 'مشخصات مرکز هنوز در تنظیمات مدیریتی وارد نشده است و «تعیین‌نشده» می‌ماند.'
              : 'مرکز ثابت: ' + String(centreName.value)}
          </span>
        </Alert>
        <ul className="space-y-md" data-testid="genetics-queues">
          {queues.map((queue) => (
            <li key={queue.key}>
              <Card>
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="text-label-lg">{queue.titleFa}</h2>
                    <p className="mt-2xs text-caption text-text-secondary">{queue.noteFa}</p>
                  </div>
                  <StatusBadge tone={queue.waiting > 0 ? 'warning' : 'neutral'}>
                    <span data-testid={'genetics-count-' + queue.key}>{queue.waiting}</span>
                  </StatusBadge>
                </div>
                <p className="mt-lg text-body-sm">
                  <Link
                    href={queue.href}
                    className="text-text-brand underline underline-offset-4"
                    data-testid={'open-genetics-' + queue.key}
                  >
                    باز کردن صف
                  </Link>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </OpsShell>
  );
}
