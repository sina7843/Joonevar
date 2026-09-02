import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { adapterReports } from '../../../../src/adapters/registry.ts';
import { vetLocations, vetProfiles } from '../../../../src/db/schema/vets.ts';
import { vetRequestDetail } from '../../../../src/vets/visits.ts';
import { animalChipView, procedureOf } from '../../../../src/clinical/microchip.ts';
import { eventsOfSample, samplesOfRequest } from '../../../../src/clinical/samples.ts';
import { isUnusable, READ_METHOD_FA, SAMPLE_STATUS_FA } from '../../../../src/domain/microchip.ts';
import {
  CONTEXT_FA,
  REQUEST_STATUS_FA,
  SERVICES_BY_CONTEXT,
  SERVICE_TYPE_FA,
} from '../../../../src/domain/referral.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { CorrectServiceForm } from './correct-form.tsx';
import { ChipPanel, SamplePanel, UnusableSampleForm } from './procedure.tsx';

export const dynamic = 'force-dynamic';

const EVENT_FA: Record<string, string> = {
  COLLECTED: 'نمونه‌گیری انجام شد',
  CUSTODY_RECORDED: 'نگهداری نزد همین دامپزشک ثبت شد',
  SEND_INSTRUCTED: 'دستور ارسال از مرکز ژنتیک',
  SHIPPED: 'ارسال ثبت شد',
  MARKED_UNUSABLE: 'نمونه غیرقابل‌استفاده ثبت شد',
  RESAMPLED: 'نمونه‌گیری مجدد در همین درخواست',
};

