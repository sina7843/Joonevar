import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { ASSOC_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import {
  findPermit,
  permitBatch,
  permitView,
  PERMIT_STATUS_FA,
} from '../../../../src/mating/permits.ts';
import {
  describeShare,
  PRE_BIRTH_RULE_NOTE_FA,
  RULE_TYPE_FA,
  SIDE_FA,
  type AllocationSide,
} from '../../../../src/domain/allocation.ts';
import { PermitReviewForm } from '../review-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * One permit at the association — §16 steps 8 and 9, §21.5.
 *
 * The reviewer sees the two parties, the two animals and the agreed rule, plus
 * the verified payment. No pregnancy, birth, veterinary confirmation or
 * signature is requested, because none of them gates this decision (D13).
 */
export default async function AssocPermitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/assoc/permits/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const permit = await findPermit(db(), id);
  if (!permit) return <RecordNotFound error={notFoundError('پرونده مجوز پیدا نشد.')} />;

  const [view, batch] = await Promise.all([permitView(db(), permit), permitBatch(db(), permit)]);
  const shareOf = (side: AllocationSide) => view.shares.find((row) => row.side === side) ?? null;

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — انجمن" pathname={'/assoc/permits/' + id} nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-label-lg">پرونده مجوز جفت‌گیری</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                {view.initiatorName + ' و ' + view.counterpartyName}
              </p>
            </div>
            <StatusBadge tone={permit.status === 'ISSUED' ? 'success' : 'info'}>
              <span data-testid="assoc-permit-status">{PERMIT_STATUS_FA[permit.status]}</span>
            </StatusBadge>
          </div>

          {permit.permitNo ? (
            <div className="mt-lg" data-testid="assoc-permit-no">
              <Identifier label="شماره مجوز" value={permit.permitNo} />
            </div>
          ) : null}

          <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="assoc-permit-detail">
            <dt className="text-text-secondary">حیوان نر</dt>
            <dd>
              {(view.sire.name ?? 'بدون نام') + ' — ' + (view.sire.pedigreeCode ?? '—')}
              <span className="ms-sm text-caption text-text-secondary">{view.sire.ownerName}</span>
            </dd>
            <dt className="text-text-secondary">حیوان ماده</dt>
            <dd>
              {(view.dam.name ?? 'بدون نام') + ' — ' + (view.dam.pedigreeCode ?? '—')}
              <span className="ms-sm text-caption text-text-secondary">{view.dam.ownerName}</span>
            </dd>
            <dt className="text-text-secondary">تأیید طرف مقابل</dt>
            <dd data-testid="assoc-party-confirmed">
              {permit.counterpartyConfirmedAt ? 'ثبت شده' : 'ثبت نشده'}
            </dd>
            <dt className="text-text-secondary">پرداخت هزینه مجوز</dt>
            <dd data-testid="assoc-permit-payment">
              {batch?.status === 'PAID' ? 'تأییدشده روی سرور' : 'تأیید نشده'}
            </dd>
            <dt className="text-text-secondary">نوع توافق تقسیم</dt>
            <dd data-testid="assoc-rule-type">{permit.ruleType ? RULE_TYPE_FA[permit.ruleType] : '—'}</dd>
            {permit.ruleType
              ? (['SIRE_SIDE', 'DAM_SIDE'] as const).map((side) => (
                  <div key={side} className="contents">
                    <dt className="text-text-secondary">{SIDE_FA[side]}</dt>
                    <dd data-testid={'assoc-share-' + side}>
                      {describeShare(permit.ruleType!, {
                        side,
                        fixedCount: shareOf(side)?.fixedCount ?? null,
                        percent: shareOf(side)?.percent ?? null,
                      })}
                    </dd>
                  </div>
                ))
              : null}
          </dl>
          {permit.ruleNoteFa ? <p className="mt-sm text-body-sm">{permit.ruleNoteFa}</p> : null}
          <p className="mt-sm text-caption text-text-secondary">{PRE_BIRTH_RULE_NOTE_FA}</p>
        </Card>

        {permit.status === 'UNDER_REVIEW' ? (
          <Card>
            <h2 className="text-label-lg">تصمیم عملیاتی</h2>
            <PermitReviewForm permitId={permit.id} version={permit.version} />
          </Card>
        ) : (
          <Alert tone="info" title="این پرونده در صف تصمیم نیست">
            <span data-testid="assoc-permit-closed">
              تصمیم فقط روی پرونده‌ای ثبت می‌شود که پرداخت و ارسال آن کامل شده و در حال بررسی است.
            </span>
          </Alert>
        )}
      </div>
    </OpsShell>
  );
}
