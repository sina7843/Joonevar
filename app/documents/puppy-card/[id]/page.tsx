import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { cardForOwner, CARD_DISTINCTION_NOTE_FA } from '../../../../src/mating/allocation.ts';
import { PUPPY_STATUS_FA } from '../../../../src/mating/birth.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { PageHeader } from '../../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

/**
 * One Puppy Card — §19.4, D16.
 *
 * It is readable by the owner it was issued to and by nobody else, and it says
 * plainly that it is not a registration sheet, a pedigree or a genetic result.
 */
export default async function PuppyCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/documents/puppy-card/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let view;
  try {
    view = await cardForOwner(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  return (
    <PublicShell
      actor={guard.actor}
      title="کارت توله"
      pathname={'/documents/puppy-card/' + id}
      header={<PageHeader title={'کارت توله'} back={{ href: '/dashboard' }} />}
    >
      <div className="space-y-lg">
        <Card>
          <div className="hz-section-header hz-section-header--sm">
            <h2 className="hz-section-header__title">
              <span className="hz-section-header__bar" aria-hidden="true" />
              <span>کارت توله</span>
            </h2>
          </div>
          <div className="mt-lg" data-testid="card-no">
            <Identifier label="شماره کارت" value={view.card.cardNo} />
          </div>
          <dl className="hz-kv mt-lg" data-testid="card-detail">
            <div className="hz-kv__row">
              <dt className="hz-kv__key">کد موقت توله</dt>
              <dd className="hz-kv__value">{view.puppy.tempCode}</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">نام</dt>
              <dd className="hz-kv__value">{view.puppy.nameFa ?? 'بدون نام'}</dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">وضعیت توله</dt>
              <dd className="hz-kv__value" data-testid="card-puppy-status">
                {PUPPY_STATUS_FA[view.puppy.status] ?? view.puppy.status}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">نسخه تخصیص</dt>
              <dd className="hz-kv__value" data-testid="card-allocation-version">
                {view.card.allocationVersion}
              </dd>
            </div>
            <div className="hz-kv__row">
              <dt className="hz-kv__key">تاریخ صدور</dt>
              <dd className="hz-kv__value">{formatCivilDateFa(view.card.issuedAt.toISOString().slice(0, 10))}</dd>
            </div>
          </dl>
          <Alert tone="info" title="این سند چه چیزی نیست">
            <span data-testid="card-distinction">{CARD_DISTINCTION_NOTE_FA}</span>
          </Alert>
          <p className="mt-lg text-caption text-text-secondary" data-testid="card-print-note">
            قالب چاپی رسمی این کارت هنوز تحویل نشده است؛ خروجی PDF زیر، چاپ همین داده‌های ثبت‌شده در سامانه است.
          </p>
          <p className="mt-md text-body-sm">
            <a href={'/api/documents/puppy-card/' + id + '/pdf'} className="hz-link" data-testid="download-pdf">
              دریافت نسخه PDF این سند
            </a>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
