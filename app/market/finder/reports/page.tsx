import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, DeskHead, DocFrame, Panel, PrivateNote, QueueMeta, ViewChips } from '../../../../src/ui/desk.tsx';
import { CaseDrawer } from '../../../../src/ui/desk-drawer.tsx';
import { ageInDays, keyStatus } from '../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
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
 *
 * DS P09 queue; each row opens its P10 desk (subject, evidence previews,
 * take / decide) in a wide Drawer (no `[id]` route). The appeals are a second
 * panel whose rows open their own desk the same way.
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
      <QueueMeta
        total={queue.length}
        noun={closed ? 'گزارش تصمیم‌گرفته' : 'گزارش باز'}
        oldestDays={!closed && queue.length > 0 ? Math.max(...queue.map((r) => ageInDays(r.createdAt) ?? 0)) : null}
      />
      <ViewChips
        label="نمای گزارش‌ها"
        chips={[
          { key: 'open', href: '/market/finder/reports', label: 'گزارش‌های باز', current: !closed },
          { key: 'closed', href: '/market/finder/reports?closed=1', label: 'تصمیم‌گرفته', current: closed },
        ]}
      />
      {queue.length === 0 ? (
        <EmptyState title="گزارشی نیست" description="گزارش‌های تازه اینجا می‌آیند." />
      ) : (
        <CaseList label="گزارش‌های جفت‌یابی">
          {queue.map((r) => (
            <CaseItem
              key={r.id}
              testId={'finder-report-' + r.id}
              type={r.targetFa}
              name={r.categoryFa}
              sub={formatInstantFa(r.createdAt)}
              ageDays={r.status === 'OPEN' ? ageInDays(r.createdAt) : undefined}
              // GAPS #4: no dictionary key for a decided report («تصمیم‌گرفته»).
              status={r.status === 'OPEN' ? keyStatus('OPEN') : { tone: 'neutral', label: 'تصمیم‌گرفته' }}
              owner={r.status === 'OPEN' ? 'SYSTEM' : null}
              ownerLabel={r.assigned && !r.assignedToMe ? 'همکار دیگر' : 'ناظر جفت‌یابی'}
              ownerIsUs={r.status === 'OPEN' && (!r.assigned || r.assignedToMe)}
            >
              <CaseDrawer title="پرونده گزارش جفت‌یابی" testId={'open-finder-report-' + r.id}>
                <DeskHead
                  title={r.categoryFa}
                  status={r.status === 'OPEN' ? keyStatus('OPEN') : { tone: 'neutral', label: 'تصمیم‌گرفته' }}
                  meta={[r.targetFa, formatInstantFa(r.createdAt)]}
                />
                <Panel title="موضوع گزارش">
                  <p className="text-body-sm" data-testid={'finder-report-subject-' + r.id}>
                    {r.subjectFa}
                  </p>
                  {r.details ? <p className="whitespace-pre-line text-body-sm text-text-secondary">{r.details}</p> : null}
                </Panel>
                <Panel title="مدارک گزارش‌دهنده" count={r.evidence.length.toLocaleString('fa-IR')} aside={r.evidence.length > 0 ? <PrivateNote /> : undefined}>
                  {r.evidence.length === 0 ? (
                    <p className="text-body-sm text-text-secondary">مدرکی پیوست نشده است.</p>
                  ) : (
                    <div className="hz-desk__docs">
                      {r.evidence.map((e, i) => (
                        // The test id stays on the frame: the preview swaps <img> for <iframe> when the file is not an image.
                        <div key={e} data-testid="finder-evidence-link">
                          <DocFrame href={'/api/finder/reports/evidence/' + e} label={'مدرک ' + (i + 1).toLocaleString('fa-IR')} />
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
                <Panel title="تصمیم">
                  {r.status === 'OPEN' ? (
                    r.assignedToMe ? (
                      <>
                        <DecideReportForm reportId={r.id} actions={(ACTIONS_FOR[r.targetKind] ?? []).filter((a) => a !== 'UNLIST_PROFILE' || canUnlist)} />
                        <TakeReportForm reportId={r.id} release />
                      </>
                    ) : r.assigned ? (
                      <p className="text-caption text-text-secondary">در دست بررسی همکار دیگر.</p>
                    ) : (
                      <TakeReportForm reportId={r.id} release={false} />
                    )
                  ) : (
                    <p className="text-body-sm">{r.decisionReason}</p>
                  )}
                </Panel>
              </CaseDrawer>
            </CaseItem>
          ))}
        </CaseList>
      )}
      <Panel title="اعتراض‌های باز" count={appeals.length.toLocaleString('fa-IR')}>
        {appeals.length === 0 ? (
          <p className="text-body-sm text-text-secondary">اعتراض بازی نیست.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {appeals.map(({ appeal, report }) => (
              <li key={appeal.id} className="space-y-xs py-md first:pt-0 last:pb-0" data-testid={'finder-appeal-' + appeal.id}>
                <h3 className="text-label-lg">{TARGET_FA[report.targetKind] ?? report.targetKind}</h3>
                <p className="text-body-sm">{'تصمیم: ' + (report.decisionReason ?? '')}</p>
                <p className="text-body-sm">{'اعتراض: ' + appeal.statementFa}</p>
                {report.decidedByAccountId === actor.accountId ? (
                  <p className="text-caption text-text-secondary">تصمیم اول با شما بوده است؛ همکار دیگری باید این اعتراض را بررسی کند.</p>
                ) : (
                  <CaseDrawer title="پرونده اعتراض جفت‌یابی" testId={'open-finder-appeal-' + appeal.id}>
                    <DeskHead title={TARGET_FA[report.targetKind] ?? report.targetKind} status={keyStatus('SUBMITTED')} />
                    <Panel title="تصمیم قبلی و اعتراض">
                      <p className="text-body-sm">{'تصمیم: ' + (report.decisionReason ?? '')}</p>
                      <p className="text-body-sm">{'اعتراض: ' + appeal.statementFa}</p>
                    </Panel>
                    <Panel title="پاسخ به اعتراض">
                      <DecideAppealForm appealId={appeal.id} />
                    </Panel>
                  </CaseDrawer>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </OpsShell>
  );
}
