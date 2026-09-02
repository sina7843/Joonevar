import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Identifier } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { sheetBatchesOfOwner, sheetsOfOwner } from '../../src/documents/registration-sheet.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/** Registration sheets: the requests in flight and the documents already issued. */
export default async function RegistrationPage() {
  const guard = await guardRoute('/registration');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [batches, sheets] = await Promise.all([
    sheetBatchesOfOwner(db(), guard.actor),
    sheetsOfOwner(db(), guard.actor),
  ]);

  return (
    <PublicShell actor={guard.actor} title="برگه ثبتی" pathname="/registration">
      <div className="space-y-lg">
        <ButtonLink href="/registration/new" block data-testid="start-sheet-request">
          درخواست صدور برگه ثبتی
        </ButtonLink>

        {sheets.length === 0 ? null : (
          <Card>
            <h2 className="text-label-lg">برگه‌های صادرشده</h2>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="issued-sheets">
              {sheets.map((sheet) => (
                <li key={sheet.id} className="flex items-center justify-between gap-md">
                  <Link
                    href={'/documents/' + sheet.id}
                    className="text-text-brand underline underline-offset-4"
                  >
                    <Identifier value={sheet.sheetNo} />
                  </Link>
                  <span className="text-text-secondary">
                    {formatCivilDateFa(sheet.issuedAt.toISOString().slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {batches.length === 0 ? (
          <EmptyState
            title="درخواستی ثبت نشده است"
            description="پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری، می‌توانید برای یک یا چند حیوان برگه ثبتی بگیرید."
          />
        ) : (
          <Card>
            <h2 className="text-label-lg">درخواست‌های صدور</h2>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="sheet-batches">
              {batches.map((batch) => (
                <li key={batch.id}>
                  <Link
                    href={'/registration/' + batch.id}
                    className="text-text-brand underline underline-offset-4"
                  >
                    درخواست {formatCivilDateFa(batch.createdAt.toISOString().slice(0, 10))}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
