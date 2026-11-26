import { eq, inArray } from 'drizzle-orm';
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
import { centreSamplePage, parentResultCheck } from '../../../src/genetics/service.ts';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { generationLabel } from '../../../src/domain/lineage.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { RecordResultForm, RefreshResultForm } from '../forms.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { Identifier } from '../../../src/ui/status.tsx';
import { CaseDrawer } from '../../assoc/case-drawer.tsx';

export const dynamic = 'force-dynamic';

/**
 * Recording Parentage Results — §14.3, §21.3.
 *
 * There is one genetic output and one identifier for it: no DNA Profile and no
 * second result code. A G1+ animal whose parents are not both complete is
 * recorded as waiting, which is visible and true, rather than as final.
 */
export default async function GeneticsResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const guard = await guardRoute('/genetics/results');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const query = readQueueQuery(await searchParams);
  const processing = await centreSamplePage(db(), guard.actor, ['PROCESSING'], query);
  const checks = await Promise.all(
    processing.items.map(async (row) => ({ row, parents: await parentResultCheck(db(), row.animalId) })),
  );

  const waitingAll = await db()
    .select()
    .from(parentageResults)
    .where(eq(parentageResults.status, 'WAITING_PARENT_RESULTS'));
  const waitingAnimals = waitingAll.length
    ? await db()
        .select({ id: animals.id, name: animals.name, generation: animals.generation })
        .from(animals)
        .where(inArray(animals.id, waitingAll.map((w) => w.animalId)))
    : [];
  // The same search and order as the processing queue; this side list stays unpaged (one page of up to 100).
  const waiting = sliceQueue(
    waitingAll,
    { ...query, page: 1 },
    {
      text: (result) => waitingAnimals.find((a) => a.id === result.animalId)?.name ?? '',
      at: (result) => result.createdAt,
      name: (result) => waitingAnimals.find((a) => a.id === result.animalId)?.name ?? '',
    },
    100,
  ).items;

  return (
    <OpsShell actor={guard.actor} title="نتایج" pathname="/genetics/results" nav={GENETICS_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{processing.all.toLocaleString('fa-IR') + ' نمونه در حال پردازش'}</span>
        <span className="hz-page-header__meta-item">{waitingAll.length.toLocaleString('fa-IR') + ' نتیجه در انتظار والدین'}</span>
      </p>
      <Alert tone="info" title="خروجی ژنتیکی فقط Parentage Result است">
        هیچ خروجی موازی با نام DNA Profile و هیچ کد نتیجه دومی ساخته نمی‌شود. ثبت نتیجه به پرداخت صدور سند در
        هم‌زیست وابسته نیست.
      </Alert>

      {processing.all === 0 && waitingAll.length === 0 ? (
        <EmptyState
          title="کاری در صف نتایج نیست"
          description="پس از شروع پردازش نمونه، ثبت Parentage Result از همین صفحه انجام می‌شود."
        />
      ) : null}

      <Panel title="نمونه‌های در حال پردازش" count={processing.all.toLocaleString('fa-IR')}>
        {processing.all === 0 ? (
          <p className="text-body-sm text-text-secondary">نمونه‌ای در حال پردازش نیست.</p>
        ) : (
          <QueueFrame
            path="/genetics/results"
            params={{ q: query.q, sort: query.sort === 'oldest' ? undefined : query.sort }}
            query={query}
            page={processing}
            all={processing.all}
            noun="نمونه"
            searchLabel="کد رهگیری نمونه یا نام حیوان"
            testId="result-queue-frame"
          >
          {checks.length === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="کد رهگیری یا نام حیوان را دوباره بررسی کنید." />
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
                <CaseDrawer title={'ثبت نتیجه · ' + (row.animalName ?? 'بدون نام')} testId="open-result-case">
                  <KeyValueList
                    rows={[
                      { key: 'حیوان', value: row.animalName ?? 'بدون نام' },
                      { key: 'نسل', value: generationLabel(row.generation) },
                      { key: 'کد رهگیری نمونه', value: <Identifier value={row.sample.trackingCode} /> },
                      {
                        key: 'نتایج والدین',
                        value:
                          parents.state === 'READY'
                            ? row.generation === 0
                              ? 'حیوان G0: نتیجه مستقیم به همین حیوان نسبت داده می‌شود.'
                              : 'نتیجه هر دو والد کامل و قابل Resolve است.'
                            : parents.missingFa,
                      },
                    ]}
                  />
                  <RecordResultForm sampleId={row.sample.id} />
                </CaseDrawer>
              </CaseItem>
            ))}
          </CaseList>
          )}
          </QueueFrame>
        )}
      </Panel>

      {waiting.length === 0 ? null : (
        <Panel title="در انتظار تکمیل نتایج والدین" count={waiting.length === waitingAll.length ? waiting.length.toLocaleString('fa-IR') : waiting.length.toLocaleString('fa-IR') + ' از ' + waitingAll.length.toLocaleString('fa-IR')}>
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
