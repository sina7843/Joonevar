import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel } from '../../../../src/ui/desk.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { feedbackList } from '../../../../src/finder/operations.ts';
import { REQUEST_STATUS_FA, ROUTE_FA, type RequestStatus } from '../../../../src/finder/request-model.ts';

export const dynamic = 'force-dynamic';

/** Confidential post-event feedback — PHASE-4 PROMPT-007. For operations only; there is no public rating. */
export default async function FinderFeedbackPage() {
  const guard = await guardRoute('/market/finder/feedback');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  let rows;
  try {
    rows = await feedbackList(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
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
        <Panel title="بازخوردها" count={rows.length.toLocaleString('fa-IR')}>
          <ul className="divide-y divide-border-subtle" data-testid="finder-feedback-list">
            {rows.map((r) => (
              <li key={r.id} className="py-md first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <h3 className="text-label-lg">{r.score.toLocaleString('fa-IR') + ' از ۵ · ' + REQUEST_STATUS_FA[r.outcome as RequestStatus] + ' · ' + ROUTE_FA[r.route]}</h3>
                  <span className="text-caption text-text-secondary">{formatInstantFa(r.createdAt)}</span>
                </div>
                {r.bodyFa ? <p className="mt-xs whitespace-pre-line text-body-sm">{r.bodyFa}</p> : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </OpsShell>
  );
}
