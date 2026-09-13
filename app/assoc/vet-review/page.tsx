import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { SelectField, TextField } from '../../../src/ui/field.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { REVIEW_CASE_TYPES, REVIEW_CLAIMS, REVIEW_VIEWS, reviewQueue } from '../../../src/vets/review-workbench.ts';
import { CASE_TYPE_FA } from '../../../src/vets/professional-profile-model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const VIEW_FA: Record<(typeof REVIEW_VIEWS)[number], string> = { OPEN: 'در انتظار بررسی', CORRECTION: 'منتظر اصلاح متقاضی', DECIDED: 'تصمیم‌گرفته', ALL: 'همه' };
const CLAIM_FA: Record<(typeof REVIEW_CLAIMS)[number], string> = { ALL: 'همه', MINE: 'در دست من', UNCLAIMED: 'برداشته‌نشده', OTHERS: 'در دست دیگران' };

type Params = { type?: string; view?: string; claim?: string; q?: string; page?: string };

/**
 * The association review workbench — Phase 2.5 PROMPT-007.
 *
 * Every professional case the association decides, in one filterable, paginated
 * queue. A case opens on its own review page, where it is claimed, checked and
 * decided. The trusted-veterinarian review joins when its case type exists.
 */
export default async function AssocVetReviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const guard = await guardRoute('/assoc/vet-review');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const params = await searchParams;
  const filters = {
    caseType: params.type || 'ALL',
    view: params.view || 'OPEN',
    claim: params.claim || 'ALL',
    q: params.q ?? '',
    page: Math.max(1, Number(params.page) || 1),
  };
  let result: Awaited<ReturnType<typeof reviewQueue>> | null = null;
  let problem: string | null = null;
  try {
    result = await reviewQueue(db(), guard.actor, filters);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    problem = error.message;
  }
  const hrefFor = (page: number) =>
    '/assoc/vet-review?' + new URLSearchParams({ type: filters.caseType, view: filters.view, claim: filters.claim, q: filters.q, page: String(page) }).toString();

  return (
    <OpsShell actor={guard.actor} title="میز بررسی دامپزشکان" pathname="/assoc/vet-review" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card>
          <form method="get" className="grid gap-md sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="فیلتر پرونده‌ها" data-testid="review-filters">
            <SelectField
              label="نوع پرونده"
              name="type"
              defaultValue={filters.caseType === 'ALL' ? '' : filters.caseType}
              placeholder="همه نوع‌ها"
              options={REVIEW_CASE_TYPES.map((type) => ({ value: type, label: CASE_TYPE_FA[type] }))}
              data-testid="review-filter-type"
            />
            <SelectField
              label="وضعیت"
              name="view"
              defaultValue={filters.view === 'OPEN' ? '' : filters.view}
              placeholder="در انتظار بررسی"
              options={REVIEW_VIEWS.filter((view) => view !== 'OPEN').map((view) => ({ value: view, label: VIEW_FA[view] }))}
              data-testid="review-filter-view"
            />
            <SelectField
              label="بررسی‌کننده"
              name="claim"
              defaultValue={filters.claim === 'ALL' ? '' : filters.claim}
              placeholder="همه"
              options={REVIEW_CLAIMS.filter((claim) => claim !== 'ALL').map((claim) => ({ value: claim, label: CLAIM_FA[claim] }))}
              data-testid="review-filter-claim"
            />
            <TextField label="جستجو (نام یا کد)" name="q" defaultValue={filters.q} maxLength={60} data-testid="review-filter-q" />
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" data-testid="review-filter-submit">
                اعمال فیلتر
              </Button>
            </div>
          </form>
        </Card>

        {problem ? <Alert tone="error" title={problem} /> : null}

        {result && result.items.length === 0 ? (
          <EmptyState title="پرونده‌ای با این فیلتر نیست" description="پرونده‌های دانشجویی، کد نظام و پروانه فعالیت در همین میز دیده می‌شوند." />
        ) : null}

        {result && result.items.length > 0 ? (
          <>
            <p className="text-caption text-text-secondary" role="status" data-testid="review-total">
              {result.total.toLocaleString('fa-IR') + ' پرونده · صفحه ' + result.page.toLocaleString('fa-IR') + ' از ' + result.totalPages.toLocaleString('fa-IR')}
            </p>
            <ul className="space-y-md" data-testid="review-queue">
              {result.items.map((item) => (
                <li key={item.id} data-testid={'review-item-' + item.caseType}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-md">
                      <div className="min-w-0">
                        <h2 className="text-label-lg">{item.displayNameFa ?? '—'}</h2>
                        <p className="mt-2xs text-caption text-text-secondary">
                          {item.caseTypeFa + ' · '}
                          <span dir="ltr">{item.code ?? '—'}</span>
                          {' · نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}
                        </p>
                        {item.claimedByMe || item.claimedByOther ? (
                          <p className="mt-2xs text-caption" data-testid="review-item-claim">
                            {item.claimedByMe ? 'در دست شما' : 'در دست بررسی‌کننده دیگر'}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge tone={item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' ? 'info' : item.status === 'NEEDS_CORRECTION' ? 'warning' : 'neutral'}>
                        {item.statusFa}
                      </StatusBadge>
                    </div>
                    <p className="mt-lg">
                      <Link href={item.detailHref} className="text-label-md text-text-brand underline underline-offset-4" data-testid="open-review-case">
                        بررسی پرونده
                      </Link>
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
            {result.totalPages > 1 ? (
              <nav className="flex items-center justify-between gap-md" aria-label="صفحه‌بندی" data-testid="review-pagination">
                {result.page > 1 ? (
                  <Link href={hrefFor(result.page - 1)} rel="prev" className="text-label-md text-text-brand underline underline-offset-4">
                    صفحه قبل
                  </Link>
                ) : (
                  <span />
                )}
                {result.page < result.totalPages ? (
                  <Link href={hrefFor(result.page + 1)} rel="next" className="text-label-md text-text-brand underline underline-offset-4" data-testid="review-next-page">
                    صفحه بعد
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </OpsShell>
  );
}
