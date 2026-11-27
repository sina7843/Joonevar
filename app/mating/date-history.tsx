import { Card } from '../../src/ui/card.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { DATE_STATUS_FA, type DateRecord } from '../../src/mating/dates.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';

/**
 * Every version of the date protocol, newest first, with its declarer, time and
 * state — shared by the official permit and the Finder's personal mating
 * (PHASE-4 PROMPT-006). A conflict shows both values; only the newest mutually
 * confirmed date is marked as the basis.
 */
export function DateHistory({
  rows,
  names,
  basis,
}: {
  rows: readonly DateRecord[];
  names: Record<string, string>;
  basis: string | null;
}) {
  return (
    <Card>
      <div className="hz-section-header hz-section-header--sm">
        <h2 className="hz-section-header__title">
          <span className="hz-section-header__bar" aria-hidden="true" />
          <span>تاریخچه اعلام‌ها</span>
        </h2>
      </div>
      {rows.length === 0 ? (
        <div className="mt-lg">
          <EmptyState
            title="هنوز تاریخی اعلام نشده است"
            description="هر دو طرف می‌توانند تاریخ اعلام کنند؛ هر اعلام نسخه خودش را دارد."
          />
        </div>
      ) : (
        <ul className="mt-lg space-y-md" data-testid="date-history">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-border-default p-lg"
              data-testid={'date-version-' + row.version}
            >
              <div className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="text-label-sm">
                    نسخه {row.version} ·{' '}
                    <span dir="ltr" className="font-mono">
                      {row.matedOn}
                    </span>
                  </p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    اعلام‌کننده: {names[row.declaredByAccountId] ?? '—'} ·{' '}
                    {formatCivilDateFa(row.declaredAt.toISOString().slice(0, 10))}
                  </p>
                  {row.replacesVersion !== null ? (
                    <p className="mt-2xs text-caption text-text-secondary">
                      نسخه اصلاحی برای نسخه {row.replacesVersion}
                    </p>
                  ) : null}
                  {row.conflictsWithId ? (
                    <p className="mt-2xs text-caption text-text-secondary" data-testid="conflict-note">
                      در پاسخ به تاریخ اعلام‌شده دیگر ثبت شده است؛ هر دو مقدار در همین فهرست دیده می‌شود.
                    </p>
                  ) : null}
                  {row.noteFa ? <p className="mt-sm text-body-sm">{row.noteFa}</p> : null}
                </div>
                <span data-testid={'date-status-' + row.version}>
                  {row.status === 'CONFLICTED' || row.status === 'CONFIRMED' ? (
                    // GAPS #4: no dictionary key for CONFLICTED; dictionary CONFIRMED («وجود توافق تأیید شد») is the declaration label, not a mutually confirmed date
                    <StatusBadge tone={row.status === 'CONFIRMED' ? 'success' : 'warning'}>
                      {DATE_STATUS_FA[row.status]}
                    </StatusBadge>
                  ) : (
                    <StatusBadge status={row.status} />
                  )}
                </span>
              </div>
              {row.status === 'CONFIRMED' && row.matedOn === basis ? (
                <p className="mt-sm text-caption text-text-brand" data-testid="basis-marker">
                  مبنای فعلی Cooldown و Timeline هر دو حیوان
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
