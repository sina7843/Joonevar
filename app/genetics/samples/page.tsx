import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { centreSamples } from '../../../src/genetics/service.ts';
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
export default async function GeneticsSamplesPage() {
  const guard = await guardRoute('/genetics/samples');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await centreSamples(db(), guard.actor, [
    'IN_CUSTODY',
    'SEND_INSTRUCTED',
    'SHIPPED',
    'RECEIVED',
    'PROCESSING',
    'INVALID',
  ]);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname="/genetics/samples" nav={GENETICS_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="مرکز نمونه‌گیری نمی‌کند">
          نمونه تا دستور ارسال نزد دامپزشک می‌ماند و ارسال را همان نگهدارنده ثبت می‌کند. پردازش در این مرکز به
          پرداخت صدور سند در هم‌زیست وابسته نیست.
        </Alert>

        {rows.length === 0 ? (
          <EmptyState
            title="نمونه‌ای در جریان نیست"
            description="پس از تأیید فیش، نمونه‌های همان فیش با کد رهگیری خود در این فهرست دیده می‌شوند."
          />
        ) : (
          <ul className="space-y-lg" data-testid="centre-sample-list">
            {rows.map(({ sample, animalName, generation, animalId }) => (
              <li key={sample.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="text-body-sm">
                        <Identifier label="کد رهگیری نمونه:" value={sample.trackingCode} />
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {animalName ?? 'بدون نام'} · {generationLabel(generation)}
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        زمان نمونه‌گیری: {formatCivilDateFa(sample.collectedAt.toISOString().slice(0, 10))}
                      </p>
                    </div>
                    <StatusBadge tone={isUnusable(sample.status as SampleStatusName) ? 'warning' : 'info'}>
                      <span data-testid={'centre-sample-status-' + animalId}>
                        {SAMPLE_STATUS_FA[sample.status as SampleStatusName]}
                      </span>
                    </StatusBadge>
                  </div>

                  {sample.status === 'IN_CUSTODY' ? (
                    <>
                      <p className="mt-lg text-caption text-text-secondary">
                        تأیید فیش این نمونه، دستور ارسال را خودکار صادر می‌کند؛ در صورت نیاز می‌توان آن را
                        مستقیم هم صادر کرد.
                      </p>
                      <InstructSendForm sampleId={sample.id} />
                    </>
                  ) : null}
                  {sample.status === 'SEND_INSTRUCTED' ? (
                    <p className="mt-lg text-caption text-text-secondary">
                      در انتظار ثبت ارسال توسط دامپزشک نگهدارنده.
                    </p>
                  ) : null}
                  {sample.status === 'SHIPPED' ? <ReceiveSampleForm sampleId={sample.id} /> : null}
                  {sample.status === 'RECEIVED' ? (
                    <>
                      <StartProcessingForm sampleId={sample.id} />
                      <RejectSampleForm sampleId={sample.id} />
                    </>
                  ) : null}
                  {sample.status === 'PROCESSING' ? (
                    <p className="mt-lg text-caption text-text-secondary">
                      ثبت نتیجه از بخش «نتایج» انجام می‌شود.
                    </p>
                  ) : null}
                  {isUnusable(sample.status as SampleStatusName) ? (
                    <p className="mt-lg text-caption text-text-secondary" data-testid={'centre-sample-reason-' + animalId}>
                      {sample.unusableReasonFa} نمونه‌گیری مجدد از همان درخواست انجام می‌شود.
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
