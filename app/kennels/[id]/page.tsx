import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { readMoney } from '../../../src/settings/service.ts';
import { formatTomanFa } from '../../../src/domain/money.ts';
import {
  breedsOfKennel,
  kennelBatch,
  KENNEL_FEE_KEY,
  KENNEL_STATUS_FA,
  requireOwnKennel,
  searchBreeds,
  submitReadiness,
} from '../../../src/kennels/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { KennelBreeds, KennelForm, PayKennelForm, SubmitKennelForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * One kennel — §15.2, §15.3.
 *
 * The same page carries the registration steps and, once approved, the kennel
 * profile: name, status, location and breeds. Editing breeds afterwards is an
 * ordinary recorded change, not a new payment or a second review.
 */
export default async function KennelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/kennels/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let kennel;
  try {
    kennel = await requireOwnKennel(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const [breeds, options, readiness, batch, fee] = await Promise.all([
    breedsOfKennel(db(), kennel.id),
    searchBreeds(db(), null, 200),
    submitReadiness(db(), kennel),
    kennelBatch(db(), kennel),
    readMoney(db(), KENNEL_FEE_KEY),
  ]);
  const feeLabel = formatTomanFa(fee);

  const editable = kennel.status === 'DRAFT' || kennel.status === 'NEEDS_CORRECTION';
  const breedsEditable = kennel.status !== 'UNDER_REVIEW' && kennel.status !== 'REJECTED';
  const needsPayment = editable && batch?.status !== 'PAID';
  const canSubmit = kennel.status === 'READY_TO_SUBMIT' || (kennel.status === 'NEEDS_CORRECTION' && batch?.status === 'PAID');

  return (
    <PublicShell actor={guard.actor} title="پرونده کنل" pathname={'/kennels/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{kennel.nameFa ?? 'کنل بدون نام'}</h2>
              <p className="mt-2xs text-caption text-text-secondary" data-testid="kennel-location">
                {[kennel.provinceFa, kennel.cityFa].filter(Boolean).join(' · ') || 'نشانی ثبت نشده'}
                {kennel.addressFa ? ' — ' + kennel.addressFa : ''}
              </p>
              {kennel.approvedAt ? (
                <p className="mt-2xs text-caption text-text-secondary">
                  تأیید در {formatCivilDateFa(kennel.approvedAt.toISOString().slice(0, 10))}
                </p>
              ) : null}
            </div>
            <StatusBadge
              tone={
                kennel.status === 'APPROVED'
                  ? 'success'
                  : kennel.status === 'NEEDS_CORRECTION' || kennel.status === 'REJECTED'
                    ? 'warning'
                    : 'info'
              }
            >
              <span data-testid="kennel-status">{KENNEL_STATUS_FA[kennel.status]}</span>
            </StatusBadge>
          </div>

          {kennel.reasonFa ? (
            <p className="mt-lg text-body-sm" data-testid="kennel-reason">
              {kennel.reasonFa}
            </p>
          ) : null}
          {kennel.status === 'NEEDS_CORRECTION' ? (
            <p className="mt-sm text-caption text-text-secondary">
              اطلاعات واردشده و پرداخت انجام‌شده حفظ شده است؛ همین پرونده را اصلاح و دوباره ارسال کنید.
            </p>
          ) : null}
          {kennel.status === 'APPROVED' ? (
            <Alert tone="success" title="نقش پرورش‌دهنده فعال است">
              <span data-testid="breeder-active-note">
                از تغییر نقش در بالای صفحه می‌توانید به محیط پرورش‌دهنده بروید. تغییر نژادها از همین صفحه انجام
                می‌شود و پرداخت یا بررسی دوباره ندارد.
              </span>
            </Alert>
          ) : null}
        </Card>

        {editable ? (
          <KennelForm
            kennel={{
              id: kennel.id,
              nameFa: kennel.nameFa,
              nameEn: kennel.nameEn,
              phone: kennel.phone,
              provinceFa: kennel.provinceFa,
              cityFa: kennel.cityFa,
              addressFa: kennel.addressFa,
              latitude: kennel.latitude,
              longitude: kennel.longitude,
              noteFa: kennel.noteFa,
            }}
          />
        ) : null}

        <KennelBreeds
          kennelId={kennel.id}
          selected={breeds.map((row) => ({ breedId: row.breedId, nameFa: row.nameFa, nameEn: row.nameEn }))}
          options={options.map((row) => ({ id: row.id, nameFa: row.nameFa, nameEn: row.nameEn }))}
          editable={breedsEditable}
        />

        {needsPayment ? (
          <Card>
            <h2 className="text-label-lg">مرور و پرداخت</h2>
            <p className="mt-md text-body-sm">
              هزینه ثبت کنل:{' '}
              <span data-testid="kennel-fee">{feeLabel ?? 'تعیین‌نشده'}</span>
            </p>
            {feeLabel === null ? (
              <Alert tone="warning" title="تعرفه ثبت کنل هنوز ثبت نشده است">
                <span data-testid="kennel-fee-not-configured">
                  تا ورود مقدار واقعی از پنل مدیریت، مسیر پرداخت باز نمی‌شود و هیچ مبلغی فرض نمی‌شود.
                </span>
              </Alert>
            ) : readiness.ready ? (
              <PayKennelForm kennelId={kennel.id} batchId={batch?.id ?? null} />
            ) : (
              <Alert tone="warning" title="برای پرداخت و ارسال، اطلاعات کامل نیست">
                <span data-testid="kennel-not-ready">{readiness.reasonFa}</span>
              </Alert>
            )}
          </Card>
        ) : null}

        {canSubmit ? (
          <Card>
            <h2 className="text-label-lg">ارسال برای بررسی انجمن</h2>
            <p className="mt-md text-caption text-text-secondary">
              پرداخت این پرونده تأیید شده است. ارسال، پرونده را در صف بررسی انجمن قرار می‌دهد.
            </p>
            {readiness.ready ? (
              <SubmitKennelForm kennelId={kennel.id} />
            ) : (
              <Alert tone="warning" title="اطلاعات کامل نیست">
                <span data-testid="kennel-submit-blocked">{readiness.reasonFa}</span>
              </Alert>
            )}
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
