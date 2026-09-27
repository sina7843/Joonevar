import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
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
      <div className="space-y-lg">
        <Card>
          <p className="text-caption text-text-secondary">این بازخوردها محرمانه‌اند، به هیچ طرفی نشان داده نمی‌شوند و امتیاز عمومی مالک یا کنل نمی‌سازند.</p>
        </Card>
        {rows.length === 0 ? (
          <EmptyState title="بازخوردی ثبت نشده است" description="پس از ثبت نتیجه جفت‌گیری، هر طرف می‌تواند یک بازخورد محرمانه بدهد." />
        ) : (
          <Card>
            <ul className="space-y-sm" data-testid="finder-feedback-list">
              {rows.map((r) => (
                <li key={r.id} className="rounded-md border border-border-subtle p-sm">
                  <p className="text-label-md">{r.score.toLocaleString('fa-IR') + ' از ۵ · ' + REQUEST_STATUS_FA[r.outcome as RequestStatus] + ' · ' + ROUTE_FA[r.route]}</p>
                  {r.bodyFa ? <p className="mt-xs whitespace-pre-line text-body-sm">{r.bodyFa}</p> : null}
                  <p className="mt-xs text-caption text-text-secondary">{formatInstantFa(r.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </OpsShell>
  );
}
