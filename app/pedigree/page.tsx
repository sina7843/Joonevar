import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { LockedServiceCard, Card } from '../../src/ui/card.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Identifier, StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { eligibilityFor } from '../../src/domain/eligibility/service.ts';
import {
  centreDetails,
  RECEIPT_STATUS_FA,
  receiptsOfOwner,
  selectableForPedigree,
} from '../../src/genetics/service.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';
import { SelectPedigreeAnimals } from './forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The ordinary pedigree route — §14.1, §14.2, D07.
 *
 * One fixed centre is displayed as information, never as a choice, and its
 * payment details are shown only when they have really been entered. The
 * sample and its custodian are the ones already on record.
 */
export default async function PedigreePage() {
  const guard = await guardRoute('/pedigree');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const eligibility = await eligibilityFor(db(), actor.accountId, 'PEDIGREE');
  if (!eligibility.allowed) {
    return (
      <PublicShell actor={actor} title="شجره‌نامه" pathname="/pedigree">
        <LockedServiceCard serviceLabel="صدور شجره‌نامه" lock={eligibility.lock} />
      </PublicShell>
    );
  }

  const [animals, centre, receipts] = await Promise.all([
    selectableForPedigree(db(), actor),
    centreDetails(db()),
    receiptsOfOwner(db(), actor),
  ]);

  return (
    <PublicShell actor={actor} title="شجره‌نامه" pathname="/pedigree">
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">مرکز ژنتیک مقصد</h2>
          <p className="mt-md text-caption text-text-secondary">
            یک مرکز ثابت وجود دارد و انتخاب مرکز در محصول نیست؛ این اطلاعات فقط برای واریز مستقیم است.
          </p>
          {centre.configured ? (
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="centre-details">
              <dt className="text-text-secondary">نام مرکز</dt>
              <dd>{centre.nameFa}</dd>
              <dt className="text-text-secondary">تلفن</dt>
              <dd>{centre.phone ?? '—'}</dd>
              <dt className="text-text-secondary">نشانی</dt>
              <dd>{centre.addressFa ?? '—'}</dd>
              <dt className="text-text-secondary">شماره حساب</dt>
              <dd>{centre.paymentAccount ? <Identifier value={centre.paymentAccount} /> : '—'}</dd>
              <dt className="text-text-secondary">شماره کارت</dt>
              <dd>{centre.paymentCard ? <Identifier value={centre.paymentCard} /> : '—'}</dd>
            </dl>
          ) : (
            <Alert tone="warning" title="اطلاعات پرداخت مرکز هنوز ثبت نشده است">
              <span data-testid="centre-not-configured">
                تا ورود داده واقعی از پنل مدیریت، ثبت فیش ممکن نیست و هیچ شماره حساب یا کارتی فرض نمی‌شود.
              </span>
            </Alert>
          )}
        </Card>

        {receipts.length === 0 ? null : (
          <Card>
            <h2 className="text-label-lg">فیش‌های من</h2>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="receipt-list">
              {receipts.map((receipt) => (
                <li key={receipt.id} className="flex items-center justify-between gap-md">
                  <Link
                    href={'/pedigree/receipts/' + receipt.id}
                    className="text-text-brand underline underline-offset-4"
                  >
                    فیش {formatCivilDateFa(receipt.createdAt.toISOString().slice(0, 10))}
                  </Link>
                  <StatusBadge tone={receipt.status === 'APPROVED' ? 'success' : receipt.status === 'NEEDS_CORRECTION' ? 'warning' : 'info'}>
                    {RECEIPT_STATUS_FA[receipt.status]}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {animals.length === 0 ? (
          <EmptyState
            title="حیوانی در این مسیر نیست"
            description="حیوان‌هایی که برگه ثبتی و نمونه قابل استفاده دارند در این فهرست می‌آیند."
          />
        ) : (
          <SelectPedigreeAnimals
            animals={animals.map((a) => ({
              animalId: a.animalId,
              name: a.name,
              ready: a.ready,
              sampleTrackingCode: a.sampleTrackingCode,
              reasonFa: a.reasonFa,
            }))}
            centreConfigured={centre.configured}
          />
        )}
      </div>
    </PublicShell>
  );
}
