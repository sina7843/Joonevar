import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList } from '../../../../src/ui/desk.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { feedbackList } from '../../../../src/finder/operations.ts';
import { REQUEST_STATUS_FA, ROUTE_FA, type RequestStatus } from '../../../../src/finder/request-model.ts';
import { QueueFrame } from '../../../../src/ui/queue-head.tsx';
import { readQueueQuery, sliceQueue } from '../../../../src/domain/queue-query.ts';

export const dynamic = 'force-dynamic';

/** Confidential post-event feedback — PHASE-4 PROMPT-007. For operations only; there is no public rating. */
export default async function FinderFeedbackPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const guard = await guardRoute('/market/finder/feedback');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  let rows;
  try {
    rows = await feedbackList(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const query = readQueueQuery(await searchParams);
  const titleOf = (r: (typeof rows)[number]) =>
    r.score.toLocaleString('fa-IR') + ' از ۵ · ' + REQUEST_STATUS_FA[r.outcome as RequestStatus] + ' · ' + ROUTE_FA[r.route];
  const page = sliceQueue(rows, query, {
    text: (r) => titleOf(r) + ' ' + (r.bodyFa ?? ''),
    at: (r) => r.createdAt,
    name: titleOf,
  });
  return (
    <OpsShell actor={guard.actor} title="بازخورد محرمانه جفت‌یابی" nav={marketNav(guard.actor)} pathname="/market/finder/feedback">
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          این بازخوردها محرمانه‌اند، به هیچ طرفی نشان داده نمی‌شوند و امتیاز عمومی مالک یا کنل نمی‌سازند.
        </span>
      </p>
      {rows.length === 0 ? (
        <EmptyState title="بازخوردی ثبت نشده است" description="پس از ثبت نتیجه جفت‌گیری، هر طرف می‌تواند یک بازخورد محرمانه بدهد." />
      ) : (
        <QueueFrame
          path="/market/finder/feedback"
          params={{ q: query.q || undefined, sort: query.sort === 'oldest' ? undefined : query.sort }}
          query={query}
          page={page}
          all={page.all}
          noun="بازخورد"
          searchLabel="جست‌وجوی نام یا کد"
          testId="finder-feedback-queue-frame"
        >
          {page.items.length === 0 ? (
            <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را کوتاه‌تر کنید یا پاک کنید." />
          ) : (
            <CaseList label="بازخوردها" testId="finder-feedback-list">
              {page.items.map((r) => (
                <CaseItem
                  key={r.id}
                  name={titleOf(r)}
                  sub={
                    <>
                      {formatInstantFa(r.createdAt)}
                      {r.bodyFa ? <span className="block whitespace-pre-line text-body-sm">{r.bodyFa}</span> : null}
                    </>
                  }
                />
              ))}
            </CaseList>
          )}
        </QueueFrame>
      )}
    </OpsShell>
  );
}
