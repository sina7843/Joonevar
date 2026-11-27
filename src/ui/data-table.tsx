import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';

export interface DataColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** End-aligned money and counts (`.hz-num`). */
  readonly numeric?: boolean;
  /** The row's title cell: first on the phone card, carries the one link. */
  readonly lead?: boolean;
  /** Hidden below 1024 (fewer columns on tablets). */
  readonly hideBelow?: 'lg';
}

/**
 * DS *DataTable*. One markup at every width: from 768 a table, below 768 the
 * same rows restack as the system's card list (`.hz-table--stack`, globals.css),
 * each cell prefixed with its column name, so a row's link and test id exist
 * once (a second hidden copy would double every test id).
 *
 * `sort` turns headers whose key is in `sort.keys` into links (`aria-sort`);
 * the order lives in the URL and the server sorts. `selectable` adds the
 * checkbox column read by `BulkSelect`.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowTestId,
  rowClassName,
  dense = false,
  sort,
  selectable,
  empty,
  open,
}: {
  label: string;
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  rowTestId?: (row: T) => string | undefined;
  /** A DS row variant (e.g. `hz-audit-row`). */
  rowClassName?: string;
  dense?: boolean;
  sort?: { readonly key: string; readonly dir: 'asc' | 'desc'; readonly keys: readonly string[]; readonly href: (key: string, dir: 'asc' | 'desc') => string };
  /** Checkbox per row (`name="ids"`), with the row's accessible name. */
  selectable?: { readonly label: (row: T) => string; readonly disabled?: (row: T) => boolean; readonly form?: string };
  empty?: ReactNode;
  /** A decorative open caret at the end (the lead link opens the row). */
  open?: boolean;
}) {
  if (rows.length === 0) return <>{empty ?? null}</>;
  return (
    <div className="hz-table-wrap">
      <table className={['hz-table', dense ? 'hz-table--dense' : '', 'hz-table--stack'].join(' ').trim()} aria-label={label}>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className="hz-table__check">
                <label className="hz-check">
                  <input type="checkbox" data-select-all aria-label="انتخاب همه ردیف‌های این صفحه" />
                </label>
              </th>
            ) : null}
            {columns.map((column) => {
              const sortable = sort?.keys.includes(column.key);
              const active = sortable && sort!.key === column.key;
              const cls = [column.numeric ? 'hz-num' : '', column.hideBelow ? 'max-lg:hidden' : ''].join(' ').trim() || undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={cls}
                  aria-sort={sortable ? (active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                >
                  {sortable ? (
                    <Link href={sort!.href(column.key, active && sort!.dir === 'asc' ? 'desc' : 'asc')} className="inline-flex items-center gap-2xs text-inherit no-underline">
                      {column.header}
                      <Icon name={active ? (sort!.dir === 'asc' ? 'arrowUp' : 'arrowDown') : 'caretUpDown'} size="xs" />
                    </Link>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {open ? (
              <th scope="col">
                <span className="hz-visually-hidden">باز کردن</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} data-testid={rowTestId?.(row)} className={rowClassName}>
              {selectable ? (
                <td className="hz-table__check">
                  <label className="hz-check">
                    <input
                      type="checkbox"
                      name="ids"
                      form={selectable.form}
                      value={rowKey(row)}
                      aria-label={selectable.label(row)}
                      disabled={selectable.disabled?.(row)}
                    />
                  </label>
                </td>
              ) : null}
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.lead ? undefined : column.header}
                  className={
                    [column.lead ? 'hz-table__lead' : '', column.numeric ? 'hz-num' : '', column.hideBelow ? 'max-lg:md:hidden' : '']
                      .join(' ')
                      .trim() || undefined
                  }
                >
                  {column.cell(row)}
                </td>
              ))}
              {open ? (
                <td className="hz-table__open">
                  <span className="hz-icon-btn hz-icon-btn--sm" aria-hidden="true">
                    <Icon name="caretRight" size="sm" mirror />
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
