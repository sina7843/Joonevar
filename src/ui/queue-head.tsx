import type { ReactNode } from 'react';
import { DEFAULT_PAGE_SIZE, type Page } from '../domain/pagination.ts';
import { SearchField } from './search-field.tsx';
import { SortMenu } from './sort-menu.tsx';
import { Pagination } from './pagination.tsx';
import { QUEUE_SORT_FA, QUEUE_SORTS, type QueueQuery, type QueueSort } from '../domain/queue-query.ts';

export type QueryParams = Readonly<Record<string, string | undefined>>;

/** `path?…` from the current params with `patch` applied; empty values are dropped. */
export function hrefWith(path: string, params: QueryParams, patch: QueryParams = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) if (value) query.set(key, value);
  const text = query.toString();
  return text ? path + '?' + text : path;
}

/** The first value of a search param. */
export const param = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value) || undefined;

/**
 * One page of an already server-ordered queue. A page past the end falls back
 * to the last page; a malformed one to the first (the URL is untrusted).
 * ponytail: slices in memory after the service's full read; move LIMIT/OFFSET
 * into the service query when a queue grows past a few hundred open cases.
 */
export function pageSlice<T>(items: readonly T[], raw: string | undefined, pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const asked = Number(raw);
  const page = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, Math.max(totalPages, 1)) : 1;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, totalPages };
}

/**
 * P09 queue head: the count (live only while a search or filter narrows the
 * queue: «۲ مورد از ۶»), a GET search form that keeps the other params, and
 * the SortMenu. Chips go under it as `children`.
 */
export function QueueHead({
  total,
  shown,
  noun = 'پرونده',
  search,
  sort,
  children,
}: {
  total: number;
  /** Rows after search/filter; equal to `total` when nothing narrows the queue. */
  shown: number;
  noun?: string;
  search?: { action: string; value?: string; label: string; keep?: QueryParams; testId?: string };
  sort?: { label: string; options: Parameters<typeof SortMenu>[0]['options']; testId?: string };
  children?: ReactNode;
}) {
  const fa = (value: number) => value.toLocaleString('fa-IR');
  return (
    <div className="hz-queue">
      <div className="hz-queue__head">
        <p className="hz-section-header__count" aria-live="polite">
          {shown === total ? fa(total) + ' ' + noun : fa(shown) + ' مورد از ' + fa(total) + ' ' + noun}
        </p>
        <div className="hz-queue__tools">
          {search ? (
            <form method="get" action={search.action} role="search" className="hz-queue__search">
              {Object.entries(search.keep ?? {}).map(([key, value]) =>
                value && key !== 'q' && key !== 'page' ? <input key={key} type="hidden" name={key} value={value} /> : null,
              )}
              <SearchField id={'q-' + search.action.replace(/\W/g, '-')} name="q" label={search.label} defaultValue={search.value} data-testid={search.testId} />
            </form>
          ) : null}
          {sort ? <SortMenu label={sort.label} options={sort.options} testId={sort.testId} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * A whole P09 queue body: `QueueHead` (count, search, the standard SortMenu,
 * chips), the list, and `Pagination` under it. Every link keeps the other
 * params and resets the page; the default order stays out of the URL.
 */
export function QueueFrame({
  path,
  params,
  query,
  page,
  all,
  noun = 'پرونده',
  searchLabel,
  sorts = QUEUE_SORTS,
  defaultSort = 'oldest',
  chips,
  testId,
  children,
}: {
  path: string;
  params: QueryParams;
  query: QueueQuery;
  page: Page<unknown>;
  /** The queue before search, for «N مورد از M». */
  all: number;
  noun?: string;
  searchLabel: string;
  /** Empty: no SortMenu; the service's own order stands (a queue without a date to sort by). */
  sorts?: readonly QueueSort[];
  defaultSort?: QueueSort;
  chips?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-md" data-testid={testId}>
      <QueueHead
        total={all}
        shown={page.total}
        noun={noun}
        search={{ action: path, value: query.q, label: searchLabel, keep: params, testId: testId ? testId + '-search' : undefined }}
        sort={sorts.length === 0 ? undefined : {
          label: 'مرتب‌سازی ' + noun + '‌ها',
          testId: testId ? testId + '-sort' : undefined,
          options: sorts.map((key) => ({
            key,
            label: QUEUE_SORT_FA[key],
            current: key === query.sort,
            href: hrefWith(path, params, { sort: key === defaultSort ? undefined : key, page: undefined }),
          })),
        }}
      >
        {chips}
      </QueueHead>
      {children}
      <Pagination
        page={page.page}
        pageSize={page.pageSize}
        total={page.total}
        totalPages={page.totalPages}
        hrefFor={(target) => hrefWith(path, params, { page: target > 1 ? String(target) : undefined })}
      />
    </div>
  );
}
