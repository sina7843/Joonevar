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

export const dynamic = 'force-dynamic';

/**
 * One Puppy Card — §19.4, D16.
 *
 * It is readable by the owner it was issued to and by nobody else, and it says
 * plainly that it is not a registration sheet, a pedigree or a genetic result.
 */
export default async function PuppyCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    <PublicShell actor={guard.actor} title="کارت توله" pathname={'/documents/puppy-card/' + id}>
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">کارت توله</h2>
          <div className="mt-lg" data-testid="card-no">
            <Identifier label="شماره کارت" value={view.card.cardNo} />
          </div>
          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="card-detail">
            <dt className="text-text-secondary">کد موقت توله</dt>
            <dd>{view.puppy.tempCode}</dd>
            <dt className="text-text-secondary">نام</dt>
            <dd>{view.puppy.nameFa ?? 'بدون نام'}</dd>
            <dt className="text-text-secondary">وضعیت توله</dt>
            <dd data-testid="card-puppy-status">{PUPPY_STATUS_FA[view.puppy.status] ?? view.puppy.status}</dd>
            <dt className="text-text-secondary">نسخه تخصیص</dt>
            <dd data-testid="card-allocation-version">{view.card.allocationVersion}</dd>
            <dt className="text-text-secondary">تاریخ صدور</dt>
            <dd>{formatCivilDateFa(view.card.issuedAt.toISOString().slice(0, 10))}</dd>
          </dl>
          <Alert tone="info" title="این سند چه چیزی نیست">
            <span data-testid="card-distinction">{CARD_DISTINCTION_NOTE_FA}</span>
          </Alert>
          <p className="mt-lg text-caption text-text-secondary" data-testid="card-print-note">
            نسخه چاپی رسمی این کارت هنوز پیکربندی نشده است و تا آن زمان همین نمایش، سند داخل سامانه است.
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
