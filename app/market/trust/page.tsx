import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { reviewQueue } from '../../../src/commerce/reviews.ts';
import { questionQueue } from '../../../src/commerce/questions.ts';
import { DecideQuestionForm, ModerateReviewForm } from '../../../src/commerce/trust-forms.tsx';
import { decideQuestionAction, moderateReviewAction } from '../../account/orders/trust-actions.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * Reviews and questions, for the people who answer for them — PROMPT-012.
 *
 * Hiding a review takes it out of the average, which is why it is a
 * moderator's decision and always carries a reason: a shop that could quietly
 * remove what it did not like would have a rating that means nothing.
 */
export default async function MarketTrustPage() {
  const guard = await guardRoute('/market/trust');
  if (!guard.ok) throw guard.denied;

  const [reviews, questions] = await Promise.all([
    reviewQueue(db(), guard.actor),
    questionQueue(db(), guard.actor),
  ]);

  return (
    <OpsShell actor={guard.actor} title="نظرها و پرسش‌ها" nav={marketNav(guard.actor)} pathname="/market/trust">
      <div className="space-y-lg p-lg">
        <Alert tone="info" title="امتیاز فروشگاه فقط از نظرها ساخته می‌شود">
          <span data-testid="reputation-note">
            هیچ بسته تبلیغی و هیچ پلنی در محاسبه امتیاز دخالت ندارد؛ تبلیغ جایگاه می‌خرد، نه اعتبار.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">پرسش‌های در انتظار بررسی</h2>
          {questions.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="question-queue-empty">
              پرسشی در انتظار بررسی نیست.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="question-queue">
              {questions.map((entry) => (
                <li
                  key={entry.question.id}
                  className="space-y-sm rounded-md border border-border-subtle p-lg"
                  data-testid={'question-' + entry.question.id}
                >
                  <p className="text-body-sm">
                    {entry.productNameFa ?? entry.sellerNameFa ?? '—'} — {entry.question.bodyFa}
                  </p>
                  <DecideQuestionForm action={decideQuestionAction} questionId={entry.question.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">نظرها</h2>
          {reviews.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="review-queue-empty">
              نظری ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="review-queue">
              {reviews.map((view) => (
                <li
                  key={view.row.id}
                  className="space-y-sm rounded-md border border-border-subtle p-lg"
                  data-testid={'review-' + view.row.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <span className="text-body-sm">
                      {view.sellerNameFa ?? 'معامله حیوان'} — {view.dimensionsFa[0]}: {fa(view.row.scoreOne)} —{' '}
                      {view.dimensionsFa[1]}: {fa(view.row.scoreTwo)} — {view.dimensionsFa[2]}:{' '}
                      {fa(view.row.scoreThree)}
                    </span>
                    <StatusBadge tone={view.row.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      <span data-testid={'review-status-' + view.row.id}>{view.row.status}</span>
                    </StatusBadge>
                  </div>
                  {view.row.bodyFa ? (
                    <p className="text-body-sm" data-testid={'review-body-' + view.row.id}>
                      {view.row.bodyFa}
                    </p>
                  ) : null}
                  <ModerateReviewForm action={moderateReviewAction} reviewId={view.row.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
