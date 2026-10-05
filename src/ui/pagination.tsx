import Link from 'next/link';
import { Icon } from './icon.tsx';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/** First, last, current ±1, with «…» for the skipped runs (DS *Pagination*, at most 7 slots). */
function windowOf(page: number, totalPages: number): (number | 'gap')[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1]! > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

/**
 * DS *Pagination* (`.hz-pagination`): the range «نمایش ۱ تا ۲۴ از ۱۲۸» at the
 * start, the pages at the end — numbered from 768px, «قبلی / بعدی» with
 * «صفحه ۲ از ۱۲» below it. Real links, so the URL keeps the page. A single page
 * shows the range only; an empty list renders nothing.
 */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  hrefFor,
  label = 'صفحه‌بندی',
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  label?: string;
}) {
  if (total <= 0) return null;
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  const step = (target: number, rel: 'prev' | 'next') => {
    const enabled = target >= 1 && target <= totalPages;
    const content =
      rel === 'prev' ? (
        <>
          <Icon name="caretLeft" size="xs" mirror />
          قبلی
        </>
      ) : (
        <>
          بعدی
          <Icon name="caretRight" size="xs" mirror />
        </>
      );
    return enabled ? (
      <Link className="hz-page hz-page--step" href={hrefFor(target)} rel={rel}>
        {content}
      </Link>
    ) : (
      <span className="hz-page hz-page--step" aria-disabled="true">
        {content}
      </span>
    );
  };

  return (
    <nav className="hz-pagination" aria-label={label}>
      <p className="hz-pagination__count" aria-live="polite">
        نمایش <b>{fa(from)}</b> تا <b>{fa(to)}</b> از <b>{fa(total)}</b>
      </p>
      {totalPages > 1 ? (
        <ul className="hz-pagination__pages">
          <li>{step(page - 1, 'prev')}</li>
          {windowOf(page, totalPages).map((slot, index) =>
            slot === 'gap' ? (
              <li key={'gap-' + index} className="hz-show-md">
                <span className="hz-page hz-page--gap" aria-hidden="true">
                  …
                </span>
              </li>
            ) : (
              <li key={slot} className="hz-show-md">
                <Link
                  className="hz-page"
                  href={hrefFor(slot)}
                  aria-current={slot === page ? 'page' : undefined}
                  aria-label={'صفحه ' + fa(slot)}
                >
                  {fa(slot)}
                </Link>
              </li>
            ),
          )}
          <li className="hz-hide-md hz-pagination__count">{'صفحه ' + fa(page) + ' از ' + fa(totalPages)}</li>
          <li>{step(page + 1, 'next')}</li>
        </ul>
      ) : null}
    </nav>
  );
}
