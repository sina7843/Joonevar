import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { myFinderDecisions } from '../../../../src/finder/reports.ts';
import { TARGET_FA } from '../../../../src/finder/reports-model.ts';
import { AppealForm } from '../../../../src/finder/ops-forms.tsx';

export const dynamic = 'force-dynamic';

const APPEAL_FA: Record<string, string> = { OPEN: 'در حال بررسی', UPHELD: 'تصمیم پابرجا ماند', OVERTURNED: 'اعتراض پذیرفته شد' };

/** Moderation decisions that affected this person, and their appeals — PHASE-4 PROMPT-007. */
export default async function FinderAppealsPage() {
  const guard = await guardRoute('/account/mating-finder/appeals');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await myFinderDecisions(db(), guard.actor);
  return (
    <PublicShell actor={guard.actor} title="تصمیم‌های مدیریت و اعتراض" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">تصمیم‌های مدیریت درباره جفت‌یابی</h1>
          <p className="mt-xs text-caption text-text-secondary">
            هر تصمیم دلیل دارد و می‌توانید یک بار به آن اعتراض کنید. اعتراض را کسی جز تصمیم‌گیرنده اول بررسی می‌کند.
          </p>
        </Card>
        {rows.length === 0 ? (
          <EmptyState title="تصمیمی درباره شما ثبت نشده است" description="اگر گزارشی درباره پروفایل یا پیام شما به اقدام برسد، اینجا دیده می‌شود." />
        ) : (
          rows.map(({ report, appeal }) => (
            <Card key={report.id}>
              <div data-testid={'finder-decision-' + report.id}>
                <p className="text-label-md">{TARGET_FA[report.targetKind] ?? report.targetKind}</p>
                <p className="mt-xs text-body-sm">{report.decisionReason}</p>
                <p className="mt-xs text-caption text-text-secondary">{report.decidedAt ? formatInstantFa(report.decidedAt) : ''}</p>
                {appeal ? (
                  <div className="mt-sm">
                    <StatusBadge tone={appeal.status === 'OVERTURNED' ? 'success' : appeal.status === 'OPEN' ? 'info' : 'neutral'}>
                      <span data-testid="finder-appeal-status">{APPEAL_FA[appeal.status]}</span>
                    </StatusBadge>
                    {appeal.decisionReasonFa ? <p className="mt-xs text-body-sm">{appeal.decisionReasonFa}</p> : null}
                  </div>
                ) : (
                  <AppealForm reportId={report.id} />
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </PublicShell>
  );
}
