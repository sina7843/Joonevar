import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { ownerRequest } from '../../../src/vets/visits.ts';
import {
  CONTACT_FOR_PRICE_FA,
  CONTEXT_FA,
  REFERRAL_STATUS_FA,
  REQUEST_STATUS_FA,
  SERVICE_TYPE_FA,
} from '../../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { RenewReferralForm } from './renew-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * One request, one code — §11.2, §26.
 *
 * The code is shown as one value: the QR a clinic scans and the characters a
 * clinic types are two renderings of it, not two identifiers. The deadline
 * printed here is the one stored on the code, which is the same one the server
 * enforces at check-in.
 */
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ renewed?: string }>;
}) {
  const { id } = await params;
  const { renewed } = await searchParams;
  const guard = await guardRoute('/requests/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let view;
  try {
    view = await ownerRequest(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const { request, referral, expired } = view;
  const usable = referral !== null && referral.status === 'ACTIVE' && !expired;

  return (
    <PublicShell actor={guard.actor} title="پرونده مراجعه" pathname={'/requests/' + id}>
      <div className="space-y-lg">
        {renewed === '1' ? (
          <Alert tone="success" title="کد مراجعه جدید صادر شد">
            مهلت تازه روی همین پرونده ثبت شد و سابقه کد قبلی حفظ شده است.
          </Alert>
        ) : null}
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{SERVICE_TYPE_FA[request.serviceType]}</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {CONTEXT_FA[request.context]} · {view.animalName ?? 'بدون نام'}
              </p>
            </div>
            <StatusBadge
              tone={request.status === 'CHECKED_IN' ? 'success' : request.status === 'ACTIVE' ? 'info' : 'neutral'}
            >
              <span data-testid="request-status">{REQUEST_STATUS_FA[request.status]}</span>
            </StatusBadge>
          </div>
          <p className="mt-md text-body-sm">
            {view.vetNameFa} · {view.locationNameFa}
          </p>
          <p className="mt-2xs text-caption text-text-secondary">{CONTACT_FOR_PRICE_FA}</p>
        </Card>

        {referral === null ? null : (
          <Card>
            <h3 className="text-label-lg">کد مراجعه</h3>
            <p className="mt-md text-h4" data-testid="referral-code">
              <Identifier value={referral.code} />
            </p>
            <p className="mt-sm text-caption text-text-secondary">
              QR و ورود دستی دو نمایش از همین یک کد هستند؛ کد دومی وجود ندارد.
            </p>
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm">
              <dt className="text-text-secondary">وضعیت کد</dt>
              <dd data-testid="referral-status">
                {expired && referral.status === 'ACTIVE' ? 'منقضی' : REFERRAL_STATUS_FA[referral.status]}
              </dd>
              <dt className="text-text-secondary">مهلت مراجعه تا</dt>
              <dd data-testid="referral-expiry">
                {formatCivilDateFa(referral.expiresAt.toISOString().slice(0, 10))}
              </dd>
              <dt className="text-text-secondary">مدت اعتبار این کد</dt>
              <dd>{referral.validityDays} روز</dd>
            </dl>

            {usable ? null : (
              <div className="mt-lg space-y-lg">
                <Alert
                  tone="warning"
                  title={
                    expired
                      ? 'مهلت این کد گذشته است'
                      : 'این کد دیگر قابل استفاده نیست'
                  }
                >
                  {referral.endedReasonFa ??
                    'سابقه کد قبلی حفظ می‌شود؛ در صورت نیاز می‌توانید کد جدید بگیرید و صلاحیت دامپزشک و مرکز دوباره بررسی می‌شود.'}
                </Alert>
                {expired && request.status === 'ACTIVE' ? <RenewReferralForm requestId={request.id} /> : null}
              </div>
            )}
          </Card>
        )}

        {request.status === 'SUPERSEDED' && request.supersededByRequestId ? (
          <Card>
            <h3 className="text-label-lg">این درخواست جایگزین شده است</h3>
            <p className="mt-md text-body-sm">{request.supersedeReasonFa}</p>
            <p className="mt-md text-body-sm">
              <Link
                href={'/requests/' + request.supersededByRequestId}
                className="text-text-brand underline underline-offset-4"
                data-testid="replacement-link"
              >
                مشاهده درخواست جدید همین حیوان
              </Link>
            </p>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
