import { PublicShell } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { myReviews, reviewablePurchases } from '../../../src/commerce/reviews.ts';
import { REVIEW_DIMENSIONS } from '../../../src/commerce/trust-model.ts';
import { ReviewForm } from '../../../src/commerce/trust-forms.tsx';
import { leaveReviewAction } from '../orders/trust-actions.ts';

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
    <PublicShell actor={guard.actor} title="نظرهای من" pathname="/account/reviews">
      <div className="space-y-lg p-lg">
        <Card>
          <h2 className="text-label-lg">خریدهایی که می‌توانید درباره‌شان بنویسید</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="reviewable-note">
            نظر فقط پشت خریدی ثبت می‌شود که انجام شده باشد؛ همین است که آن را قابل اتکا می‌کند.
          </p>
          {pending.length === 0 ? (
            <p className="mt-sm text-body-sm text-text-secondary" data-testid="reviewable-empty">
              در حال حاضر خریدی برای ثبت نظر ندارید.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="reviewable">
              {pending.map((purchase) => (
                <li
                  key={purchase.subOrderId}
                  className="space-y-sm rounded-md border border-border-subtle p-lg"
                  data-testid={'reviewable-' + purchase.subOrderId}
                >
                  <p className="text-label-sm">
                    {purchase.reference} — {purchase.sellerNameFa}
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

        <Card>
          <h2 className="text-label-lg">نظرهای ثبت‌شده شما</h2>
          {mine.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="my-reviews-empty">
              هنوز نظری ثبت نکرده‌اید.
            </p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="my-reviews">
              {mine.map((view) => (
                <li key={view.row.id} className="text-body-sm" data-testid={'my-review-' + view.row.id}>
                  {view.dimensionsFa[0]}: {fa(view.row.scoreOne)} — {view.dimensionsFa[1]}: {fa(view.row.scoreTwo)} —{' '}
                  {view.dimensionsFa[2]}: {fa(view.row.scoreThree)}
                  {view.row.bodyFa ? ' — ' + view.row.bodyFa : ''}
                  {view.row.replyFa ? ' — پاسخ فروشنده: ' + view.row.replyFa : ''}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
