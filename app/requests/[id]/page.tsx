import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../src/domain/ids.ts';
import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../src/ui/access-denied.tsx';
import { AppError } from '../../../src/domain/errors.ts';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionOwner, Identifier } from '../../../src/ui/status.tsx';
import { ReferralStatusBadge, RequestStatusBadge } from '../status-badges.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../src/ui/page-crumbs.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { db } from '../../../src/db/client.ts';
import { ownerRequest } from '../../../src/vets/visits.ts';
import { ownerSamples } from '../../../src/clinical/samples.ts';
import { SAMPLE_STATUS_FA } from '../../../src/domain/microchip.ts';
import {
  CONTACT_FOR_PRICE_FA,
  CONTEXT_FA,
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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
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
  const sampleRows = await ownerSamples(db(), guard.actor, request.id);
  const usable = referral !== null && referral.status === 'ACTIVE' && !expired;

  const title = SERVICE_TYPE_FA[request.serviceType] + ' · ' + (view.animalName ?? 'بدون نام');
  const expiryFa = referral ? formatCivilDateFa(referral.expiresAt.toISOString().slice(0, 10)) : null;

  return (
    <PublicShell
      actor={guard.actor}
      title={title}
      pathname={'/requests/' + id}
      header={
        <div>
          <PageCrumbs
            items={[
              { name: 'خانه', href: '/dashboard' },
              { name: 'درخواست‌ها', href: '/requests' },
              { name: referral?.code ?? SERVICE_TYPE_FA[request.serviceType] },
            ]}
          />
          <PageHeader
            title={title}
            back={{ href: '/requests' }}
            aside={
              <span data-testid="request-status">
                <RequestStatusBadge status={request.status} />
              </span>
            }
            meta={[
              CONTEXT_FA[request.context],
              view.vetNameFa + ' · ' + view.locationNameFa,
              expiryFa ? 'مهلت مراجعه تا ' + expiryFa : null,
            ].filter(Boolean)}
          />
        </div>
      }
    >
      {renewed === '1' ? (
        <Alert tone="success" title="کد مراجعه جدید صادر شد">
          مهلت تازه روی همین پرونده ثبت شد و سابقه کد قبلی حفظ شده است.
        </Alert>
      ) : null}

      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-xl lg:col-span-8">
          {referral === null ? null : (
            <Card>
              <SectionHeader size="sm" title="کد مراجعه" />
              <p className="mt-md text-h3" data-testid="referral-code">
                <Identifier value={referral.code} />
              </p>
              <p className="mt-sm text-caption text-text-secondary">
                QR و ورود دستی دو نمایش از همین یک کد هستند؛ کد دومی وجود ندارد.
              </p>
              <div className="mt-md">
                <KeyValueList
                  rows={[
                    {
                      key: 'وضعیت کد',
                      testId: 'referral-status',
                      value: <ReferralStatusBadge status={referral.status} expired={expired} />,
                    },
                    {
                      key: 'مهلت مراجعه تا',
                      testId: 'referral-expiry',
                      value: expiryFa,
                    },
                    {
                      key: 'مدت اعتبار این کد',
                      value: referral.validityDays.toLocaleString('fa-IR') + ' روز',
                    },
                  ]}
                />
              </div>
            </Card>
          )}

          {sampleRows.length > 0 ? (
            <Card>
              <SectionHeader size="sm" title="نمونه" />
              <dl className="hz-kv mt-md" data-testid="owner-samples">
                {sampleRows.map((sample) => (
                  <div key={sample.id} className="hz-kv__row">
                    <dt className="hz-kv__key">
                      <Identifier label="کد رهگیری:" value={sample.trackingCode} />
                    </dt>
                    <dd className="hz-kv__value">{SAMPLE_STATUS_FA[sample.status]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-md text-caption text-text-secondary">
                کد رهگیری نمونه با کد مراجعه یکی نیست؛ یکی اجازه پذیرش است و دیگری شناسه خود نمونه.
              </p>
            </Card>
          ) : null}

          {request.status === 'SUPERSEDED' && request.supersededByRequestId ? (
            <Card>
              <SectionHeader size="sm" title="این درخواست جایگزین شده است" />
              <p className="mt-md text-body-sm">{request.supersedeReasonFa}</p>
              <p className="mt-md text-body-sm">
                <Link
                  href={'/requests/' + request.supersededByRequestId}
                  className="hz-link"
                  data-testid="replacement-link"
                >
                  مشاهده درخواست جدید همین حیوان
                </Link>
              </p>
            </Card>
          ) : null}

          <Card>
            <SectionHeader size="sm" title="جزئیات درخواست" />
            <div className="mt-md">
              <KeyValueList
                rows={[
                  { key: 'خدمت', value: SERVICE_TYPE_FA[request.serviceType] },
                  { key: 'زمینه', value: CONTEXT_FA[request.context] },
                  { key: 'حیوان', value: view.animalName ?? 'بدون نام' },
                  { key: 'دامپزشک معتمد', value: view.vetNameFa },
                  { key: 'مرکز', value: view.locationNameFa },
                  { key: 'هزینه', value: CONTACT_FOR_PRICE_FA },
                ]}
              />
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-xl lg:col-span-4" aria-label="وضعیت و اقدام">
          <Card>
            <SectionHeader size="sm" title="وضعیت و اقدام" />
            <div className="mt-md space-y-md">
              <KeyValueList
                rows={[
                  {
                    key: 'وضعیت',
                    value: (
                      <RequestStatusBadge status={request.status} size="sm" />
                    ),
                  },
                  {
                    key: 'کد مراجعه',
                    value: referral ? (
                      <ReferralStatusBadge status={referral.status} expired={expired} size="sm" />
                    ) : null,
                  },
                ]}
              />
              {request.status === 'ACTIVE' ? (
                <ActionOwner
                  owner="USER"
                  stack
                  extra={
                    usable && expiryFa
                      ? 'حیوان را تا ' + expiryFa + ' با همین کد نزد دامپزشک معتمد ببرید.'
                      : 'برای مراجعه، کد مراجعه جدید بگیرید.'
                  }
                />
              ) : null}
              {referral !== null && !usable ? (
                <>
                  <Alert tone="warning" title={expired ? 'مهلت این کد گذشته است' : 'این کد دیگر قابل استفاده نیست'}>
                    {referral.endedReasonFa ??
                      'سابقه کد قبلی حفظ می‌شود؛ در صورت نیاز می‌توانید کد جدید بگیرید و صلاحیت دامپزشک و مرکز دوباره بررسی می‌شود.'}
                  </Alert>
                  {expired && request.status === 'ACTIVE' ? <RenewReferralForm requestId={request.id} /> : null}
                </>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </PublicShell>
  );
}
