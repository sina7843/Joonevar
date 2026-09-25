import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { myStores } from '../../../../src/commerce/sellers.ts';
import { reviewsOfSeller, sellerAggregate } from '../../../../src/commerce/reviews.ts';
import { questionsOfSeller } from '../../../../src/commerce/questions.ts';
import { AnswerQuestionForm, ReviewReplyForm } from '../../../../src/commerce/trust-forms.tsx';
import { answerQuestionAction, replyToReviewAction } from '../../orders/trust-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * What this shop has been told, and asked — PROMPT-012.
 *
 * The shop may answer and may reply, and may do nothing else: a rating it
 * could remove would be a rating that means nothing, so hiding a review is a
 * moderator's decision and not a shop's.
 */
export default async function SellerReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const guard = await guardRoute('/account/seller/reviews');
  if (!guard.ok) throw guard.denied;

  const stores = await myStores(db(), guard.actor);
  const requested = String((await searchParams).store ?? '');
  const store = stores.find((row) => row.id === requested) ?? stores[0] ?? null;
  if (store === null) {
    return (
      <PublicShell actor={guard.actor} title="نظرها و پرسش‌ها" pathname="/account/seller">
        <div className="space-y-lg p-lg">
          <p className="text-body-sm text-text-secondary" data-testid="reviews-no-store">
            هنوز فروشگاهی ندارید.
          </p>
        </div>
      </PublicShell>
    );
  }

  const [reviews, aggregate, questions] = await Promise.all([
    reviewsOfSeller(db(), guard.actor, store.id),
    sellerAggregate(db(), store.id),
    questionsOfSeller(db(), guard.actor, store.id),
  ]);

  return (
    <PublicShell actor={guard.actor} title="نظرها و پرسش‌ها" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        <Card>
          <h2 className="text-label-lg">امتیاز فروشگاه</h2>
          <p className="mt-sm text-h2" data-testid="seller-rating">
            {aggregate.count === 0 ? '—' : fa(aggregate.overall)}
          </p>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="seller-rating-note">
            از {fa(aggregate.count)} نظر ثبت‌شده پشت خریدهای انجام‌شده. این عدد فقط از نظرها ساخته می‌شود؛ هیچ
            بسته تبلیغی آن را جابه‌جا نمی‌کند.
          </p>
        </Card>

        <Card>
          <h2 className="text-label-lg">نظرها</h2>
          {reviews.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="seller-reviews-empty">
              هنوز نظری ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="seller-reviews">
              {reviews.map((view) => (
                <li
                  key={view.row.id}
                  className="space-y-sm rounded-md border border-border-subtle p-lg"
                  data-testid={'seller-review-' + view.row.id}
                >
                  <p className="text-body-sm">
                    {view.dimensionsFa[0]}: {fa(view.row.scoreOne)} — {view.dimensionsFa[1]}: {fa(view.row.scoreTwo)} —{' '}
                    {view.dimensionsFa[2]}: {fa(view.row.scoreThree)}
                  </p>
                  {view.row.bodyFa ? (
                    <p className="text-body-sm" data-testid={'seller-review-body-' + view.row.id}>
                      {view.row.bodyFa}
                    </p>
                  ) : null}
                  {view.row.status !== 'PUBLISHED' ? (
                    <p className="text-caption text-text-secondary" data-testid={'seller-review-hidden-' + view.row.id}>
                      این نظر توسط ناظر پنهان شده است.
                    </p>
                  ) : null}
                  {view.row.replyFa ? (
                    <p className="text-caption" data-testid={'seller-review-reply-' + view.row.id}>
                      پاسخ شما: {view.row.replyFa}
                    </p>
                  ) : (
                    <ReviewReplyForm action={replyToReviewAction} reviewId={view.row.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">پرسش‌ها</h2>
          <Alert tone="info" title="پرسش پس از بررسی ناظر به شما می‌رسد">
            <span data-testid="questions-note">
              پرسش‌های در انتظار بررسی اینجا نمایش داده نمی‌شوند.
            </span>
          </Alert>
          {questions.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="seller-questions-empty">
              پرسشی برای این فروشگاه ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="seller-questions">
              {questions.map((entry) => (
                <li
                  key={entry.row.id}
                  className="space-y-sm rounded-md border border-border-subtle p-lg"
                  data-testid={'seller-question-' + entry.row.id}
                >
                  <p className="text-body-sm">
                    {entry.productNameFa ? entry.productNameFa + ' — ' : ''}
                    {entry.row.bodyFa}
                  </p>
                  {entry.row.answerFa ? (
                    <p className="text-caption" data-testid={'seller-answer-' + entry.row.id}>
                      پاسخ شما: {entry.row.answerFa}
                    </p>
                  ) : (
                    <AnswerQuestionForm action={answerQuestionAction} questionId={entry.row.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
