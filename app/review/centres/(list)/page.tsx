import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../../src/ui/desk.tsx';
import { keyStatus } from '../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { QueueFrame } from '../../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../../src/domain/queue-query.ts';
import { db } from '../../../../src/db/client.ts';
import { centreReferenceData, manageableCentres } from '../../../../src/centres/service.ts';
import { LICENCE_STATUS_FA, type LicenceStatusName } from '../../../../src/centres/model.ts';
import { CentreCreateForm } from '../../../../src/centres/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Centres in the review environment — Requirements-Phase-2 §9, §10, §21 (PROMPT-008).
 * The reviewer publishes a reviewed record and records its licence; the content
 * of an owned centre belongs to its manager.
 */
export default async function ReviewCentresPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/review/centres');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [centres, reference] = await Promise.all([manageableCentres(db(), guard.actor), centreReferenceData(db())]);
  const query = readQueueQuery(await searchParams, 'name');
  const page = sliceQueue(centres, query, {
    text: (row) => [row.centre.displayNameFa, row.cityNameFa ?? ''].join(' '),
    at: (row) => row.centre.createdAt,
    name: (row) => row.centre.displayNameFa,
  });

  return (
    <OpsShell actor={guard.actor} title="مراکز دامپزشکی" pathname="/review/centres" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{centres.length.toLocaleString('fa-IR') + ' مرکز'}</span>
        <span className="hz-page-header__meta-item">مرکز بدون مالک با برچسب خودش منتشر می‌شود و تا Claim، مدیری ندارد.</span>
      </p>
      <div className="grid items-start gap-lg lg:grid-cols-2">
        <Panel title="مراکز" count={centres.length.toLocaleString('fa-IR')}>
          {centres.length === 0 ? (
            <EmptyState title="مرکزی ثبت نشده است" description="با فرم ثبت مرکز، مرکز بررسی‌شده را ثبت کنید." />
          ) : (
            <QueueFrame
              path="/review/centres"
              params={{ q: query.q, sort: query.sort === 'name' ? undefined : query.sort }}
              query={query}
              page={page}
              all={page.all}
              noun="مرکز"
              searchLabel="جست‌وجوی نام مرکز یا شهر"
              defaultSort="name"
              testId="centre-queue-frame"
            >
              {page.items.length === 0 ? (
                <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
              ) : (
            <CaseList label="مراکز" testId="centre-list">
              {page.items.map((row) => (
                <CaseItem
                  key={row.centre.id}
                  type={row.centre.ownerAccountId ? undefined : 'بدون مالک'}
                  name={row.centre.displayNameFa}
                  href={'/review/centres/' + row.centre.id}
                  linkTestId={'centre-row-' + row.centre.id}
                  sub={
                    [row.typeNameFa, row.cityNameFa, row.centre.sourceFa ? 'منبع: ' + row.centre.sourceFa : null].filter(Boolean).join(' · ') +
                    ' · مجوز: ' +
                    LICENCE_STATUS_FA[row.centre.licenceStatus as LicenceStatusName]
                  }
                  status={keyStatus(row.centre.publicStatus)}
                />
              ))}
            </CaseList>
              )}
            </QueueFrame>
          )}
        </Panel>
        <CentreCreateForm surface="review" types={reference.types} provinces={reference.provinces} cities={reference.cities} />
      </div>
    </OpsShell>
  );
}
