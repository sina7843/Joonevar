/**
 * The address of a queue view (P09 › queue toolbar): `?q=` search, `?sort=`
 * order and `?page=`, read once per page and passed to the service, so the
 * server filters, sorts and pages and the URL is the whole state.
 */
import { DEFAULT_PAGE_SIZE, type Page } from './pagination.ts';

export const QUEUE_SORTS = ['oldest', 'newest', 'name'] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

export const QUEUE_SORT_FA: Record<QueueSort, string> = {
  oldest: 'قدیمی‌ترین اول',
  newest: 'تازه‌ترین اول',
  name: 'نام',
};

export interface QueueQuery {
  readonly q: string;
  readonly sort: QueueSort;
  readonly page: number;
}

export function readQueueQuery(params: { q?: string; sort?: string; page?: string }, fallback: QueueSort = 'oldest'): QueueQuery {
  const sort = (QUEUE_SORTS as readonly string[]).includes(params.sort ?? '') ? (params.sort as QueueSort) : fallback;
  return { q: (params.q ?? '').trim().slice(0, 60), sort, page: Math.max(1, Math.floor(Number(params.page)) || 1) };
}

/** `%term%` with LIKE wildcards in the term escaped. */
export const likeOf = (q: string): string => '%' + q.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';

/**
 * Search, order and page an already bounded open queue on the server.
 * ponytail: the open queues these pages read are small (cases waiting for one
 * decision); move filtering into SQL once one of them grows past a few hundred.
 */
export function sliceQueue<T>(
  rows: readonly T[],
  query: QueueQuery,
  by: { readonly text: (row: T) => string; readonly at: (row: T) => Date | null | undefined; readonly name: (row: T) => string },
  pageSize = DEFAULT_PAGE_SIZE,
): Page<T> & { readonly all: number } {
  const term = query.q.toLocaleLowerCase('fa');
  const found = term === '' ? [...rows] : rows.filter((row) => by.text(row).toLocaleLowerCase('fa').includes(term));
  const time = (row: T) => by.at(row)?.getTime() ?? 0;
  found.sort((x, y) =>
    query.sort === 'name' ? by.name(x).localeCompare(by.name(y), 'fa') : query.sort === 'newest' ? time(y) - time(x) : time(x) - time(y),
  );
  const totalPages = found.length === 0 ? 0 : Math.ceil(found.length / pageSize);
  const page = Math.min(query.page, Math.max(1, totalPages));
  return {
    items: found.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: found.length,
    totalPages,
    all: rows.length,
  };
}
