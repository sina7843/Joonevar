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
import { ButtonLink } from '../../src/ui/button.tsx';
import { SelectPedigreeAnimals } from './forms.tsx';
import { PageHeader } from '../../src/ui/section-header.tsx';

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
      <PublicShell
        actor={actor}
        title="شجره‌نامه"
        pathname="/pedigree"
        header={<PageHeader title={'شجره‌نامه'} back={{ href: '/dashboard' }} />}
      >
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
    <PublicShell
      actor={actor}
      title="شجره‌نامه"
      pathname="/pedigree"
      header={<PageHeader title={'شجره‌نامه'} back={{ href: '/dashboard' }} />}
    >
      <div className="space-y-lg">
        <ButtonLink href="/pedigree/issue" block data-testid="open-issuance">
          صدور شجره‌نامه برای نتایج نهایی
        </ButtonLink>

        <Card>
          <div className="hz-section-header hz-section-header--sm">
            <h2 className="hz-section-header__title">
              <span className="hz-section-header__bar" aria-hidden="true" />
              <span>مرکز ژنتیک مقصد</span>
            </h2>
          </div>
          <p className="mt-md text-caption text-text-secondary">
            یک مرکز ثابت وجود دارد و انتخاب مرکز در محصول نیست؛ این اطلاعات فقط برای واریز مستقیم است.
          </p>
          {centre.configured ? (
            <dl className="hz-kv mt-lg" data-testid="centre-details">
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نام مرکز</dt>
                <dd className="hz-kv__value">{centre.nameFa}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">تلفن</dt>
                <dd className="hz-kv__value">{centre.phone ?? '—'}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">نشانی</dt>
                <dd className="hz-kv__value">{centre.addressFa ?? '—'}</dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">شماره حساب</dt>
                <dd className="hz-kv__value">
                  {centre.paymentAccount ? <Identifier value={centre.paymentAccount} /> : '—'}
                </dd>
              </div>
              <div className="hz-kv__row">
                <dt className="hz-kv__key">شماره کارت</dt>
                <dd className="hz-kv__value">{centre.paymentCard ? <Identifier value={centre.paymentCard} /> : '—'}</dd>
              </div>
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
            <div className="hz-section-header hz-section-header--sm">
              <h2 className="hz-section-header__title">
                <span className="hz-section-header__bar" aria-hidden="true" />
                <span>فیش‌های من</span>
              </h2>
            </div>
            <ul className="mt-md space-y-sm text-body-sm" data-testid="receipt-list">
              {receipts.map((receipt) => (
                <li key={receipt.id} className="flex items-center justify-between gap-md">
                  <Link href={'/pedigree/receipts/' + receipt.id} className="hz-link">
                    فیش {formatCivilDateFa(receipt.createdAt.toISOString().slice(0, 10))}
                  </Link>
                  <StatusBadge
                    tone={
                      receipt.status === 'APPROVED'
                        ? 'success'
                        : receipt.status === 'NEEDS_CORRECTION'
                          ? 'warning'
                          : 'info'
                    }
                  >
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
