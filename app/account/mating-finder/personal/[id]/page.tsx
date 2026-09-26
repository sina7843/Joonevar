import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../../src/ui/status.tsx';
import { AppError } from '../../../../../src/domain/errors.ts';
import { db } from '../../../../../src/db/client.ts';
import { formatCivilDateFa } from '../../../../../src/domain/calendar.ts';
import { datesOfSubject, pendingDateOf, personalMatingForParty, personalSubject } from '../../../../../src/mating/dates.ts';
import { personalMatingView } from '../../../../../src/finder/downstream.ts';
import { PERSONAL_CONSEQUENCES_FA } from '../../../../../src/finder/request-model.ts';
import { DeclareDateForm, RespondToDateForm } from '../../../../mating/dates-forms.tsx';
import { DateHistory } from '../../../../mating/date-history.tsx';

export const dynamic = 'force-dynamic';

/**
 * A contract-backed personal mating — PHASE-4 PROMPT-006.
 *
 * The same append-only date protocol as the official permit: either side
 * declares, only the other confirms that exact version, a different answer is
 * an explicit conflict, and only the newest mutually confirmed date moves both
 * animals' last mating. Nothing here has an official effect.
 */
export default async function PersonalMatingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/account/mating-finder/personal/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  let mating;
  try {
    mating = await personalMatingForParty(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  const subject = personalSubject(mating);
  const [rows, pending, view] = await Promise.all([datesOfSubject(db(), subject), pendingDateOf(db(), subject), personalMatingView(db(), mating)]);
  const { content, cooldown } = view;
  const names: Record<string, string> = {
    [content.parties.sire.accountId]: content.parties.sire.nameFa,
    [content.parties.dam.accountId]: content.parties.dam.nameFa,
  };
  const basis = rows.filter((r) => r.status === 'CONFIRMED').reduce<string | null>((latest, r) => (latest === null || r.matedOn > latest ? r.matedOn : latest), null);
  const active = mating.status === 'ACTIVE';
  const awaitingMe = active && pending !== null && pending.declaredByAccountId !== guard.actor.accountId;
  const mineIsPending = active && pending !== null && pending.declaredByAccountId === guard.actor.accountId;

  return (
    <PublicShell actor={guard.actor} title="جفت‌گیری شخصی" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">{content.animals.sire.nameFa + ' × ' + content.animals.dam.nameFa}</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {'قرارداد جفت‌یابی · '}
                <Link href={'/account/mating-finder/requests/' + mating.requestId} className="text-text-brand underline underline-offset-4">
                  بازگشت به درخواست
                </Link>
              </p>
            </div>
            <StatusBadge tone={active ? (basis ? 'success' : 'info') : 'neutral'}>
              <span data-testid="personal-basis">
                {!active ? 'لغوشده' : basis ? 'جفت‌گیری تأییدشده: ' + formatCivilDateFa(basis) : 'هنوز تاریخ تأییدشده‌ای نیست'}
              </span>
            </StatusBadge>
          </div>
          <ul className="mt-md list-inside list-disc space-y-xs text-body-sm" data-testid="personal-consequences">
            {PERSONAL_CONSEQUENCES_FA.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {!active ? (
            <Alert tone="info" title="این پرونده با لغو قرارداد بسته شد">
              {(mating.cancelReasonFa ?? '') + ' تاریخ‌های تأییدشده در سابقه می‌مانند؛ تاریخ تازه‌ای ثبت نمی‌شود.'}
            </Alert>
          ) : null}
          <ul className="mt-md space-y-xs text-caption text-text-secondary" data-testid="personal-cooldown">
            {cooldown.map((c) => (
              <li key={c.animalId}>{(c.sex === 'MALE' ? 'نر' : 'ماده') + ' «' + c.nameFa + '»: ' + c.cooldown.fa}</li>
            ))}
          </ul>
        </Card>

        {awaitingMe && pending ? (
          <RespondToDateForm kind="PERSONAL" permitId={mating.id} declarationId={pending.id} version={pending.version} matedOn={pending.matedOn} />
        ) : null}
        {mineIsPending && pending ? (
          <>
            <Alert tone="info" title="در انتظار پاسخ طرف مقابل">
              <span data-testid="awaiting-counterparty">
                نسخه {pending.version} با تاریخ {pending.matedOn} برای تأیید طرف مقابل ارسال شده است.
              </span>
            </Alert>
            <DeclareDateForm kind="PERSONAL" permitId={mating.id} replacesVersion={pending.version} />
          </>
        ) : active ? (
          <DeclareDateForm kind="PERSONAL" permitId={mating.id} />
        ) : null}

        <DateHistory rows={rows} names={names} basis={basis} />
      </div>
    </PublicShell>
  );
}
