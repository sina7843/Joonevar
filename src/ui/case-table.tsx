import Link from 'next/link';
import type { ReactNode } from 'react';
import { DataTable, type DataColumn } from './data-table.tsx';
import { DeskStatusBadge, OWNER_FA, type DeskStatus } from './desk.tsx';
import { Icon } from './icon.tsx';
import type { ActionOwnerKind } from './status.tsx';

/** One P09 case: the same facts a `CaseItem` card carries, as a table row. */
export interface CaseRow {
  readonly id: string;
  readonly testId?: string;
  readonly name: ReactNode;
  /** The desk; the name is the row's one link. */
  readonly href?: string;
  readonly linkTestId?: string;
  readonly code?: string | null;
  readonly sub?: ReactNode;
  readonly type?: string;
  readonly ageDays?: number | null;
  readonly age?: 'late' | 'overdue';
  readonly status?: DeskStatus;
  readonly owner?: ActionOwnerKind | null;
  readonly ownerLabel?: string;
  readonly ownerIsUs?: boolean;
  /** A thumbnail before the name (K14). */
  readonly media?: ReactNode;
  /** The row's step: the drawer desk trigger or a one-button step. */
  readonly action?: ReactNode;
}

/**
 * DS *CaseQueue* for the queues whose rows open a Drawer desk or carry one
 * inline step: a dense `DataTable` from 768, the system card list below it.
 * Columns appear only when some row has the fact (age, type, status, owner).
 * `columns` are module columns inserted after the name.
 */
export function CaseTable({
  label,
  rows,
  testId,
  nameLabel = 'پرونده',
  columns = [],
  dense = true,
  selectable,
  sort,
}: {
  label: string;
  rows: readonly CaseRow[];
  testId?: string;
  nameLabel?: string;
  columns?: readonly DataColumn<CaseRow>[];
  dense?: boolean;
  selectable?: Parameters<typeof DataTable<CaseRow>>[0]['selectable'];
  sort?: Parameters<typeof DataTable<CaseRow>>[0]['sort'];
}) {
  const has = (pick: (row: CaseRow) => unknown) => rows.some((row) => pick(row) !== undefined && pick(row) !== null);
  const all: DataColumn<CaseRow>[] = [];
  if (has((row) => row.ageDays))
    all.push({
      key: 'age',
      header: 'سن پرونده',
      cell: (row) =>
        row.ageDays === null || row.ageDays === undefined ? (
          '—'
        ) : (
          <span className={row.age ? 'hz-age hz-age--' + row.age : 'hz-age'}>
            <Icon name="clock" size="xs" />
            {row.ageDays.toLocaleString('fa-IR') + ' روز'}
          </span>
        ),
    });
  all.push({
    key: 'name',
    header: nameLabel,
    lead: true,
    cell: (row) => {
      const text = (
        <div className="hz-case">
          {row.href ? (
            <Link className="hz-case__name" href={row.href} data-testid={row.linkTestId}>
              {row.name}
            </Link>
          ) : (
            <span className="hz-case__name">{row.name}</span>
          )}
          {row.code ? (
            <bdi className="hz-id" dir="ltr">
              {row.code}
            </bdi>
          ) : null}
          {row.sub ? <span className="hz-case__sub">{row.sub}</span> : null}
        </div>
      );
      return row.media ? (
        <div className="flex min-w-0 items-center gap-sm">
          {row.media}
          {text}
        </div>
      ) : (
        text
      );
    },
  });
  if (has((row) => row.type)) all.push({ key: 'type', header: 'نوع', cell: (row) => row.type ?? '—' });
  all.push(...columns);
  if (has((row) => row.status))
    all.push({ key: 'status', header: 'وضعیت', cell: (row) => (row.status ? <DeskStatusBadge status={row.status} size="sm" /> : '—') });
  if (has((row) => row.owner))
    all.push({
      key: 'owner',
      header: 'اقدام بعدی با',
      cell: (row) =>
        row.owner ? (
          <span
            className={['hz-owner', 'hz-owner--inline', row.ownerIsUs && row.owner !== 'USER' && row.owner !== 'COUNTERPARTY' ? 'hz-owner--you' : '']
              .join(' ')
              .trim()}
          >
            <span className="hz-owner__who">{row.ownerLabel ?? OWNER_FA[row.owner]}</span>
          </span>
        ) : (
          '—'
        ),
    });
  if (has((row) => row.action)) all.push({ key: 'action', header: 'اقدام', cell: (row) => row.action ?? null });

  return (
    <div data-testid={testId}>
      <DataTable label={label} columns={all} rows={rows} rowKey={(row) => row.id} rowTestId={(row) => row.testId} dense={dense} selectable={selectable} sort={sort} />
    </div>
  );
}
