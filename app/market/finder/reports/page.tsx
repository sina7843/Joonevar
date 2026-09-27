import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { finderAppealQueue, finderReportQueue } from '../../../../src/finder/reports.ts';
import { ACTIONS_FOR, TARGET_FA } from '../../../../src/finder/reports-model.ts';
import { hasFinderCapability } from '../../../../src/finder/model.ts';
import { DecideAppealForm, DecideReportForm, TakeReportForm } from '../../../../src/finder/ops-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * The finder report queue and its appeals — PHASE-4 PROMPT-007. A moderator
 * sees the reported item alone and the evidence the reporter attached; opening
 * a piece of evidence is recorded.
 */
export default async function FinderReportsPage({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const guard = await guardRoute('/market/finder/reports');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const closed = (await searchParams).closed === '1';
  let queue;
  let appeals;
  try {
    [queue, appeals] = await Promise.all([finderReportQueue(db(), actor, { status: closed ? 'CLOSED' : 'OPEN' }), finderAppealQueue(db(), actor)]);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const canUnlist = hasFinderCapability(actor, 'FINDER_PROFILE_MODERATE');
  return (
    <OpsShell actor={actor} title="گزارش‌های جفت‌یابی" nav={marketNav(actor)} pathname="/market/finder/reports">
      <div className="space-y-lg">
        <Card>
          <p className="text-body-sm">
            <a href="/market/finder/reports" className="text-text-brand underline underline-offset-4">گزارش‌های باز</a>
            {' · '}
            <a href="/market/finder/reports?closed=1" className="text-text-brand underline underline-offset-4">تصمیم‌گرفته</a>
          </p>
        </Card>
        {queue.length === 0 ? (
          <EmptyState title="گزارشی نیست" description="گزارش‌های تازه اینجا می‌آیند." />
        ) : (
          queue.map((r) => (
            <Card key={r.id}>
              <div data-testid={'finder-report-' + r.id}>
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <p className="text-label-md">{r.categoryFa + ' — ' + r.targetFa}</p>
                  <StatusBadge tone={r.status === 'OPEN' ? 'warning' : 'neutral'}>{r.status}</StatusBadge>
                </div>
                <p className="mt-xs text-body-sm" data-testid={'finder-report-subject-' + r.id}>{r.subjectFa}</p>
                {r.details ? <p className="mt-xs whitespace-pre-line text-body-sm text-text-secondary">{r.details}</p> : null}
                <p className="mt-xs text-caption text-text-secondary">{formatInstantFa(r.createdAt)}</p>
                {r.evidence.length > 0 ? (
                  <p className="mt-xs flex flex-wrap gap-sm text-caption">
                    {r.evidence.map((e, i) => (
                      <a key={e} href={'/api/finder/reports/evidence/' + e} className="text-text-brand underline underline-offset-4" data-testid="finder-evidence-link">
                        {'مدرک ' + (i + 1).toLocaleString('fa-IR')}
                      </a>
                    ))}
                  </p>
                ) : null}
                {r.status === 'OPEN' ? (
                  r.assignedToMe ? (
                    <>
                      <DecideReportForm reportId={r.id} actions={(ACTIONS_FOR[r.targetKind] ?? []).filter((a) => a !== 'UNLIST_PROFILE' || canUnlist)} />
                      <TakeReportForm reportId={r.id} release />
                    </>
                  ) : r.assigned ? (
                    <p className="mt-sm text-caption">در دست بررسی همکار دیگر.</p>
                  ) : (
                    <div className="mt-sm">
                      <TakeReportForm reportId={r.id} release={false} />
                    </div>
                  )
                ) : (
                  <p className="mt-sm text-body-sm">{r.decisionReason}</p>
                )}
              </div>
            </Card>
          ))
        )}
        <Card>
          <h2 className="text-label-lg">اعتراض‌های باز</h2>
          {appeals.length === 0 ? (
            <p className="mt-xs text-body-sm text-text-secondary">اعتراض بازی نیست.</p>
          ) : (
            <ul className="mt-sm space-y-md">
              {appeals.map(({ appeal, report }) => (
                <li key={appeal.id} className="rounded-md border border-border-subtle p-md" data-testid={'finder-appeal-' + appeal.id}>
                  <p className="text-label-md">{TARGET_FA[report.targetKind] ?? report.targetKind}</p>
                  <p className="mt-xs text-body-sm">{'تصمیم: ' + (report.decisionReason ?? '')}</p>
                  <p className="mt-xs text-body-sm">{'اعتراض: ' + appeal.statementFa}</p>
                  {report.decidedByAccountId === actor.accountId ? (
                    <p className="mt-xs text-caption">تصمیم اول با شما بوده است؛ همکار دیگری باید این اعتراض را بررسی کند.</p>
                  ) : (
                    <DecideAppealForm appealId={appeal.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
