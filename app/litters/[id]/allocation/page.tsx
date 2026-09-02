import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import {
  allocationView,
  ALLOCATION_STATUS_FA,
  CARD_DISTINCTION_NOTE_FA,
  NO_ARBITRATION_NOTE_FA,
} from '../../../../src/mating/allocation.ts';
import { PUPPY_STATUS_FA } from '../../../../src/mating/birth.ts';
import { PRE_BIRTH_RULE_NOTE_FA } from '../../../../src/domain/allocation.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { ProposeAllocationForm, RespondAllocationForm } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The allocation of one litter — §19.3.
 *
 * The screen shows the pre-birth rule as context, the current proposed owners,
 * who has confirmed the current version and the whole history of versions. It
 * never presents a proposal as settled, and it never offers a way to break the
 * tie: that happens between the two people, outside the system.
 */
export default async function AllocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/litters/' + id + '/allocation');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let view;
  try {
    view = await allocationView(db(), guard.actor, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === 'NOT_FOUND' || error.code === 'CONFLICT')) {
      return <RecordNotFound error={error} />;
    }
    throw error;
  }

  const parties = [view.permit.initiatorAccountId, view.permit.counterpartyAccountId].filter(
    (value): value is string => value !== null,
  );
  const ownerOf = (puppyId: string) =>
    view.items.find((row) => row.puppyId === puppyId)?.proposedOwnerAccountId ?? null;
  const myAnswer = view.approvals.find((row) => row.partyAccountId === guard.actor.accountId) ?? null;
  const pending = view.current?.status === 'PENDING_BOTH_OWNERS';
  const canPropose = view.current === null || view.current.status !== 'PENDING_BOTH_OWNERS' || myAnswer === null;

  return (
    <PublicShell actor={guard.actor} title="تخصیص توله‌ها" pathname={'/litters/' + id + '/allocation'}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">تخصیص مالکیت توله‌ها</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                مجوز {view.permit.permitNo ?? '—'} ·{' '}
                <Link
                  href={'/mating/permits/' + view.permit.id + '/birth'}
                  className="text-text-brand underline underline-offset-4"
                >
                  پرونده زایمان
                </Link>
              </p>
            </div>
            <StatusBadge
              tone={
                view.current?.status === 'FINAL'
                  ? 'success'
                  : view.current?.status === 'REJECTED'
                    ? 'warning'
                    : 'info'
              }
            >
              <span data-testid="allocation-status">
                {view.current ? ALLOCATION_STATUS_FA[view.current.status] : 'هنوز پیشنهادی ثبت نشده'}
              </span>
            </StatusBadge>
          </div>
          <p className="mt-lg text-caption text-text-secondary" data-testid="no-arbitration-note">
            {NO_ARBITRATION_NOTE_FA}
          </p>
        </Card>

        {view.ruleContext ? (
          <Card>
            <h2 className="text-label-lg">توافق پیش از تولد (فقط زمینه پیشنهاد)</h2>
            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="rule-context">
              <dt className="text-text-secondary">نوع توافق</dt>
              <dd>{view.ruleContext.typeFa}</dd>
              {view.ruleContext.sides.map((side) => (
                <div key={side.sideFa} className="contents">
                  <dt className="text-text-secondary">{side.sideFa}</dt>
                  <dd>
                    {side.describeFa} · {view.partyNames[side.partyAccountId] ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-sm text-caption text-text-secondary" data-testid="rule-is-context">
              {PRE_BIRTH_RULE_NOTE_FA}
            </p>
          </Card>
        ) : null}

        {view.current ? (
          <Card>
            <h2 className="text-label-lg">{'نسخه ' + view.current.version + ' — مالک پیشنهادی هر توله'}</h2>
            <ul className="mt-lg space-y-md" data-testid="allocation-items">
              {view.puppies.map((puppy) => (
                <li
                  key={puppy.id}
                  className="flex items-start justify-between gap-md rounded-lg border border-border-subtle p-lg"
                  data-testid={'allocation-row-' + puppy.tempCode}
                >
                  <div className="min-w-0">
                    <p className="text-label-md">
                      <Identifier value={puppy.tempCode} />
                    </p>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {(puppy.nameFa ?? 'بدون نام') + ' · ' + (PUPPY_STATUS_FA[puppy.status] ?? puppy.status)}
                    </p>
                  </div>
                  <p className="text-body-sm" data-testid={'proposed-owner-' + puppy.tempCode}>
                    {ownerOf(puppy.id) ? (view.partyNames[ownerOf(puppy.id)!] ?? '—') : '—'}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="allocation-approvals">
              {parties.map((party) => {
                const answer = view.approvals.find((row) => row.partyAccountId === party) ?? null;
                return (
                  <div key={party} className="contents">
                    <dt className="text-text-secondary">{view.partyNames[party] ?? '—'}</dt>
                    <dd data-testid={'approval-' + party}>
                      {answer === null
                        ? 'هنوز پاسخ نداده است'
                        : answer.approved
                          ? 'تأیید کرده است'
                          : 'رد کرده است: ' + (answer.reasonFa ?? '')}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {view.current.noteFa ? <p className="mt-sm text-body-sm">{view.current.noteFa}</p> : null}

            {pending && myAnswer === null ? (
              <RespondAllocationForm
                litterId={id}
                allocationId={view.current.id}
                version={view.current.version}
              />
            ) : null}
            {pending && myAnswer !== null ? (
              <Alert tone="info" title="در انتظار تأیید طرف دیگر">
                <span data-testid="pending-both-note">
                  پاسخ شما ثبت شده است؛ تا تأیید هر دو طرف، تخصیص نهایی نمی‌شود و کارت توله قفل می‌ماند.
                </span>
              </Alert>
            ) : null}
          </Card>
        ) : null}

        {view.current?.status === 'FINAL' ? (
          <Card>
            <Alert tone="success" title="تخصیص با تأیید هر دو طرف نهایی شد">
              <span data-testid="final-note">{CARD_DISTINCTION_NOTE_FA}</span>
            </Alert>
            <p className="mt-lg text-body-sm">
              <Link
                href={'/puppy-cards/checkout?permit=' + view.permit.id}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-card-checkout"
              >
                صدور کارت توله
              </Link>
            </p>
          </Card>
        ) : null}

        {canPropose ? (
          <ProposeAllocationForm
            litterId={id}
            permitId={view.permit.id}
            isRevision={view.current !== null}
            puppies={view.puppies.map((puppy) => ({
              id: puppy.id,
              tempCode: puppy.tempCode,
              nameFa: puppy.nameFa,
              statusFa: PUPPY_STATUS_FA[puppy.status] ?? puppy.status,
              current: ownerOf(puppy.id),
            }))}
            parties={parties.map((party) => ({
              accountId: party,
              label: view.partyNames[party] ?? '—',
            }))}
          />
        ) : null}

        {view.history.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">تاریخچه نسخه‌ها</h2>
            <ul className="mt-lg space-y-md" data-testid="allocation-history">
              {view.history.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-border-subtle p-lg"
                  data-testid={'allocation-version-' + row.version}
                >
                  <p className="text-label-md">
                    {'نسخه ' + row.version + ' · ' + ALLOCATION_STATUS_FA[row.status]}
                  </p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    {formatCivilDateFa(row.proposedAt.toISOString().slice(0, 10))} ·{' '}
                    {view.partyNames[row.proposedByAccountId] ?? '—'}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
