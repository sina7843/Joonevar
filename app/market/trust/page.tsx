import { OpsShell, marketNav } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { CaseItem, CaseList, DeskHead, Panel, QueueMeta } from '../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../src/ui/desk-drawer.tsx';
import { keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { reviewQueue } from '../../../src/commerce/reviews.ts';
import { questionQueue } from '../../../src/commerce/questions.ts';
import { DecideQuestionForm, ModerateReviewForm } from '../../../src/commerce/trust-forms.tsx';
import { decideQuestionAction, moderateReviewAction } from '../../account/orders/trust-actions.ts';
import { QueueFrame } from '../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * Reviews and questions, for the people who answer for them — PROMPT-012.
 *
 * Hiding a review takes it out of the average, which is why it is a
 * moderator's decision and always carries a reason: a shop that could quietly
 * remove what it did not like would have a rating that means nothing.
 */
export default async function MarketTrustPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/market/trust');
  if (!guard.ok) throw guard.denied;

  const [reviews, questions] = await Promise.all([
    reviewQueue(db(), guard.actor),
    questionQueue(db(), guard.actor),
  ]);
  const query = readQueueQuery(await searchParams);
  const page = sliceQueue(questions, query, {
    text: (entry) => [entry.productNameFa, entry.sellerNameFa, entry.question.bodyFa].filter(Boolean).join(' '),
    at: (entry) => entry.question.createdAt,
    name: (entry) => entry.productNameFa ?? entry.sellerNameFa ?? '',
  });

  return (
    <OpsShell actor={guard.actor} title="نظرها و پرسش‌ها" nav={marketNav(guard.actor)} pathname="/market/trust">
      <QueueMeta total={questions.length} noun="پرسش در انتظار بررسی" />
      <Alert tone="info" title="امتیاز فروشگاه فقط از نظرها ساخته می‌شود">
        <span data-testid="reputation-note">
          هیچ بسته تبلیغی و هیچ پلنی در محاسبه امتیاز دخالت ندارد؛ تبلیغ جایگاه می‌خرد، نه اعتبار.
        </span>
      </Alert>

      <Panel title="پرسش‌های در انتظار بررسی" count={fa(questions.length)}>
        {questions.length === 0 ? (
          <p className="text-caption text-text-secondary" data-testid="question-queue-empty">
            پرسشی در انتظار بررسی نیست.
          </p>
        ) : (
          <QueueFrame
            path="/market/trust"
            params={{ q: query.q || undefined, sort: query.sort === 'oldest' ? undefined : query.sort }}
            query={query}
            page={page}
            all={page.all}
            noun="پرسش"
            searchLabel="جست‌وجوی نام یا کد"
            testId="question-queue-frame"
          >
            {page.items.length === 0 ? (
              <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را کوتاه‌تر کنید یا پاک کنید." />
            ) : (
              <CaseList label="پرسش‌های در انتظار بررسی" testId="question-queue">
                {page.items.map((entry) => (
                  <CaseItem
                    key={entry.question.id}
                    testId={'question-' + entry.question.id}
                    type="پرسش"
                    name={entry.productNameFa ?? entry.sellerNameFa ?? '—'}
                    status={keyStatus('SUBMITTED')}
                    owner="SYSTEM"
                    ownerLabel="ناظر آگهی"
                    ownerIsUs
                  >
                    <CaseDrawer title="پرونده پرسش" testId={'open-question-' + entry.question.id}>
                      <DeskHead title={entry.productNameFa ?? entry.sellerNameFa ?? '—'} status={keyStatus('SUBMITTED')} />
                      <Panel title="متن پرسش">
                        <blockquote className="hz-card hz-card--subtle text-body-sm">{entry.question.bodyFa}</blockquote>
                      </Panel>
                      <Panel title="تصمیم">
                        <DecideQuestionForm action={decideQuestionAction} questionId={entry.question.id} />
                      </Panel>
                    </CaseDrawer>
                  </CaseItem>
                ))}
              </CaseList>
            )}
          </QueueFrame>
        )}
      </Panel>

      <Panel title="نظرها" count={fa(reviews.length)}>
        {reviews.length === 0 ? (
          <p className="text-caption text-text-secondary" data-testid="review-queue-empty">
            نظری ثبت نشده است.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle" data-testid="review-queue">
            {reviews.map((view) => (
              <li key={view.row.id} className="space-y-sm py-md first:pt-0 last:pb-0" data-testid={'review-' + view.row.id}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="hz-case min-w-0">
                    <span className="hz-case__name">{view.sellerNameFa ?? 'معامله حیوان'}</span>
                    <span className="hz-case__sub">
                      {view.dimensionsFa[0]}: {fa(view.row.scoreOne)} · {view.dimensionsFa[1]}: {fa(view.row.scoreTwo)} ·{' '}
                      {view.dimensionsFa[2]}: {fa(view.row.scoreThree)}
                    </span>
                  </div>
                  {/* The stored value stays readable to checks on data-status; people read the dictionary label. */}
                  <span data-testid={'review-status-' + view.row.id} data-status={view.row.status}>
                    <StatusBadge status={view.row.status} size="sm" />
                  </span>
                </div>
                {view.row.bodyFa ? (
                  <p className="text-body-sm" data-testid={'review-body-' + view.row.id}>
                    {view.row.bodyFa}
                  </p>
                ) : null}
                <CaseDrawer title="بررسی نظر" label="بررسی نظر" testId={'open-review-' + view.row.id}>
                  <DeskHead
                    title={view.sellerNameFa ?? 'معامله حیوان'}
                    status={{ key: view.row.status }}
                    meta={[
                      view.dimensionsFa[0] + ': ' + fa(view.row.scoreOne),
                      view.dimensionsFa[1] + ': ' + fa(view.row.scoreTwo),
                      view.dimensionsFa[2] + ': ' + fa(view.row.scoreThree),
                    ]}
                  />
                  {view.row.bodyFa ? (
                    <Panel title="متن نظر">
                      <p className="text-body-sm">{view.row.bodyFa}</p>
                    </Panel>
                  ) : null}
                  <Panel title="تصمیم">
                    <ModerateReviewForm action={moderateReviewAction} reviewId={view.row.id} />
                  </Panel>
                </CaseDrawer>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </OpsShell>
  );
}
