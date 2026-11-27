import Link from 'next/link';

const fa1 = (value: number) => value.toLocaleString('fa-IR', { maximumFractionDigits: 1 });

/**
 * DS *Rating* (display): five-star bar filled to the score, «۴٫۶ از ۵ (۹۳ نظر)».
 * With no reviews it says so instead of drawing empty stars as a score.
 */
export function Rating({
  value,
  count,
  href,
  size = 'sm',
  testId,
}: {
  value: number;
  count: number;
  href?: string;
  size?: 'sm' | 'md';
  testId?: string;
}) {
  if (count === 0) {
    return (
      <span className="hz-rating hz-rating--none" data-testid={testId}>
        هنوز نظری ثبت نشده است
      </span>
    );
  }
  const label = 'امتیاز ' + fa1(value) + ' از ۵، ' + count.toLocaleString('fa-IR') + ' نظر';
  const body = (
    <>
      <span className="hz-rating__stars" aria-hidden="true">
        <span className="hz-rating__fill" style={{ ['--rating-fill' as string]: Math.round((value / 5) * 100) + '%' }} />
      </span>
      <span className="hz-rating__value">{fa1(value)}</span>
      <span className="hz-rating__max">از ۵</span>
      <span className="hz-rating__count">{'(' + count.toLocaleString('fa-IR') + ' نظر)'}</span>
    </>
  );
  const className = size === 'md' ? 'hz-rating hz-rating--md' : 'hz-rating';
  return href ? (
    <Link className={className} href={href} aria-label={label + '؛ رفتن به نظرها'} style={{ textDecoration: 'none' }} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <span className={className} role="img" aria-label={label} data-testid={testId}>
      {body}
    </span>
  );
}

/** «۴٫۶ ★★★★☆ بر پایه ۹۳ نظر» — the summary at the top of the reviews card. */
export function RatingSummary({ value, count }: { value: number; count: number }) {
  return (
    <div className="hz-rating-summary" role="img" aria-label={'امتیاز ' + fa1(value) + ' از ۵ بر پایه ' + count.toLocaleString('fa-IR') + ' نظر'}>
      <span className="hz-rating-summary__value">{fa1(value)}</span>
      <span className="hz-rating__stars" aria-hidden="true">
        <span className="hz-rating__fill" style={{ ['--rating-fill' as string]: Math.round((value / 5) * 100) + '%' }} />
      </span>
      <span className="hz-rating-summary__count">{'بر پایه ' + count.toLocaleString('fa-IR') + ' نظر'}</span>
    </div>
  );
}
