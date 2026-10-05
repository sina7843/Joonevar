import { PublicShell } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { myReviews, reviewablePurchases } from '../../../src/commerce/reviews.ts';
import { REVIEW_DIMENSIONS } from '../../../src/commerce/trust-model.ts';
import { ReviewForm } from '../../../src/commerce/trust-forms.tsx';
import { leaveReviewAction } from '../orders/trust-actions.ts';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * What this person may say, and what they have said — PROMPT-012.
 *
 * The list of reviewable purchases is read from the transactions themselves,
 * so it is the eligibility rather than a copy of it that could fall out of
 * step.
 */
export default async function MyReviewsPage() {
  const guard = await guardRoute('/account/reviews');
  if (!guard.ok) throw guard.denied;

  const [pending, mine] = await Promise.all([
    reviewablePurchases(db(), guard.actor),
    myReviews(db(), guard.actor),
  ]);

  return (
    <PublicShell
      actor={guard.actor}
      title="نظرهای من"
      pathname="/account/reviews"
      header={
        <PageHeader
          title="نظرهای من"
          back={{ href: '/dashboard' }}
          meta={[
            ...(pending.length > 0 ? [fa(pending.length) + ' خرید در انتظار نظر'] : []),
            ...(mine.length > 0 ? [fa(mine.length) + ' نظر ثبت‌شده'] : []),
          ]}
        />
      }
    >
      <div className="space-y-xl">
        <Card className="space-y-md">
          <SectionHeader title="خریدهایی که می‌توانید درباره‌شان بنویسید" size="sm" />
          <p className="hz-caption" data-testid="reviewable-note">
            نظر فقط پشت خریدی ثبت می‌شود که انجام شده باشد؛ همین است که آن را قابل اتکا می‌کند.
          </p>
          {pending.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="reviewable-empty">
              در حال حاضر خریدی برای ثبت نظر ندارید.
            </p>
          ) : (
            <ul className="hz-cardlist" data-testid="reviewable">
              {pending.map((purchase) => (
                <li
                  key={purchase.subOrderId}
                  className="hz-cardlist__item"
                  data-testid={'reviewable-' + purchase.subOrderId}
                >
                  <p className="hz-cardlist__row">
                    <span className="hz-cardlist__title">{purchase.sellerNameFa}</span>
                    <bdi dir="ltr" className="hz-id">
                      {purchase.reference}
                    </bdi>
                  </p>
                  <ReviewForm
                    action={leaveReviewAction}
                    subOrderId={purchase.subOrderId}
                    dimensionsFa={REVIEW_DIMENSIONS.COMMERCE_SUBORDER}
                    testPrefix="review"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-md">
          <SectionHeader title="نظرهای ثبت‌شده شما" size="sm" />
          {mine.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="my-reviews-empty">
              هنوز نظری ثبت نکرده‌اید.
            </p>
          ) : (
            <ul className="hz-cardlist" data-testid="my-reviews">
              {mine.map((view) => (
                <li key={view.row.id} className="hz-cardlist__item" data-testid={'my-review-' + view.row.id}>
                  <span className="flex flex-wrap gap-x-lg gap-y-xs">
                    {[view.row.scoreOne, view.row.scoreTwo, view.row.scoreThree].map((score, index) => (
                      <span key={index} className="inline-flex items-center gap-xs hz-body-sm">
                        <Icon name="star" size="xs" className="text-text-brand" />
                        {view.dimensionsFa[index] + ': ' + fa(score)}
                      </span>
                    ))}
                  </span>
                  {view.row.bodyFa ? <p className="hz-body-sm">{view.row.bodyFa}</p> : null}
                  {view.row.replyFa ? (
                    <p className="hz-body-sm border-t border-border-subtle pt-sm">
                      <span className="text-text-secondary">پاسخ فروشنده: </span>
                      {view.row.replyFa}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
