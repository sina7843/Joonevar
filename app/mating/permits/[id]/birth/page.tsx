import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { Identifier, StatusBadge } from '../../../../../src/ui/status.tsx';
import { db } from '../../../../../src/db/client.ts';
import { permitForParty, PERMIT_STATUS_FA } from '../../../../../src/mating/permits.ts';
import { litterView, PUPPY_STATUS_FA } from '../../../../../src/mating/birth.ts';
import { formatCivilDateFa } from '../../../../../src/domain/calendar.ts';
import {
  CorrectBirthForm,
  PuppyDeathForm,
  PuppyNameForm,
  RecordBirthForm,
} from '../../../breeding-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Birth and the litter — §19.1, §19.2.
 *
 * The page shows the two numbers that must not be confused: what was reported
 * at birth, which never changes once corrected versions are added, and how many
 * puppies are alive now. Every version, every profile and every death stays
 * readable.
 */
export default async function BirthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/mating/permits/' + id + '/birth');
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
      <PublicShell actor={guard.actor} title="زایمان" pathname={'/mating/permits/' + id + '/birth'}>
        <Card>
          <Alert tone="info" title="این پرونده هنوز مجوز صادرشده ندارد">
            <span data-testid="birth-locked">
              ثبت نتیجه زایمان پس از صدور مجوز انجام می‌شود. وضعیت فعلی: {PERMIT_STATUS_FA[permit.status]}.
            </span>
          </Alert>
        </Card>
      </PublicShell>
    );
  }

  const view = await litterView(db(), permit.id);
  const standing = view.puppies.filter((row) => row.status !== 'WITHDRAWN');

  return (
    <PublicShell actor={guard.actor} title="زایمان و توله‌ها" pathname={'/mating/permits/' + id + '/birth'}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">نتیجه زایمان</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                مجوز {permit.permitNo ?? '—'} ·{' '}
                <Link
                  href={'/mating/permits/' + id + '/pregnancy'}
                  className="text-text-brand underline underline-offset-4"
                >
                  اعلام بارداری
                </Link>
              </p>
            </div>
            <StatusBadge tone={view.litter ? 'info' : 'neutral'}>
              <span data-testid="birth-status">
                {view.litter ? 'زایمان ثبت شده' : 'هنوز ثبت نشده'}
              </span>
            </StatusBadge>
          </div>

          {view.litter ? (
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="birth-counts">
              <dt className="text-text-secondary">تاریخ تولد</dt>
              <dd>{formatCivilDateFa(view.litter.bornOn)}</dd>
              <dt className="text-text-secondary">زنده در زمان تولد (گزارش اولیه)</dt>
              <dd data-testid="reported-live">{view.reportedLiveAtBirth}</dd>
              <dt className="text-text-secondary">مرده در زمان تولد (گزارش اولیه)</dt>
              <dd data-testid="reported-dead">{view.reportedDeadAtBirth}</dd>
              <dt className="text-text-secondary">تعداد اعلام‌شده در نسخه فعلی</dt>
              <dd data-testid="current-counts">
                {view.current?.liveCount ?? 0} زنده · {view.current?.deadCount ?? 0} مرده (نسخه{' '}
                {view.current?.version ?? 1})
              </dd>
              <dt className="text-text-secondary">پرونده‌های موقت موجود</dt>
              <dd data-testid="profile-count">{view.profiles}</dd>
              <dt className="text-text-secondary">زنده در حال حاضر</dt>
              <dd data-testid="living-now">{view.livingNow}</dd>
            </dl>
          ) : null}

          {view.litter ? (
            <p className="mt-lg text-caption text-text-secondary" data-testid="history-note">
              تعداد پرونده‌های تاریخی لزوماً با تعداد فعلی توله‌های زنده برابر نیست؛ مرگ پس از تولد، گزارش
              اولیه را تغییر نمی‌دهد.
            </p>
          ) : null}
        </Card>

        {view.litter === null ? <RecordBirthForm permitId={permit.id} /> : null}

        {view.current ? (
          <CorrectBirthForm
            permitId={permit.id}
            version={view.current.version}
            defaults={{ liveCount: view.current.liveCount, deadCount: view.current.deadCount }}
            standing={standing.map((row) => ({
              id: row.id,
              tempCode: row.tempCode,
              nameFa: row.nameFa,
              statusFa: PUPPY_STATUS_FA[row.status] ?? row.status,
            }))}
          />
        ) : null}

        {view.litter ? (
          <Card>
            <h2 className="text-label-lg">توله‌ها</h2>
            {view.puppies.length === 0 ? (
              <div className="mt-lg">
                <EmptyState
                  title="پرونده توله‌ای ساخته نشده است"
                  description="برای توله مرده در زمان تولد، پرونده، کد موقت یا کارت ساخته نمی‌شود."
                />
              </div>
            ) : (
              <ul className="mt-lg space-y-md" data-testid="puppy-list">
                {view.puppies.map((puppy) => (
                  <li
                    key={puppy.id}
                    className="rounded-lg border border-border-subtle p-lg"
                    data-testid={'puppy-' + puppy.tempCode}
                  >
                    <div className="flex items-start justify-between gap-md">
                      <div className="min-w-0">
                        <p className="text-label-md">
                          <Identifier value={puppy.tempCode} />
                        </p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {puppy.nameFa ?? 'بدون نام (تا مرحله میکروچیپ اختیاری است)'}
                        </p>
                        {puppy.diedOn ? (
                          <p className="mt-2xs text-caption text-text-secondary" data-testid="puppy-death-note">
                            مرگ در {formatCivilDateFa(puppy.diedOn)} · {puppy.deathReasonFa}
                          </p>
                        ) : null}
                        {puppy.withdrawnReasonFa ? (
                          <p className="mt-2xs text-caption text-text-secondary" data-testid="puppy-withdrawn-note">
                            با اصلاح نسخه {puppy.withdrawnByVersion} کنار گذاشته شد · {puppy.withdrawnReasonFa}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge
                        tone={
                          puppy.status === 'ALIVE'
                            ? 'success'
                            : puppy.status === 'DECEASED'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        <span data-testid={'puppy-status-' + puppy.tempCode}>
                          {PUPPY_STATUS_FA[puppy.status]}
                        </span>
                      </StatusBadge>
                    </div>

                    {puppy.status === 'ALIVE' ? (
                      <div className="mt-md space-y-md">
                        <PuppyNameForm
                          permitId={permit.id}
                          puppyId={puppy.id}
                          tempCode={puppy.tempCode}
                          version={puppy.version}
                          nameFa={puppy.nameFa}
                        />
                        <PuppyDeathForm
                          permitId={permit.id}
                          puppyId={puppy.id}
                          tempCode={puppy.tempCode}
                          version={puppy.version}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {view.history.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">تاریخچه نسخه‌ها</h2>
            <ul className="mt-lg space-y-md" data-testid="birth-history">
              {view.history.map((row) => (
                <li key={row.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'birth-version-' + row.version}>
                  <p className="text-label-md">
                    نسخه {row.version} · {row.liveCount} زنده · {row.deadCount} مرده ·{' '}
                    {row.kind === 'INITIAL' ? 'گزارش اولیه' : 'اصلاح'}
                  </p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    {formatCivilDateFa(row.declaredAt.toISOString().slice(0, 10))}
                  </p>
                  {row.reasonFa ? <p className="mt-sm text-body-sm">علت: {row.reasonFa}</p> : null}
                  {row.noteFa ? <p className="mt-sm text-body-sm">{row.noteFa}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