/**
 * One assigned visit at the desk — §12, §21.1.
 *
 * The animal, the person and the service become visible once the referral code
 * has been accepted here, and the microchip and sample steps follow in the
 * order §12.2 sets out. The final review lists what the source lists, and says
 * that the paper signature is an arrangement at the clinic — never a digital
 * gate on anything (§12.5, D13).
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
  const open = request.status === 'CHECKED_IN';
  const done = request.status === 'COMPLETED';
  const visible = open || done;
  const alternatives = SERVICES_BY_CONTEXT[request.context].filter((s) => s !== request.serviceType);

  const [{ animal, chip, conflicts }, procedure, sampleRows] = await Promise.all([
    animalChipView(db(), request.animalId),
    procedureOf(db(), request.id),
    samplesOfRequest(db(), request.id),
  ]);
  const [vet] = await db().select().from(vetProfiles).where(eq(vetProfiles.accountId, request.vetAccountId));
  const [location] = await db().select().from(vetLocations).where(eq(vetLocations.id, request.locationId));

  const latest = sampleRows[0] ?? null;
  const events = latest ? await eventsOfSample(db(), latest.id) : [];
  const liveSample = latest !== null && !isUnusable(latest.status);
  const readerReady =
    adapterReports(env()).find((a) => a.name === 'chip-reader')?.status !== 'NOT_CONFIGURED';

  const chipStep: 'READ' | 'IMPLANT' | 'REREAD' | 'BINDABLE' | 'DONE' = (() => {
    if (request.serviceType === 'MICROCHIP_IMPLANT') {
      if (procedure?.microchipId) return 'DONE';
      if (procedure?.implantConfirmedAt) return 'REREAD';
      if (procedure?.preReadNumber && chip === null) return 'IMPLANT';
      return 'READ';
    }
    if (request.serviceType === 'MICROCHIP_VERIFICATION') {
      if (chip !== null && procedure?.preReadNumber === chip.number) return 'DONE';
      if (procedure?.preReadNumber && chip === null) return 'BINDABLE';
      return 'READ';
    }
    return 'DONE';
  })();

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
            <StatusBadge tone={done ? 'success' : open ? 'success' : 'info'}>
              <span data-testid="vet-request-status">{REQUEST_STATUS_FA[request.status]}</span>
            </StatusBadge>
          </div>

          {visible ? (
            <div className="mt-lg flex items-start gap-lg">
              {animal?.photoFileId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={'/api/files/' + animal.photoFileId}
                  alt={'تصویر ' + (animal.name ?? 'حیوان')}
                  className="size-20 shrink-0 rounded-lg object-cover"
                  data-testid="vet-animal-photo"
                />
              ) : (
                <div
                  className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-caption text-text-secondary"
                  data-testid="vet-animal-photo-missing"
                >
                  بدون تصویر
                </div>
              )}
              <dl className="grid flex-1 grid-cols-2 gap-sm text-body-sm">
                <dt className="text-text-secondary">حیوان</dt>
                <dd data-testid="vet-animal-name">{view.animalName ?? 'بدون نام'}</dd>
                <dt className="text-text-secondary">کاربر مرتبط</dt>
                <dd data-testid="vet-owner-name">{view.ownerNameFa ?? '—'}</dd>
                <dt className="text-text-secondary">کد مراجعه</dt>
                <dd>{view.referral ? <Identifier value={view.referral.code} /> : '—'}</dd>
                <dt className="text-text-secondary">زمان پذیرش</dt>
                <dd>
                  {request.checkedInAt
                    ? formatCivilDateFa(request.checkedInAt.toISOString().slice(0, 10))
                    : '—'}
                </dd>
              </dl>
            </div>
          ) : (
            <p className="mt-lg text-body-sm text-text-secondary" data-testid="vet-needs-check-in">
              تا پذیرش کد مراجعه، اطلاعات حیوان و کاربر نمایش داده نمی‌شود.
            </p>
          )}
        </Card>

        {conflicts.length > 0 ? (
          <Alert tone="error" title="تعارض میکروچیپ ثبت شده است">
            <span data-testid="chip-conflict">{conflicts[0]!.detailFa}</span> عملیات متوقف است و هیچ اتصالی
            بازنویسی نمی‌شود.
          </Alert>
        ) : null}

        {open ? (
          <ChipPanel
            requestId={request.id}
            serviceType={request.serviceType}
            readerReady={readerReady}
            step={chipStep}
          />
        ) : null}

        {chip ? (
          <Card>
            <h3 className="text-label-lg">شماره رسمی میکروچیپ</h3>
            <p className="mt-md text-body-sm" data-testid="bound-chip-number">
              <Identifier value={chip.number} />
            </p>
            <p className="mt-2xs text-caption text-text-secondary">
              روش خواندن: {READ_METHOD_FA[chip.readMethod]} · این اتصال دائمی است و تعویض یا انتقال ندارد.
            </p>
          </Card>
        ) : null}

        {open || done ? (
          <SamplePanel
            requestId={request.id}
            hasLiveSample={liveSample}
            unusableSampleId={latest && isUnusable(latest.status) ? latest.id : null}
          />
        ) : null}

        {sampleRows.length > 0 ? (
          <Card>
            <h3 className="text-label-lg">نمونه و Custody</h3>
            <ul className="mt-md space-y-lg" data-testid="sample-list">
              {sampleRows.map((sample) => (
                <li key={sample.id} className="rounded-lg border border-border-subtle p-lg">
                  <div className="flex items-start justify-between gap-md">
                    <p className="text-body-sm">
                      <Identifier label="کد رهگیری نمونه:" value={sample.trackingCode} />
                    </p>
                    <StatusBadge tone={isUnusable(sample.status) ? 'warning' : 'info'}>
                      {SAMPLE_STATUS_FA[sample.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-sm text-caption text-text-secondary">
                    زمان نمونه‌گیری: {formatCivilDateFa(sample.collectedAt.toISOString().slice(0, 10))} ·
                    نگهدارنده: {vet?.displayNameFa ?? '—'}
                  </p>
                  {sample.unusableReasonFa ? (
                    <p className="mt-2xs text-caption text-text-secondary">دلیل: {sample.unusableReasonFa}</p>
                  ) : null}
                  {sample.id === latest?.id && !isUnusable(sample.status) && sample.status === 'IN_CUSTODY' ? (
                    <UnusableSampleForm requestId={request.id} sampleId={sample.id} />
                  ) : null}
                </li>
              ))}
            </ul>

            {events.length > 0 ? (
              <ul className="mt-lg space-y-sm text-caption text-text-secondary" data-testid="sample-events">
                {events.map((event) => (
                  <li key={event.id}>
                    {EVENT_FA[event.kind] ?? event.kind} —{' '}
                    {formatCivilDateFa(event.occurredAt.toISOString().slice(0, 10))}
                    {event.noteFa ? ' · ' + event.noteFa : ''}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-lg text-caption text-text-secondary">
              نمونه انقضای خودکار ندارد و تا دستور ارسال از مرکز ژنتیک نزد همین دامپزشک می‌ماند.
            </p>
          </Card>
        ) : null}

        {done && chip ? (
          <Card>
            <h3 className="text-label-lg">مرور نهایی خدمت</h3>
            <dl className="mt-md grid grid-cols-2 gap-sm text-body-sm" data-testid="service-summary">
              <dt className="text-text-secondary">حیوان</dt>
              <dd>{view.animalName ?? 'بدون نام'}</dd>
              <dt className="text-text-secondary">شناسه پرونده حیوان</dt>
              <dd>
                <Identifier value={request.animalId} />
              </dd>
              <dt className="text-text-secondary">نوع خدمت</dt>
              <dd>{SERVICE_TYPE_FA[request.serviceType]}</dd>
              <dt className="text-text-secondary">شماره میکروچیپ</dt>
              <dd>
                <Identifier value={chip.number} />
              </dd>
              <dt className="text-text-secondary">دامپزشک و کد نظام</dt>
              <dd>
                {vet?.displayNameFa ?? '—'} · {vet?.councilCode ?? '—'}
              </dd>
              <dt className="text-text-secondary">مرکز</dt>
              <dd>{location?.nameFa ?? '—'}</dd>
              <dt className="text-text-secondary">زمان انجام خدمت</dt>
              <dd>
                {latest ? formatCivilDateFa(latest.collectedAt.toISOString().slice(0, 10)) : '—'}
              </dd>
              <dt className="text-text-secondary">کد رهگیری نمونه</dt>
              <dd>{latest ? <Identifier value={latest.trackingCode} /> : '—'}</dd>
              <dt className="text-text-secondary">وضعیت</dt>
              <dd>{REQUEST_STATUS_FA[request.status]}</dd>
            </dl>
            <Alert tone="info" title="امضای فیزیکی برگه در محل">
              <span data-testid="physical-signature-note">
                امضای برگه و توافق‌های مربوط در محل دامپزشک انجام می‌شود. هیچ امضای دیجیتالی لازم نیست و کامل‌بودن
                امضاها مانع صدور برگه ثبتی نمی‌شود.
              </span>
            </Alert>
          </Card>
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

        {alternatives.length > 0 && (request.status === 'ACTIVE' || open) ? (
          <CorrectServiceForm
            requestId={request.id}
            options={alternatives.map((value) => ({ value, label: SERVICE_TYPE_FA[value] }))}
          />
        ) : null}
      </div>
    </PublicShell>
  );
}
