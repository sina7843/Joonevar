import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { permitForParty, PERMIT_STATUS_FA } from '../../../../../src/mating/permits.ts';
import {
  damOfPermit,
  pregnancyRecords,
  unlinkedPregnancyRequests,
  MISMATCH_LABEL_FA,
  MISMATCH_NOTE_FA,
  UNVERIFIED_NOTE_FA,
} from '../../../../../src/mating/pregnancy.ts';
import { formatCivilDateFa } from '../../../../../src/domain/calendar.ts';
import { DeclarePregnancyForm, RequestPregnancyCheckForm } from '../../../breeding-forms.tsx';

export const dynamic = 'force-dynamic';

const yesNo = (value: boolean) => (value ? 'بارداری اعلام‌شده' : 'بارداری رخ نداده');

/**
 * Pregnancy on one permit — §18.
 *
 * Two records are shown side by side and neither replaces the other. The
 * owner's declaration is explicitly UNVERIFIED and the cycle continues without
 * a veterinarian; when a veterinarian's result exists and differs, both values
 * stay visible under the neutral label the source fixes.
 */
export default async function PregnancyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/mating/permits/' + id + '/pregnancy');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let permit;
  try {
    permit = await permitForParty(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }

  if (permit.status !== 'ISSUED') {
    return (
      <PublicShell actor={guard.actor} title="بارداری" pathname={'/mating/permits/' + id + '/pregnancy'}>
        <Card>
          <Alert tone="info" title="این پرونده هنوز مجوز صادرشده ندارد">
            <span data-testid="pregnancy-locked">
              اعلام رسمی بارداری پس از صدور مجوز انجام می‌شود. وضعیت فعلی: {PERMIT_STATUS_FA[permit.status]}.
            </span>
          </Alert>
          <p className="mt-lg text-body-sm">
            <Link href={'/mating/permits/' + id} className="text-text-brand underline underline-offset-4">
              بازگشت به پرونده مجوز
            </Link>
          </p>
        </Card>
      </PublicShell>
    );
  }

  const dam = await damOfPermit(db(), permit);
  const records = await pregnancyRecords(db(), permit.id);
  const openRequests = dam ? await unlinkedPregnancyRequests(db(), guard.actor, dam.id) : [];

  return (
    <PublicShell actor={guard.actor} title="بارداری" pathname={'/mating/permits/' + id + '/pregnancy'}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">اعلام بارداری</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                مجوز {permit.permitNo ?? '—'} · حیوان ماده: {dam?.name ?? 'بدون نام'} ·{' '}
                <Link href={'/mating/permits/' + id} className="text-text-brand underline underline-offset-4">
                  بازگشت به پرونده
                </Link>
              </p>
            </div>
            <StatusBadge tone={records.declaration ? 'info' : 'neutral'}>
              <span data-testid="declaration-status">
                {records.declaration ? 'UNVERIFIED — اعلام مالک' : 'هنوز اعلامی ثبت نشده'}
              </span>
            </StatusBadge>
          </div>
          <p className="mt-lg text-caption text-text-secondary" data-testid="unverified-note">
            {UNVERIFIED_NOTE_FA}
          </p>
          <p className="mt-sm text-caption text-text-secondary" data-testid="permit-untouched-note">
            اعلام بارداری و زایمان، مجوز صادرشده را صادر، مسدود، معلق، باطل یا تغییر نمی‌دهد.
          </p>
        </Card>

        {records.mismatch ? (
          <Alert tone="warning" title={MISMATCH_LABEL_FA}>
            <span data-testid="mismatch-note">{MISMATCH_NOTE_FA}</span>
          </Alert>
        ) : null}

        <DeclarePregnancyForm
          permitId={permit.id}
          isCorrection={records.declaration !== null}
          defaults={{
            pregnant: records.declaration?.pregnant ?? true,
            expectedCount: records.declaration?.expectedCount ?? null,
          }}
        />

        <Card>
          <h2 className="text-label-lg">تاریخچه اعلام‌های مالک</h2>
          {records.declarations.length === 0 ? (
            <div className="mt-lg">
              <EmptyState
                title="هنوز اعلامی ثبت نشده است"
                description="اعلام شما UNVERIFIED است و برای ادامه چرخه کافی است."
              />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="declaration-history">
              {records.declarations.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border-subtle p-lg"
                  data-testid={'declaration-' + row.version}
                >
                  <p className="text-label-md">
                    نسخه {row.version} · {yesNo(row.pregnant)}
                    {row.expectedCount !== null ? ' · تعداد تخمینی ' + row.expectedCount : ''}
                  </p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    {formatCivilDateFa(row.declaredAt.toISOString().slice(0, 10))} · UNVERIFIED
                  </p>
                  {row.reasonFa ? <p className="mt-sm text-body-sm">علت اصلاح: {row.reasonFa}</p> : null}
                  {row.noteFa ? <p className="mt-sm text-body-sm">{row.noteFa}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <RequestPregnancyCheckForm
          permitId={permit.id}
          requests={openRequests.map((row) => ({
            id: row.id,
            label: 'مراجعه ' + formatCivilDateFa(row.createdAt.toISOString().slice(0, 10)),
          }))}
        />

        <Card>
          <h2 className="text-label-lg">نتیجه مستقل دامپزشک</h2>
          {records.checks.length === 0 ? (
            <div className="mt-lg">
              <EmptyState
                title="درخواست تأیید ثبت نشده است"
                description="این مرحله اختیاری است و نبود آن نقص پرونده نیست."
              />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="vet-results">
              {records.checks.map(({ check, results, latest, locationNameFa }) => (
                <li key={check.id} className="rounded-lg border border-border-subtle p-lg">
                  {latest === null ? (
                    <p className="text-body-sm" data-testid="vet-result-pending">
                      مراجعه ثبت شده است و نتیجه‌ای هنوز ثبت نشده؛ انتظار نتیجه، مهلت مسدودکننده‌ای برای
                      پرونده نمی‌سازد.
                    </p>
                  ) : (
                    <div>
                      <p className="text-label-md" data-testid="vet-result-value">
                        {yesNo(latest.pregnant)}
                        {latest.expectedCount !== null ? ' · تعداد تخمینی ' + latest.expectedCount : ''}
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary" data-testid="vet-result-identity">
                        {latest.vetNameFa} · کد نظام {latest.councilCode} · {locationNameFa ?? '—'} ·{' '}
                        {formatCivilDateFa(latest.examinedAt.toISOString().slice(0, 10))} · VERIFIED_BY_VET
                      </p>
                      {records.declaration &&
                      (records.declaration.pregnant !== latest.pregnant ||
                        (records.declaration.expectedCount ?? null) !== (latest.expectedCount ?? null)) ? (
                        <p className="mt-sm text-body-sm" data-testid="mismatch-values">
                          {MISMATCH_LABEL_FA}: اعلام مالک «{yesNo(records.declaration.pregnant)}
                          {records.declaration.expectedCount !== null
                            ? ' · ' + records.declaration.expectedCount
                            : ''}
                          » و نتیجه دامپزشک «{yesNo(latest.pregnant)}
                          {latest.expectedCount !== null ? ' · ' + latest.expectedCount : ''}».
                        </p>
                      ) : null}
                      {results.length > 1 ? (
                        <p className="mt-sm text-caption text-text-secondary">
                          {results.length} نسخه نتیجه ثبت شده است و نسخه‌های قبلی حذف نشده‌اند.
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="text-body-sm">
            <Link
              href={'/mating/permits/' + id + '/birth'}
              className="text-text-brand underline underline-offset-4"
              data-testid="open-birth"
            >
              ثبت نتیجه زایمان
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
