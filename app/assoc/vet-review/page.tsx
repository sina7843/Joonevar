import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { CaseItem, CaseList } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { vetCaseKey } from '../vet-case-key.ts';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { SelectField, TextField } from '../../../src/ui/field.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { REVIEW_CASE_TYPES, REVIEW_CLAIMS, REVIEW_VIEWS, reviewQueue } from '../../../src/vets/review-workbench.ts';
import { CASE_TYPE_FA } from '../../../src/vets/professional-profile-model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { QUEUE_SORT_FA, QUEUE_SORTS, readQueueQuery } from '../../../src/domain/queue-query.ts';
import { QueueHead, hrefWith } from '../../../src/ui/queue-head.tsx';
import { Pagination } from '../../../src/ui/pagination.tsx';

export const dynamic = 'force-dynamic';

const VIEW_FA: Record<(typeof REVIEW_VIEWS)[number], string> = { OPEN: 'در انتظار بررسی', CORRECTION: 'منتظر اصلاح متقاضی', DECIDED: 'تصمیم‌گرفته', ALL: 'همه' };
const CLAIM_FA: Record<(typeof REVIEW_CLAIMS)[number], string> = { ALL: 'همه', MINE: 'در دست من', UNCLAIMED: 'برداشته‌نشده', OTHERS: 'در دست دیگران' };

type Params = { type?: string; view?: string; claim?: string; q?: string; sort?: string; page?: string };

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
  const view = params.view || 'OPEN';
  // P09: the longest-waiting first while open; otherwise the most recent, unless the operator picks an order.
  const defaultSort = view === 'OPEN' ? 'oldest' : 'newest';
  const query = readQueueQuery(params, defaultSort);
  const filters = {
    caseType: params.type || 'ALL',
    view,
    claim: params.claim || 'ALL',
    q: query.q,
    sort: query.sort,
    page: query.page,
  };
  let result: Awaited<ReturnType<typeof reviewQueue>> | null = null;
  let problem: string | null = null;
  try {
    result = await reviewQueue(db(), guard.actor, filters);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    problem = error.message;
  }
  const keep = {
    type: params.type,
    view: params.view,
    claim: params.claim,
    q: query.q,
    sort: query.sort === defaultSort ? undefined : query.sort,
  };

  return (
    <OpsShell actor={guard.actor} title="میز بررسی دامپزشکان" pathname="/assoc/vet-review" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Card variant="compact">
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
            {keep.sort ? <input type="hidden" name="sort" value={keep.sort} /> : null}
            <TextField label="جستجو (نام یا کد)" name="q" defaultValue={filters.q} maxLength={60} data-testid="review-filter-q" />
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" tone="secondary" size="sm" iconStart="funnelSimple" data-testid="review-filter-submit">
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
            <QueueHead
              total={result.total}
              shown={result.total}
              sort={{
                label: 'مرتب‌سازی پرونده‌ها',
                testId: 'review-sort',
                options: QUEUE_SORTS.map((key) => ({
                  key,
                  label: QUEUE_SORT_FA[key],
                  current: key === query.sort,
                  href: hrefWith('/assoc/vet-review', keep, { sort: key === defaultSort ? undefined : key, page: undefined }),
                })),
              }}
            />
            <CaseList label="صف بررسی دامپزشکان" testId="review-queue">
              {result.items.map((item) => (
                <CaseItem
                  key={item.id}
                  testId={'review-item-' + item.caseType}
                  type={item.caseTypeFa}
                  name={item.displayNameFa ?? '—'}
                  href={item.detailHref}
                  linkLabel="بررسی پرونده"
                  linkTestId="open-review-case"
                  code={item.code}
                  sub={
                    <>
                      {'نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}
                      {' · '}
                      {item.claimedByMe || item.claimedByOther ? (
                        <span data-testid="review-item-claim">{item.claimedByMe ? 'در دست شما' : 'در دست بررسی‌کننده دیگر'}</span>
                      ) : (
                        <span className="hz-queue__assignee--none">تخصیص‌نیافته</span>
                      )}
                    </>
                  }
                  ageDays={ageInDays(new Date(item.firstSubmittedAt ?? item.updatedAt))}
                  status={keyStatus(vetCaseKey(item.status))}
                  owner={item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' ? 'ASSOCIATION' : item.status === 'NEEDS_CORRECTION' ? 'USER' : null}
                  ownerIsUs
                />
              ))}
            </CaseList>
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              hrefFor={(target) => hrefWith('/assoc/vet-review', keep, { page: target > 1 ? String(target) : undefined })}
            />
          </>
        ) : null}
      </div>
    </OpsShell>
  );
}
