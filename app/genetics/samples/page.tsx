import { desc, inArray } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { samples } from '../../../src/db/schema/clinical.ts';
import { SAMPLE_STATUS_FA } from '../../../src/domain/microchip.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { InstructSendForm } from './instruct-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * Samples waiting to be asked for — §12.4, §21.3, D07.
 *
 * The centre decides when a sample should travel. Nothing here expires a
 * sample, and receiving, processing and results belong to the prompt that
 * builds the centre's own workflow.
 */
export default async function GeneticsSamplesPage() {
  const guard = await guardRoute('/genetics/samples');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await db()
    .select()
    .from(samples)
    .where(inArray(samples.status, ['IN_CUSTODY', 'SEND_INSTRUCTED', 'SHIPPED']))
    .orderBy(desc(samples.collectedAt))
    .limit(50);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname="/genetics/samples" nav={GENETICS_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="نمونه تا دستور ارسال نزد دامپزشک می‌ماند">
          نمونه انقضای خودکار ندارد و تصمیم درباره قابلیت استفاده با همین مرکز است. ثبت ارسال، رویدادی روی همان
          کد رهگیری است و کد جایگزین نمی‌سازد.
        </Alert>

        {rows.length === 0 ? (
          <EmptyState
            title="نمونه‌ای ثبت نشده است"
            description="پس از نمونه‌گیری در مراجعه، نمونه با کد رهگیری در همین فهرست دیده می‌شود."
          />
        ) : (
          <ul className="space-y-lg" data-testid="genetics-sample-list">
            {rows.map((sample) => (
              <li key={sample.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <p className="text-body-sm">
                      <Identifier label="کد رهگیری نمونه:" value={sample.trackingCode} />
                    </p>
                    <StatusBadge tone="info">{SAMPLE_STATUS_FA[sample.status]}</StatusBadge>
                  </div>
                  <p className="mt-sm text-caption text-text-secondary">
                    زمان نمونه‌گیری: {formatCivilDateFa(sample.collectedAt.toISOString().slice(0, 10))}
                  </p>
                  {sample.status === 'IN_CUSTODY' ? <InstructSendForm sampleId={sample.id} /> : null}
                  {sample.status === 'SHIPPED' ? (
                    <p className="mt-lg text-caption text-text-secondary">
                      ارسال ثبت‌شده: {sample.shipmentRefFa}
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
