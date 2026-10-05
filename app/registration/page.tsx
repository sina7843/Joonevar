import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Identifier } from '../../src/ui/status.tsx';
import { PageHeader, SectionHeader } from '../../src/ui/section-header.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import { db } from '../../src/db/client.ts';
import { sheetBatchesOfOwner, sheetsOfOwner } from '../../src/documents/registration-sheet.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

const dateFa = (at: Date) => formatCivilDateFa(at.toISOString().slice(0, 10));

/** Registration sheets (P05): the requests in flight and the documents already issued. */
export default async function RegistrationPage() {
  const guard = await guardRoute('/registration');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [batches, sheets] = await Promise.all([
    sheetBatchesOfOwner(db(), guard.actor),
    sheetsOfOwner(db(), guard.actor),
  ]);

  return (
    <PublicShell
      actor={guard.actor}
      title="برگه ثبتی"
      pathname="/registration"
      header={
        <PageHeader
          title="برگه ثبتی"
          meta={[
            sheets.length.toLocaleString('fa-IR') + ' برگه صادرشده',
            batches.length.toLocaleString('fa-IR') + ' درخواست',
          ]}
          actions={
            <ButtonLink href="/registration/new" iconStart="plus" data-testid="start-sheet-request">
              درخواست صدور برگه ثبتی
            </ButtonLink>
          }
        />
      }
    >
      {sheets.length === 0 ? null : (
        <section aria-labelledby="issued-heading" className="space-y-lg">
          <SectionHeader id="issued-heading" title="برگه‌های صادرشده" />
          <ul className="grid gap-lg md:grid-cols-2 lg:grid-cols-3" data-testid="issued-sheets">
            {sheets.map((sheet) => (
              <li key={sheet.id} className="hz-card hz-document">
                <div className="hz-document__head">
                  <span className="hz-document__icon">
                    <Icon name="fileText" size="md" />
                  </span>
                  <div className="hz-document__titles">
                    <h3 className="hz-document__type">برگه ثبتی</h3>
                    <span className="hz-document__subject">صادرشده در {dateFa(sheet.issuedAt)}</span>
                  </div>
                </div>
                <div className="hz-card__footer">
                  <Link href={'/documents/' + sheet.id} className="hz-link hz-link--standalone">
                    <Identifier value={sheet.sheetNo} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {batches.length === 0 ? (
        <EmptyState
          title="درخواستی ثبت نشده است"
          description="پس از کاشت یا تأیید میکروچیپ و نمونه‌گیری، می‌توانید برای یک یا چند حیوان برگه ثبتی بگیرید."
        />
      ) : (
        <Card>
          <SectionHeader size="sm" title="درخواست‌های صدور" />
          <ul className="mt-md divide-y divide-border-subtle" data-testid="sheet-batches">
            {batches.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between gap-md py-md">
                <Link href={'/registration/' + batch.id} className="hz-link">
                  درخواست {dateFa(batch.createdAt)}
                </Link>
                <Icon name="caretRight" size="sm" mirror />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PublicShell>
  );
}
