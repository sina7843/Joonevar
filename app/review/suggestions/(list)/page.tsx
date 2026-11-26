import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { QueueFrame, hrefWith, param } from '../../../../src/ui/queue-head.tsx';
import { readQueueQuery } from '../../../../src/domain/queue-query.ts';
import { db } from '../../../../src/db/client.ts';
import { suggestionQueue } from '../../../../src/suggestions/service.ts';
import { SUGGESTION_KIND_FA, type SuggestionKind } from '../../../../src/suggestions/model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type View = 'OPEN' | 'CORRECTION' | 'DECIDED';
type Search = Promise<{ view?: string | string[]; page?: string | string[]; q?: string | string[]; sort?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

const VIEWS: ReadonlyArray<{ view: View; label: string; empty: string }> = [
  { view: 'OPEN', label: 'در انتظار بررسی', empty: 'پیشنهادی در انتظار بررسی نیست' },
  { view: 'CORRECTION', label: 'نیازمند اصلاح', empty: 'پیشنهادی منتظر اصلاح نیست' },
  { view: 'DECIDED', label: 'تصمیم‌گرفته و بایگانی', empty: 'هنوز تصمیمی ثبت نشده است' },
];

/** Suggestions from ordinary users — Requirements-Phase-2 §10, §21 (PROMPT-009). */
export default async function ReviewSuggestionsPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/review/suggestions');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const search = await searchParams;
  const view = (VIEWS.find((entry) => entry.view === one(search.view))?.view ?? 'OPEN') as View;
  const defaultSort = view === 'DECIDED' ? 'newest' : 'oldest';
  const query = readQueueQuery({ q: param(search.q), sort: param(search.sort), page: param(search.page) }, defaultSort);
  const [result, unsearched] = await Promise.all([
    suggestionQueue(db(), guard.actor, { view, page: query.page, q: query.q, sort: query.sort }),
    query.q === '' ? null : suggestionQueue(db(), guard.actor, { view, page: 1, pageSize: 1 }),
  ]);
  const all = unsearched?.total ?? result.total;
  const params = { view: view === 'OPEN' ? undefined : view, q: query.q, sort: query.sort === defaultSort ? undefined : query.sort };

  return (
    <OpsShell actor={guard.actor} title="پیشنهادهای کاربران" pathname="/review/suggestions" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{fa(all) + ' پیشنهاد'}</span>
        <span className="hz-page-header__meta-item">
          رکورد پیشنهادی تا تأیید منتشر نمی‌شود و پس از تأیید، بدون مالک منتشر می‌شود. نام پیشنهاددهنده در این صف نمی‌آید.
        </span>
      </p>

      <QueueFrame
        path="/review/suggestions"
        params={params}
        query={query}
        page={result}
        all={all}
        noun="پیشنهاد"
        searchLabel="جست‌وجوی نام"
        defaultSort={defaultSort}
        testId="suggestion-queue-frame"
        chips={
        <ViewChips
          label="نمای پیشنهادها"
          chips={VIEWS.map((entry) => ({
            key: entry.view,
            href: hrefWith('/review/suggestions', params, { view: entry.view === 'OPEN' ? undefined : entry.view, page: undefined }),
            label: entry.label,
            current: entry.view === view,
            testId: 'suggestion-view-' + entry.view,
          }))}
        />
        }
      >
      {result.items.length === 0 ? (
        query.q !== '' ? (
          <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
        ) : (
        <EmptyState title={VIEWS.find((entry) => entry.view === view)!.empty} description="پیشنهادهای تازه کاربران اینجا نشان داده می‌شوند." />
        )
      ) : (
        <CaseList label="پیشنهادهای کاربران" testId="suggestion-queue">
          {result.items.map((item) => (
            <CaseItem
              key={item.id}
              type={SUGGESTION_KIND_FA[item.kind as SuggestionKind]}
              name={item.displayNameFa}
              href={'/review/suggestions/' + item.id}
              linkTestId={'suggestion-item-' + item.id}
              sub={[item.cityNameFa, 'منبع: ' + item.sourceFa, 'ثبت: ' + formatInstantFa(item.createdAt)].filter(Boolean).join(' · ')}
              ageDays={item.status === 'SUBMITTED' ? ageInDays(item.createdAt) : undefined}
              status={{
                ...keyStatus(item.status),
              }}
              owner={item.status === 'SUBMITTED' ? 'SYSTEM' : null}
              ownerLabel="اپراتور بررسی"
              ownerIsUs
            />
          ))}
        </CaseList>
      )}

      </QueueFrame>
    </OpsShell>
  );
}
