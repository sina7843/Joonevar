import { desc, eq, inArray } from 'drizzle-orm';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { GENETICS_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { animals } from '../../../src/db/schema/animals.ts';
import { parentageResults } from '../../../src/db/schema/genetics.ts';
import { centreSamples, parentResultCheck } from '../../../src/genetics/service.ts';
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
    <OpsShell actor={guard.actor} title="نتایج" pathname="/genetics/results" nav={GENETICS_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{checks.length.toLocaleString('fa-IR') + ' نمونه در حال پردازش'}</span>
        <span className="hz-page-header__meta-item">{waiting.length.toLocaleString('fa-IR') + ' نتیجه در انتظار والدین'}</span>
      </p>
      <Alert tone="info" title="خروجی ژنتیکی فقط Parentage Result است">
        هیچ خروجی موازی با نام DNA Profile و هیچ کد نتیجه دومی ساخته نمی‌شود. ثبت نتیجه به پرداخت صدور سند در
        هم‌زیست وابسته نیست.
      </Alert>

      {checks.length === 0 && waiting.length === 0 ? (
        <EmptyState
          title="کاری در صف نتایج نیست"
          description="پس از شروع پردازش نمونه، ثبت Parentage Result از همین صفحه انجام می‌شود."
        />
      ) : null}

      <Panel title="نمونه‌های در حال پردازش" count={checks.length.toLocaleString('fa-IR')}>
        {checks.length === 0 ? (
          <p className="text-body-sm text-text-secondary">نمونه‌ای در حال پردازش نیست.</p>
        ) : (
          <CaseList label="نمونه‌های در حال پردازش" testId="processing-list">
            {checks.map(({ row, parents }) => (
              <CaseItem
                key={row.sample.id}
                type={generationLabel(row.generation)}
                name={row.animalName ?? 'بدون نام'}
                code={row.sample.trackingCode}
                sub={
                  <span data-testid={'parent-check-' + row.animalId}>
                    {parents.state === 'READY'
                      ? row.generation === 0
                        ? 'حیوان G0: نتیجه مستقیم به همین حیوان نسبت داده می‌شود.'
                        : 'نتیجه هر دو والد کامل و قابل Resolve است.'
                      : parents.missingFa}
                  </span>
                }
                ageDays={ageInDays(row.sample.collectedAt)}
                status={keyStatus('PROCESSING')}
                owner="GENETICS_CENTRE"
                ownerIsUs
              >
                <RecordResultForm sampleId={row.sample.id} />
              </CaseItem>
            ))}
          </CaseList>
        )}
      </Panel>

      {waiting.length === 0 ? null : (
        <Panel title="در انتظار تکمیل نتایج والدین" count={waiting.length.toLocaleString('fa-IR')}>
          <CaseList label="در انتظار تکمیل نتایج والدین" testId="waiting-list">
            {waiting.map((result) => {
              const animal = waitingAnimals.find((a) => a.id === result.animalId);
              return (
                <CaseItem
                  key={result.id}
                  type={generationLabel(animal?.generation ?? 0)}
                  name={animal?.name ?? 'بدون نام'}
                  sub={'نسخه ' + result.resultVersion.toLocaleString('fa-IR') + ' · ' + formatCivilDateFa(result.createdAt.toISOString().slice(0, 10))}
                  ageDays={ageInDays(result.createdAt)}
                  status={{ ...keyStatus(result.status), testId: 'result-status-' + result.animalId }}
                  owner="GENETICS_CENTRE"
                  ownerIsUs
                >
                  <RefreshResultForm resultId={result.id} />
                </CaseItem>
              );
            })}
          </CaseList>
        </Panel>
      )}
    </OpsShell>
  );
}
