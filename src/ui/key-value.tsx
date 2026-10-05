import type { ReactNode } from 'react';

/**
 * KeyValueList — DS *KeyValueList* (`.hz-kv`): a record's facts as a real
 * `<dl>`. `null`/`undefined`/'' values render the empty style with «—» (or the
 * row's own `empty` text, e.g. «تعیین‌نشده»), never a blank cell. `twoCol`
 * gives two columns from 1024px (record pages with ≥6 rows).
 */
export interface KeyValueRow {
  readonly key: string;
  readonly value: ReactNode;
  /** Shown in the empty style when `value` is null/undefined/''. Default «—». */
  readonly empty?: string;
  readonly testId?: string;
}

export function KeyValueList({ rows, twoCol = false }: { rows: readonly KeyValueRow[]; twoCol?: boolean }) {
  return (
    <dl className={twoCol ? 'hz-kv hz-kv--2col' : 'hz-kv'}>
      {rows.map((row) => {
        const missing = row.value === null || row.value === undefined || row.value === '';
        return (
          <div key={row.key} className="hz-kv__row">
            <dt className="hz-kv__key">{row.key}</dt>
            <dd className={missing ? 'hz-kv__value hz-kv__value--empty' : 'hz-kv__value'} data-testid={row.testId}>
              {missing ? (row.empty ?? '—') : row.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
