import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { postalRequestQueue } from '../../../src/operations/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

const DOCUMENT_FA: Record<string, string> = {
  REGISTRATION_SHEET: 'برگه ثبتی',
  PEDIGREE: 'شجره‌نامه',
};

/**
 * Postal requests — §14, D17.
 *
 * The scope is the request itself. There is no dispatch, no tracking number and
 * no delivery state in this product, and this screen does not invent one.
 */
export default async function AssocPostalPage() {
  const guard = await guardRoute('/assoc/postal');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await postalRequestQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="درخواست‌های پستی" pathname="/assoc/postal" nav={ASSOC_NAV}>
      <Alert tone="info" title="این فهرست فقط ثبت درخواست است">
        <span data-testid="postal-scope-note">
          چرخه ارسال، کد رهگیری پستی و وضعیت تحویل در این فاز وجود ندارد و ساخته نشده است.
        </span>
      </Alert>

      {rows.length === 0 ? (
        <EmptyState
          title="درخواست پستی ثبت نشده است"
          description="پس از ثبت درخواست پستی توسط مالک سند، در همین فهرست دیده می‌شود."
        />
      ) : (
        <>
          <QueueMeta total={rows.length} noun="درخواست ثبت‌شده" />
          <CaseList label="درخواست‌های پستی" testId="postal-list">
            {rows.map((row) => (
              <CaseItem
                key={row.id}
                type={DOCUMENT_FA[row.documentType] ?? row.documentType}
                name={row.recipientNameFa}
                sub={(row.cityFa ?? '—') + ' · ' + formatCivilDateFa(row.createdAt.toISOString().slice(0, 10))}
                ageDays={ageInDays(row.createdAt)}
              />
            ))}
          </CaseList>
        </>
      )}
    </OpsShell>
  );
}
