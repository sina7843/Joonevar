import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { custodyList } from '../../../src/clinical/samples.ts';
import { isUnusable, SAMPLE_STATUS_FA } from '../../../src/domain/microchip.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { ShipmentForm } from './shipment-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * Custody — §12.4, D07.
 *
 * The sample stays with the veterinarian who took it. There is no expiry here:
 * nothing turns a sample unusable on a timer, and the shipment happens only
 * after the genetics centre asks for it.
 */
export default async function VetSamplesPage() {
  const guard = await guardRoute('/vet/samples');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const rows = await custodyList(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="نمونه‌های نزد من" pathname="/vet/samples">
      <div className="space-y-lg">
        {rows.length === 0 ? (
          <EmptyState
            title="نمونه‌ای نزد شما ثبت نشده است"
            description="پس از ثبت نمونه‌گیری در پرونده مراجعه، نمونه با کد رهگیری در همین فهرست دیده می‌شود."
          />
        ) : (
          <ul className="space-y-lg" data-testid="custody-list">
            {rows.map((sample) => (
              <li key={sample.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <p className="text-body-sm">
                      <Identifier label="کد رهگیری نمونه:" value={sample.trackingCode} />
                    </p>
                    <StatusBadge tone={isUnusable(sample.status) ? 'warning' : 'info'}>
                      <span data-testid={'custody-status-' + sample.id}>{SAMPLE_STATUS_FA[sample.status]}</span>
                    </StatusBadge>
                  </div>
                  <p className="mt-sm text-caption text-text-secondary">
                    زمان نمونه‌گیری: {formatCivilDateFa(sample.collectedAt.toISOString().slice(0, 10))}
                  </p>
                  <p className="mt-sm text-body-sm">
                    <Link
                      href={'/vet/requests/' + sample.requestId}
                      className="text-text-brand underline underline-offset-4"
                    >
                      مشاهده پرونده مراجعه
                    </Link>
                  </p>

                  {sample.status === 'IN_CUSTODY' ? (
                    <p className="mt-lg text-caption text-text-secondary" data-testid="awaiting-instruction">
                      تا صدور دستور ارسال از مرکز ژنتیک، نمونه نزد شما می‌ماند. نمونه انقضای خودکار ندارد.
                    </p>
                  ) : null}
                  {sample.status === 'SEND_INSTRUCTED' ? (
                    <ShipmentForm sampleId={sample.id} />
                  ) : null}
                  {sample.status === 'SHIPPED' ? (
                    <p className="mt-lg text-caption text-text-secondary">
                      ارسال روی همین کد رهگیری ثبت شد: {sample.shipmentRefFa}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
