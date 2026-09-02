import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetRequestDetail } from '../../../../src/vets/visits.ts';
import {
  CONTEXT_FA,
  REQUEST_STATUS_FA,
  SERVICES_BY_CONTEXT,
  SERVICE_TYPE_FA,
} from '../../../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { CorrectServiceForm } from './correct-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * One assigned request at the desk — §21.1, §11.4.
 *
 * The animal, the person and the requested service become visible once the code
 * has been accepted here. Before that the page stays a work item, so the queue
 * cannot be used to browse other people's records.
 */
export default async function VetRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/vet/requests/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let view;
  try {
    view = await vetRequestDetail(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  const { request } = view;
  const alternatives = SERVICES_BY_CONTEXT[request.context].filter((s) => s !== request.serviceType);

  return (
    <PublicShell actor={guard.actor} title="پرونده مراجعه" pathname={'/vet/requests/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{SERVICE_TYPE_FA[request.serviceType]}</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {CONTEXT_FA[request.context]} · {view.locationNameFa}
              </p>
            </div>
            <StatusBadge tone={request.status === 'CHECKED_IN' ? 'success' : 'info'}>
              <span data-testid="vet-request-status">{REQUEST_STATUS_FA[request.status]}</span>
            </StatusBadge>
          </div>

          {request.status === 'CHECKED_IN' ? (
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm">
              <dt className="text-text-secondary">حیوان</dt>
              <dd data-testid="vet-animal-name">{view.animalName ?? 'بدون نام'}</dd>
              <dt className="text-text-secondary">کاربر مرتبط</dt>
              <dd data-testid="vet-owner-name">{view.ownerNameFa ?? '—'}</dd>
              <dt className="text-text-secondary">زمان پذیرش</dt>
              <dd>
                {request.checkedInAt
                  ? formatCivilDateFa(request.checkedInAt.toISOString().slice(0, 10))
                  : '—'}
              </dd>
            </dl>
          ) : (
            <p className="mt-lg text-body-sm text-text-secondary" data-testid="vet-needs-check-in">
              تا پذیرش کد مراجعه، اطلاعات حیوان و کاربر نمایش داده نمی‌شود.
            </p>
          )}
        </Card>

        {request.status === 'CHECKED_IN' ? (
          <Alert tone="warning" title="نمونه‌گیری خون اجباری است">
            در هر دو مسیر کاشت و تأیید میکروچیپ، نمونه خون گرفته می‌شود. ثبت نمونه و کد رهگیری در مرحله بعدِ
            پیاده‌سازی انجام می‌شود.
          </Alert>
        ) : null}

        {request.status === 'SUPERSEDED' && request.supersededByRequestId ? (
          <Card>
            <h3 className="text-label-lg">این درخواست جایگزین شد</h3>
            <p className="mt-md text-body-sm">{request.supersedeReasonFa}</p>
            <p className="mt-md text-body-sm">
              <Link
                href={'/vet/requests/' + request.supersededByRequestId}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-replacement-request"
              >
                رفتن به درخواست جدید برای پذیرش
              </Link>
            </p>
          </Card>
        ) : null}

        {alternatives.length > 0 && (request.status === 'ACTIVE' || request.status === 'CHECKED_IN') ? (
          <CorrectServiceForm
            requestId={request.id}
            options={alternatives.map((value) => ({ value, label: SERVICE_TYPE_FA[value] }))}
          />
        ) : null}
      </div>
    </PublicShell>
  );
}
