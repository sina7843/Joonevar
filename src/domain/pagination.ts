/** Shared list contract for every queue and list screen (§21.5). */
import { validation } from './errors.ts';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

function parsePositiveInt(raw: unknown, fallback: number, field: string): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isInteger(value) || value < 1) throw validation(field + ' must be a positive integer');
  return value;
}

export function parsePageRequest(input: { page?: unknown; pageSize?: unknown } = {}): PageRequest {
  const page = parsePositiveInt(input.page, 1, 'page');
  const pageSize = parsePositiveInt(input.pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
  if (pageSize > MAX_PAGE_SIZE) throw validation('pageSize must not exceed ' + MAX_PAGE_SIZE);
  return { page, pageSize };
}

export const offsetOf = (p: PageRequest): number => (p.page - 1) * p.pageSize;

export function pageOf<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return {
    items,
    page: request.page,
    pageSize: request.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / request.pageSize),
  };
}
