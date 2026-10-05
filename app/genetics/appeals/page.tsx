import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
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
    <OpsShell actor={guard.actor} title="اعتراض‌ها" pathname="/genetics/appeals" nav={GENETICS_NAV}>
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
        <>
          <QueueMeta total={rows.length} noun="اعتراض در صف" oldestDays={Math.max(...rows.map((appeal) => ageInDays(appeal.createdAt) ?? 0))} />
          <CaseList label="صف اعتراض‌ها" testId="appeal-queue">
            {rows.map((appeal) => (
              <CaseItem
                key={appeal.id}
                type="اعتراض به نتیجه"
                name={animalRows.find((a) => a.id === appeal.animalId)?.name ?? 'بدون نام'}
                href={'/genetics/appeals/' + appeal.id}
                linkLabel="بررسی اعتراض"
                linkTestId="open-appeal"
                sub={'ثبت: ' + formatCivilDateFa(appeal.createdAt.toISOString().slice(0, 10))}
                ageDays={ageInDays(appeal.createdAt)}
                status={{ tone: 'info', label: APPEAL_STATUS_FA[appeal.status] }}
                owner="GENETICS_CENTRE"
                ownerIsUs
              />
            ))}
          </CaseList>
        </>
      )}
    </OpsShell>
  );
}
