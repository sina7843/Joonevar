import { desc, eq, inArray } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { parentageResults } from '../../../src/db/schema/genetics.ts';
import { centreSamples, parentResultCheck, RESULT_STATUS_FA } from '../../../src/genetics/service.ts';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { RecordResultForm, RefreshResultForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Recording Parentage Results — §14.3, §21.3.
 *
 * There is one genetic output and one identifier for it: no DNA Profile and no
 * second result code. A G1+ animal whose parents are not both complete is
 * recorded as waiting, which is visible and true, rather than as final.
 */
export default async function GeneticsResultsPage() {
  const guard = await guardRoute('/genetics/results');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const processing = await centreSamples(db(), guard.actor, ['PROCESSING']);
  const checks = await Promise.all(
    processing.map(async (row) => ({ row, parents: await parentResultCheck(db(), row.animalId) })),
  );

  const waiting = await db()
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.status, 'WAITING_PARENT_RESULTS'))
    .orderBy(desc(parentageResults.createdAt));
  const waitingAnimals = waiting.length
    ? await db()
        .select({ id: animals.id, name: animals.name, generation: animals.generation })
        .from(animals)
        .where(inArray(animals.id, waiting.map((w) => w.animalId)))
    : [];

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — مرکز ژنتیک" pathname="/genetics/results" nav={GENETICS_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="خروجی ژنتیکی فقط Parentage Result است">
          هیچ خروجی موازی با نام DNA Profile و هیچ کد نتیجه دومی ساخته نمی‌شود. ثبت نتیجه به پرداخت صدور سند در
          هم‌زیست وابسته نیست.
        </Alert>

        <Card>
          <h2 className="text-label-lg">نمونه‌های در حال پردازش</h2>
          {checks.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">نمونه‌ای در حال پردازش نیست.</p>
          ) : (
            <ul className="mt-lg space-y-lg" data-testid="processing-list">
              {checks.map(({ row, parents }) => (
                <li key={row.sample.id} className="rounded-lg border border-border-subtle p-lg">
                  <p className="text-body-sm">
                    <Identifier label="کد رهگیری نمونه:" value={row.sample.trackingCode} />
                  </p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    {row.animalName ?? 'بدون نام'} · {generationLabel(row.generation)}
                  </p>
                  <p className="mt-sm text-caption text-text-secondary" data-testid={'parent-check-' + row.animalId}>
                    {parents.state === 'READY'
                      ? row.generation === 0
                        ? 'حیوان G0: نتیجه مستقیم به همین حیوان نسبت داده می‌شود.'
                        : 'نتیجه هر دو والد کامل و قابل Resolve است.'
                      : parents.missingFa}
                  </p>
                  <RecordResultForm sampleId={row.sample.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {waiting.length === 0 ? null : (
          <Card>
            <h2 className="text-label-lg">در انتظار تکمیل نتایج والدین</h2>
            <ul className="mt-lg space-y-lg" data-testid="waiting-list">
              {waiting.map((result) => {
                const animal = waitingAnimals.find((a) => a.id === result.animalId);
                return (
                  <li key={result.id} className="rounded-lg border border-border-subtle p-lg">
                    <div className="flex items-start justify-between gap-md">
                      <div className="min-w-0">
                        <p className="text-body-sm">{animal?.name ?? 'بدون نام'}</p>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {generationLabel(animal?.generation ?? 0)} · نسخه {result.resultVersion} ·{' '}
                          {formatCivilDateFa(result.createdAt.toISOString().slice(0, 10))}
                        </p>
                      </div>
                      <StatusBadge tone="info">
                        <span data-testid={'result-status-' + result.animalId}>
                          {RESULT_STATUS_FA[result.status]}
                        </span>
                      </StatusBadge>
                    </div>
                    <RefreshResultForm resultId={result.id} />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {checks.length === 0 && waiting.length === 0 ? (
          <EmptyState
            title="کاری در صف نتایج نیست"
            description="پس از شروع پردازش نمونه، ثبت Parentage Result از همین صفحه انجام می‌شود."
          />
        ) : null}
      </div>
    </OpsShell>
  );
}
