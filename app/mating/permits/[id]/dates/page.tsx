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
  datesOfPermit,
  declarerNames,
  pendingDate,
  DATE_STATUS_FA,
} from '../../../../../src/mating/dates.ts';
import { cooldownAdvisoryForAnimals, NO_BASIS_NOTE_FA } from '../../../../../src/mating/cooldown.ts';
import { formatCivilDateFa } from '../../../../../src/domain/calendar.ts';
import { DeclareDateForm, RespondToDateForm } from '../../../dates-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Official mating dates of one permit — §17.1, §17.2.
 *
 * Everything on this page is history: every version stays readable with its
 * declarer, its time and its state, and the newest mutually confirmed date is
 * marked as the official basis for both animals.
 */
export default async function PermitDatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/mating/permits/' + id + '/dates');
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
      <PublicShell actor={guard.actor} title="تاریخ‌های جفت‌گیری" pathname={'/mating/permits/' + id + '/dates'}>
        <Card>
          <Alert tone="info" title="این پرونده هنوز مجوز صادرشده ندارد">
            <span data-testid="dates-locked">
              اعلام تاریخ رسمی فقط پس از صدور مجوز ممکن است. وضعیت فعلی پرونده:{' '}
              {PERMIT_STATUS_FA[permit.status]}.
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

  const [rows, pending, names, advisory] = await Promise.all([
    datesOfPermit(db(), permit.id),
    pendingDate(db(), permit.id),
    declarerNames(db(), permit),
    cooldownAdvisoryForAnimals(db(), [permit.sireAnimalId, permit.damAnimalId]),
  ]);
  const confirmed = rows.filter((row) => row.status === 'CONFIRMED');
  const basis = confirmed.reduce<string | null>(
    (latest, row) => (latest === null || row.matedOn > latest ? row.matedOn : latest),
    null,
  );
  const awaitingMe = pending !== null && pending.declaredByAccountId !== guard.actor.accountId;
  const mineIsPending = pending !== null && pending.declaredByAccountId === guard.actor.accountId;

  return (
    <PublicShell actor={guard.actor} title="تاریخ‌های جفت‌گیری" pathname={'/mating/permits/' + id + '/dates'}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">تاریخ‌های رسمی این پرونده</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                مجوز {permit.permitNo ?? '—'} ·{' '}
                <Link href={'/mating/permits/' + id} className="text-text-brand underline underline-offset-4">
                  بازگشت به پرونده
                </Link>
              </p>
            </div>
            <StatusBadge tone={basis ? 'success' : 'info'}>
              <span data-testid="official-basis">
                {basis ? 'مبنای رسمی: ' + formatCivilDateFa(basis) : 'هنوز تاریخ تأییدشده‌ای نیست'}
              </span>
            </StatusBadge>
          </div>

          {advisory.hasWarning ? (
            <Alert tone="warning" title="هشدار فاصله زمانی (Cooldown)">
              <span data-testid="cooldown-warning">{advisory.messageFa}</span>
            </Alert>
          ) : (
            <p className="mt-lg text-caption text-text-secondary" data-testid="cooldown-no-basis">
              {NO_BASIS_NOTE_FA}
            </p>
          )}
          <p className="mt-sm text-caption text-text-secondary" data-testid="personal-note">
            تاریخ شخصیِ تأییدنشده مبنای رسمی را عوض نمی‌کند؛ فقط تاریخ تأییدشده دوطرفه در این پرونده مبناست.
          </p>
        </Card>

        {awaitingMe && pending ? (
          <RespondToDateForm
            permitId={permit.id}
            declarationId={pending.id}
            version={pending.version}
            matedOn={pending.matedOn}
          />
        ) : null}

        {mineIsPending && pending ? (
          <>
            <Alert tone="info" title="در انتظار پاسخ طرف مقابل">
              <span data-testid="awaiting-counterparty">
                نسخه {pending.version} با تاریخ {pending.matedOn} برای تأیید طرف مقابل ارسال شده است.
              </span>
            </Alert>
            <DeclareDateForm permitId={permit.id} replacesVersion={pending.version} />
          </>
        ) : (
          <DeclareDateForm permitId={permit.id} />
        )}

        <Card>
          <h2 className="text-label-lg">تاریخچه اعلام‌ها</h2>
          {rows.length === 0 ? (
            <div className="mt-lg">
              <EmptyState
                title="هنوز تاریخی اعلام نشده است"
                description="هر دو طرف می‌توانند تاریخ اعلام کنند؛ هر اعلام نسخه خودش را دارد."
              />
            </div>
          ) : (
            <ul className="mt-lg space-y-md" data-testid="date-history">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border-subtle p-lg"
                  data-testid={'date-version-' + row.version}
                >
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="text-label-md">
                        نسخه {row.version} ·{' '}
                        <span dir="ltr" className="font-mono">
                          {row.matedOn}
                        </span>
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        اعلام‌کننده: {names[row.declaredByAccountId] ?? '—'} ·{' '}
                        {formatCivilDateFa(row.declaredAt.toISOString().slice(0, 10))}
                      </p>
                      {row.replacesVersion !== null ? (
                        <p className="mt-2xs text-caption text-text-secondary">
                          نسخه اصلاحی برای نسخه {row.replacesVersion}
                        </p>
                      ) : null}
                      {row.conflictsWithId ? (
                        <p className="mt-2xs text-caption text-text-secondary" data-testid="conflict-note">
                          در پاسخ به تاریخ اعلام‌شده دیگر ثبت شده است؛ هر دو مقدار در همین فهرست دیده می‌شود.
                        </p>
                      ) : null}
                      {row.noteFa ? <p className="mt-sm text-body-sm">{row.noteFa}</p> : null}
                    </div>
                    <StatusBadge
                      tone={
                        row.status === 'CONFIRMED'
                          ? 'success'
                          : row.status === 'CONFLICTED'
                            ? 'warning'
                            : row.status === 'SUPERSEDED'
                              ? 'neutral'
                              : 'info'
                      }
                    >
                      <span data-testid={'date-status-' + row.version}>{DATE_STATUS_FA[row.status]}</span>
                    </StatusBadge>
                  </div>
                  {row.status === 'CONFIRMED' && row.matedOn === basis ? (
                    <p className="mt-sm text-caption text-text-brand" data-testid="basis-marker">
                      مبنای فعلی Cooldown و Timeline هر دو حیوان
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
