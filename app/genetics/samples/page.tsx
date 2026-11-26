import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import type { ActionOwnerKind } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { centreSamplePage, type CentreSampleStatus } from '../../../src/genetics/service.ts';
import { readQueueQuery } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { isUnusable, SAMPLE_STATUS_FA, type SampleStatusName } from '../../../src/domain/microchip.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { ReceiveSampleForm, RejectSampleForm, StartProcessingForm } from '../forms.tsx';
import { InstructSendForm } from './instruct-form.tsx';
import { BulkSelect } from '../../../src/ui/bulk-action-bar.tsx';
import { bulkReceiveSamplesAction } from '../actions.ts';

export const dynamic = 'force-dynamic';

/**
 * Samples at the centre — §12.4, §14.2, §21.3, D07.
 *
 * The centre never takes a sample. It records that one arrived, judges whether
 * it can be used and starts processing; a sample it cannot use goes back to the
 * existing resampling path at the veterinarian, with its history intact.
 */
export default async function GeneticsSamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const guard = await guardRoute('/genetics/samples');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const STATUSES: readonly CentreSampleStatus[] = [
    'IN_CUSTODY',
    'SEND_INSTRUCTED',
    'SHIPPED',
    'RECEIVED',
    'PROCESSING',
    'INVALID',
  ];
  const query = readQueueQuery(await searchParams);
  const result = await centreSamplePage(db(), guard.actor, STATUSES, query);
  const ownerOf = (status: string): ActionOwnerKind =>
    status === 'IN_CUSTODY' || status === 'SEND_INSTRUCTED' || isUnusable(status as SampleStatusName) ? 'VET' : 'GENETICS_CENTRE';

  return (
    <OpsShell actor={guard.actor} title="نمونه‌ها" pathname="/genetics/samples" nav={GENETICS_NAV}>
      <QueueMeta total={result.all} noun="نمونه در جریان" />
      <Alert tone="info" title="مرکز نمونه‌گیری نمی‌کند">
        نمونه تا دستور ارسال نزد دامپزشک می‌ماند و ارسال را همان نگهدارنده ثبت می‌کند. پردازش در این مرکز به
        پرداخت صدور سند در هم‌زیست وابسته نیست.
      </Alert>

      {result.all === 0 ? (
        <EmptyState
          title="نمونه‌ای در جریان نیست"
          description="پس از تأیید فیش، نمونه‌های همان فیش با کد رهگیری خود در این فهرست دیده می‌شوند."
        />
      ) : (
        <QueueFrame
          path="/genetics/samples"
          params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
          query={query}
          page={result}
          all={result.all}
          noun="نمونه"
          searchLabel="کد رهگیری نمونه یا نام حیوان"
          testId="sample-queue-frame"
        >
          {result.items.length === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="کد رهگیری یا نام حیوان را دوباره بررسی کنید." />
          ) : (
        <BulkSelect
          formId="sample-bulk"
          action={bulkReceiveSamplesAction}
          noun="نمونه"
          actions={[{ key: 'receive', label: 'ثبت دریافت نمونه', icon: 'check', testId: 'bulk-receive-samples' }]}
          note="فقط نمونه‌های «ارسال‌شده» قابل انتخاب‌اند؛ هر نمونه جداگانه ثبت و نتیجه‌اش گزارش می‌شود."
          testId="sample-bulk"
        >
        <CaseList label="صف نمونه‌ها" testId="centre-sample-list" selectForm="sample-bulk">
          {result.items.map(({ sample, animalName, generation, animalId, waitingOn }) => {
            const unusable = isUnusable(sample.status as SampleStatusName);
            const owner = ownerOf(sample.status);
            return (
              <CaseItem
                key={sample.id}
                select={sample.status === 'SHIPPED' ? { value: sample.id, label: 'انتخاب نمونه ' + sample.trackingCode } : undefined}
                type={generationLabel(generation)}
                name={animalName ?? 'بدون نام'}
                code={sample.trackingCode}
                sub={
                  <>
                    {'زمان نمونه‌گیری: ' + formatCivilDateFa(sample.collectedAt.toISOString().slice(0, 10))}
                    {waitingOn.map((wait) => (
                      <span key={wait.roleFa} className="block" data-testid={'sample-waits-' + animalId}>
                        {'منتظر: '}
                        {wait.code ? <bdi dir="ltr">{wait.code}</bdi> : 'بدون نمونه'}
                        {'، نمونه ' + wait.roleFa}
                      </span>
                    ))}
                  </>
                }
                ageDays={ageInDays(sample.collectedAt)}
                status={{
                  // GAPS #4: no dictionary key for IN_CUSTODY, INVALID, INSUFFICIENT, DAMAGED, LOST — module label kept.
                  ...keyStatus(sample.status === 'RECEIVED' ? 'SAMPLE_RECEIVED' : sample.status, {
                    tone: unusable ? 'warning' : 'info',
                    label: SAMPLE_STATUS_FA[sample.status as SampleStatusName],
                  }),
                  testId: 'centre-sample-status-' + animalId,
                }}
                owner={owner}
                // KOPS-037: «ما» only when the next move is the centre's, never while the sample is with the vet.
                ownerIsUs={owner === 'GENETICS_CENTRE'}
              >
                {sample.status === 'IN_CUSTODY' ? (
                  <>
                    <p className="text-caption text-text-secondary">
                      تأیید فیش این نمونه، دستور ارسال را خودکار صادر می‌کند؛ در صورت نیاز می‌توان آن را
                      مستقیم هم صادر کرد.
                    </p>
                    <InstructSendForm sampleId={sample.id} />
                  </>
                ) : null}
                {sample.status === 'SEND_INSTRUCTED' ? (
                  <p className="text-caption text-text-secondary">در انتظار ثبت ارسال توسط دامپزشک نگهدارنده.</p>
                ) : null}
                {sample.status === 'SHIPPED' ? (
                  <>
                    <input type="hidden" form="sample-bulk" name={'code-' + sample.id} value={sample.trackingCode} />
                    <ReceiveSampleForm sampleId={sample.id} />
                  </>
                ) : null}
                {sample.status === 'RECEIVED' ? (
                  <div className="grid gap-md md:grid-cols-2">
                    <StartProcessingForm sampleId={sample.id} />
                    <RejectSampleForm sampleId={sample.id} />
                  </div>
                ) : null}
                {sample.status === 'PROCESSING' ? (
                  <p className="text-caption text-text-secondary">ثبت نتیجه از بخش «نتایج» انجام می‌شود.</p>
                ) : null}
                {unusable ? (
                  <p className="text-caption text-text-secondary" data-testid={'centre-sample-reason-' + animalId}>
                    {sample.unusableReasonFa} نمونه‌گیری مجدد از همان درخواست انجام می‌شود.
                  </p>
                ) : null}
              </CaseItem>
            );
          })}
        </CaseList>
        </BulkSelect>
          )}
        </QueueFrame>
      )}
    </OpsShell>
  );
}
