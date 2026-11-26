import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBadge } from './status.tsx';

/**
 * DS *Messaging* (P12): ConversationList and OfferCard. Server components; the
 * actions inside an OfferCard are passed in as children (forms are client).
 */

const timeFa = (value: Date) => new Intl.DateTimeFormat('fa-IR', { timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(value);
const dayFa = (value: Date) => new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long', timeZone: 'Asia/Tehran' }).format(value);
const sameDay = (a: Date, b: Date) => dayFa(a) === dayFa(b) && Math.abs(a.getTime() - b.getTime()) < 86_400_000;

/** «۰۹:۳۲» today, «دیروز», else «۳ مهر» (DS ConversationList › time). */
export function conversationTimeFa(at: Date, now: Date = new Date()): string {
  if (sameDay(at, now)) return timeFa(at);
  if (sameDay(at, new Date(now.getTime() - 86_400_000))) return 'دیروز';
  return dayFa(at);
}

export interface ConversationItem {
  readonly id: string;
  readonly href: string;
  readonly name: string;
  readonly context: string;
  readonly last: string | null;
  readonly at: Date | null;
  readonly current?: boolean;
  /** A closed thread shows its final status instead of a counter. */
  readonly closedStatus?: string;
  readonly testId?: string;
}

export function ConversationList({
  items,
  title = 'گفتگوها',
  countFa,
  testId,
  children,
}: {
  items: readonly ConversationItem[];
  title?: string;
  countFa?: string;
  testId?: string;
  /** Extra content under an item (e.g. the seller's accept form), keyed by id. */
  children?: (item: ConversationItem) => ReactNode;
}) {
  return (
    <nav className="hz-convos" aria-label={title} data-testid={testId}>
      <div className="hz-convos__head">
        <h2 className="hz-convos__title">{title}</h2>
        {countFa ? <span className="hz-section-header__count">{countFa}</span> : null}
      </div>
      <ul className="hz-convos__list">
        {items.map((item) => (
          <li key={item.id} data-testid={item.testId}>
            <Link
              className={item.closedStatus ? 'hz-convo hz-convo--closed' : 'hz-convo'}
              href={item.href}
              aria-current={item.current ? 'true' : undefined}
            >
              <span className="hz-avatar" aria-hidden="true">
                {item.name.trim().charAt(0) || 'خ'}
              </span>
              <span className="hz-convo__body">
                <span className="hz-convo__top">
                  <span className="hz-convo__name">{item.name}</span>
                  {item.at ? (
                    <time className="hz-convo__time" dateTime={item.at.toISOString()}>
                      {conversationTimeFa(item.at)}
                    </time>
                  ) : null}
                </span>
                <span className="hz-convo__context">{item.context}</span>
                <span className="hz-convo__bottom">
                  <span className="hz-convo__last">
                    <span>{item.last ?? 'هنوز پیامی نیست'}</span>
                  </span>
                  {item.closedStatus ? <StatusBadge status={item.closedStatus} size="sm" /> : null}
                </span>
              </span>
            </Link>
            {children ? children(item) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * DS *OfferCard*: a price offer inside the thread — who offered, the amount
 * with its unit, the advert's price for comparison, its state, and (only while
 * it is open and the viewer may answer) the actions.
 */
export function OfferCard({
  amountFa,
  fromFa,
  listPriceFa,
  status,
  note,
  actions,
  testId,
}: {
  amountFa: string;
  /** «خریدار» / «فروشنده» / «شما». */
  fromFa: string;
  listPriceFa?: string | null;
  /** Offer status (PROPOSED / ACCEPTED / DECLINED / WITHDRAWN / SUPERSEDED). */
  status?: string | null;
  note?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}) {
  const settled = status === 'ACCEPTED' || status === 'DECLINED' || status === 'WITHDRAWN';
  return (
    <article
      className={['hz-offer', 'hz-msg__card', settled ? 'hz-offer--settled' : '', status === 'SUPERSEDED' ? 'hz-offer--superseded' : ''].join(' ').trim()}
      aria-label={'پیشنهاد قیمت ' + amountFa + ' تومان از ' + fromFa}
    >
      <div className="hz-offer__head">
        <span className="hz-offer__label">{'پیشنهاد قیمت از ' + fromFa}</span>
        {status && status !== 'PROPOSED' ? <StatusBadge status={status} size="sm" /> : null}
      </div>
      <div className="hz-offer__amount" data-testid={testId}>
        <span className="hz-offer__value">{amountFa}</span>
        <span className="hz-offer__unit">تومان</span>
      </div>
      {listPriceFa ? (
        <p className="hz-offer__compare">
          قیمت آگهی: <b>{listPriceFa}</b>
        </p>
      ) : null}
      {note}
      {actions ? <div className="hz-offer__actions">{actions}</div> : null}
    </article>
  );
}
