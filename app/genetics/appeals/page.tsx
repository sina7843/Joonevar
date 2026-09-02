import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { APPEAL_STATUS_FA, appealQueue } from '../../../src/genetics/appeals.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Appeals waiting at the centre — §14.5, §21.3, D19.
 *
 * The appeal is answered here, in the same environment that recorded the
 * result. Nothing on this page changes ownership, a microchip or a permit.
 */
export default async function GeneticsAppealsPage() {
  const guard = await guardRoute('/genetics/appeals');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await appealQueue(db(), guard.actor);
  const animalRows = rows.length
    ? await db()
        .select({ id: animals.id, name: animals.name })
        .from(animals)
        .where(inArray(animals.id, rows.map((r) => r.animalId)))
    : [];

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname="/genetics/appeals" nav={GENETICS_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="اعتراض، اجازه ویرایش نتیجه نیست">
          نتیجه مورد اعتراض حفظ می‌شود؛ اگر اصلاح لازم باشد، نتیجه اصلاحی نسخه جدید است و سند صادرشده قبلی
          بازنویسی نمی‌شود.
        </Alert>

        {rows.length === 0 ? (
          <EmptyState
            title="اعتراضی در صف نیست"
            description="اعتراض‌های ثبت‌شده کاربران روی نتیجه Parentage در همین صف دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="appeal-queue">
            {rows.map((appeal) => (
              <li key={appeal.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="text-body-sm">
                        {animalRows.find((a) => a.id === appeal.animalId)?.name ?? 'بدون نام'}
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {formatCivilDateFa(appeal.createdAt.toISOString().slice(0, 10))}
                      </p>
                    </div>
                    <StatusBadge tone="info">{APPEAL_STATUS_FA[appeal.status]}</StatusBadge>
                  </div>
                  <p className="mt-lg text-body-sm">
                    <Link
                      href={'/genetics/appeals/' + appeal.id}
                      className="text-text-brand underline underline-offset-4"
                      data-testid="open-appeal"
                    >
                      بررسی اعتراض
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
