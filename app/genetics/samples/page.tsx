import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, QueueMeta } from '../../../src/ui/desk.tsx';
import { SearchField } from '../../../src/ui/search-field.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import type { ActionOwnerKind } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import {
  CENTRE_SAMPLE_PAGE_SIZE,
  centreSampleCount,
  centreSamples,
  type CentreSampleStatus,
} from '../../../src/genetics/service.ts';
import { isUnusable, SAMPLE_STATUS_FA, type SampleStatusName } from '../../../src/domain/microchip.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { ReceiveSampleForm, RejectSampleForm, StartProcessingForm } from '../forms.tsx';
import { InstructSendForm } from './instruct-form.tsx';

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
  searchParams: Promise<{ q?: string }>;
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
  const term = (await searchParams).q?.trim() ?? '';
  const [rows, total] = await Promise.all([
    centreSamples(db(), guard.actor, STATUSES, { search: term }),
    centreSampleCount(db(), guard.actor, STATUSES, term),
  ]);
  const hidden = Math.max(0, total - rows.length);

  // P09: oldest first, by the time the sample was taken.
  const ordered = [...rows].sort((x, y) => x.sample.collectedAt.getTime() - y.sample.collectedAt.getTime());
  const ownerOf = (status: string): ActionOwnerKind =>
    status === 'IN_CUSTODY' || status === 'SEND_INSTRUCTED' || isUnusable(status as SampleStatusName) ? 'VET' : 'GENETICS_CENTRE';

  return (
    <OpsShell actor={guard.actor} title="نمونه‌ها" pathname="/genetics/samples" nav={GENETICS_NAV}>
      <QueueMeta total={total} noun="نمونه در جریان" oldestDays={ageInDays(ordered[0]?.sample.collectedAt)} />
      <Alert tone="info" title="مرکز نمونه‌گیری نمی‌کند">
        نمونه تا دستور ارسال نزد دامپزشک می‌ماند و ارسال را همان نگهدارنده ثبت می‌کند. پردازش در این مرکز به
        پرداخت صدور سند در هم‌زیست وابسته نیست.
      </Alert>

      <form method="get" action="/genetics/samples" className="flex flex-wrap items-center gap-sm" data-testid="sample-search">
        <SearchField
          id="sample-search-term"
          label="کد رهگیری نمونه یا نام حیوان"
          name="q"
          defaultValue={term}
          className="min-w-0 flex-1 basis-64"
          data-testid="sample-search-term"
        />
        <Button type="submit" tone="secondary" data-testid="sample-search-submit">
          جست‌وجو
        </Button>
      </form>

      {hidden > 0 ? (
        <p className="text-caption text-text-secondary" data-testid="samples-truncated">
          {CENTRE_SAMPLE_PAGE_SIZE.toLocaleString('fa-IR')} نمونه تازه‌ترین نمایش داده شده است؛ {hidden.toLocaleString('fa-IR')} نمونه دیگر با این
          جست‌وجو هم‌خوان است و در این فهرست نیست. برای رسیدن به یک نمونه مشخص، کد رهگیری را جست‌وجو کنید.
        </p>
      ) : null}

      {ordered.length === 0 ? (
        <EmptyState
          title={term === '' ? 'نمونه‌ای در جریان نیست' : 'نمونه‌ای با این جست‌وجو پیدا نشد'}
          description={
            term === ''
              ? 'پس از تأیید فیش، نمونه‌های همان فیش با کد رهگیری خود در این فهرست دیده می‌شوند.'
              : 'کد رهگیری یا نام حیوان را دوباره بررسی کنید.'
          }
        />
      ) : (
        <CaseList label="صف نمونه‌ها" testId="centre-sample-list">
          {ordered.map(({ sample, animalName, generation, animalId }) => {
            const unusable = isUnusable(sample.status as SampleStatusName);
            const owner = ownerOf(sample.status);
            return (
              <CaseItem
                key={sample.id}
                type={generationLabel(generation)}
                name={animalName ?? 'بدون نام'}
                code={sample.trackingCode}
                sub={'زمان نمونه‌گیری: ' + formatCivilDateFa(sample.collectedAt.toISOString().slice(0, 10))}
                ageDays={ageInDays(sample.collectedAt)}
                status={{
                  // GAPS #4: no dictionary key for IN_CUSTODY, INVALID, INSUFFICIENT, DAMAGED, LOST — module label kept.
                  ...keyStatus(sample.status === 'RECEIVED' ? 'SAMPLE_RECEIVED' : sample.status, {
                    tone: unusable ? 'warning' : 'info',
                    label: SAMPLE_STATUS_FA[sample.status as SampleStatusName],
                  }),
                  testId: 'centre-sample-status-' + animalId,
                }}
                owner={sample.status === 'PROCESSING' ? 'GENETICS_CENTRE' : owner}
                ownerIsUs
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
                {sample.status === 'SHIPPED' ? <ReceiveSampleForm sampleId={sample.id} /> : null}
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
      )}
    </OpsShell>
  );
}
