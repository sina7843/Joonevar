import { notFound as pageNotFound } from 'next/navigation';
import { isUuid } from '../../../../src/domain/ids.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { notFound as notFoundError } from '../../../../src/domain/errors.ts';
import { ASSOC_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Desk, DeskHead, DeskVersionNote, Panel, whenFa } from '../../../../src/ui/desk.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
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
  // A segment that cannot be an id is a missing page, not a server error.
  if (!isUuid(id)) pageNotFound();
  const guard = await guardRoute('/assoc/permits/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const permit = await findPermit(db(), id);
  if (!permit) return <RecordNotFound error={notFoundError('پرونده مجوز پیدا نشد.')} />;

  const [view, batch] = await Promise.all([permitView(db(), permit), permitBatch(db(), permit)]);
  const shareOf = (side: AllocationSide) => view.shares.find((row) => row.side === side) ?? null;

  const open = permit.status === 'UNDER_REVIEW';
  return (
    <OpsShell actor={guard.actor} title="بررسی مجوز جفت‌گیری" pathname={'/assoc/permits/' + id} nav={ASSOC_NAV}>
      <DeskHead
        title={'مجوز جفت‌گیری · ' + view.initiatorName + ' و ' + view.counterpartyName}
        status={{
          tone: permit.status === 'ISSUED' ? 'success' : open ? 'info' : permit.status === 'REJECTED' ? 'error' : 'warning',
          label: PERMIT_STATUS_FA[permit.status],
          testId: 'assoc-permit-status',
        }}
        meta={[
          permit.permitNo ? (
            <span data-testid="assoc-permit-no">
              <Identifier label="شماره مجوز" value={permit.permitNo} />
            </span>
          ) : null,
          'ارسال: ' + (whenFa(permit.submittedAt) ?? '—'),
          'نسخه ' + permit.version.toLocaleString('fa-IR'),
        ]}
        owner={open ? 'ASSOCIATION' : permit.status === 'NEEDS_CORRECTION' ? 'USER' : null}
      />
      <Desk
        decisionTitle={open ? 'تصمیم عملیاتی' : 'نتیجه'}
        decision={
          open ? (
            <>
              <PermitReviewForm permitId={permit.id} version={permit.version} />
              <DeskVersionNote version={permit.version} />
            </>
          ) : (
            <Alert tone="info" title="این پرونده در صف تصمیم نیست">
              <span data-testid="assoc-permit-closed">
                تصمیم فقط روی پرونده‌ای ثبت می‌شود که پرداخت و ارسال آن کامل شده و در حال بررسی است.
              </span>
            </Alert>
          )
        }
      >
        <Panel title="طرفین و حیوان‌ها">
          <div data-testid="assoc-permit-detail">
            <KeyValueList
              rows={[
                {
                  key: 'حیوان نر',
                  value: (
                    <>
                      {(view.sire.name ?? 'بدون نام') + ' — '}
                      <bdi dir="ltr">{view.sire.pedigreeCode ?? '—'}</bdi>
                      <span className="ms-sm text-caption text-text-secondary">{view.sire.ownerName}</span>
                    </>
                  ),
                },
                {
                  key: 'حیوان ماده',
                  value: (
                    <>
                      {(view.dam.name ?? 'بدون نام') + ' — '}
                      <bdi dir="ltr">{view.dam.pedigreeCode ?? '—'}</bdi>
                      <span className="ms-sm text-caption text-text-secondary">{view.dam.ownerName}</span>
                    </>
                  ),
                },
                { key: 'تأیید طرف مقابل', value: permit.counterpartyConfirmedAt ? 'ثبت شده' : 'ثبت نشده', testId: 'assoc-party-confirmed' },
                {
                  key: 'پرداخت هزینه مجوز',
                  value: batch?.status === 'PAID' ? 'تأییدشده روی سرور' : 'تأیید نشده',
                  testId: 'assoc-permit-payment',
                },
              ]}
            />
          </div>
        </Panel>
        <Panel title="توافق تقسیم توله‌ها">
          <KeyValueList
            rows={[
              { key: 'نوع توافق تقسیم', value: permit.ruleType ? RULE_TYPE_FA[permit.ruleType] : null, testId: 'assoc-rule-type' },
              ...(permit.ruleType
                ? (['SIRE_SIDE', 'DAM_SIDE'] as const).map((side) => ({
                    key: SIDE_FA[side],
                    testId: 'assoc-share-' + side,
                    value: describeShare(permit.ruleType!, {
                      side,
                      fixedCount: shareOf(side)?.fixedCount ?? null,
                      percent: shareOf(side)?.percent ?? null,
                    }),
                  }))
                : []),
            ]}
          />
          {permit.ruleNoteFa ? <p className="text-body-sm">{permit.ruleNoteFa}</p> : null}
          <p className="text-caption text-text-secondary">{PRE_BIRTH_RULE_NOTE_FA}</p>
        </Panel>
      </Desk>
    </OpsShell>
  );
}
