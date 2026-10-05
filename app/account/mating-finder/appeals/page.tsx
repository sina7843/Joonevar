import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
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
    <PublicShell
      actor={guard.actor}
      title="تصمیم‌های مدیریت و اعتراض"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="تصمیم‌های مدیریت و اعتراض"
          back={{ href: '/account/mating-finder' }}
          meta={['هر تصمیم دلیل دارد و می‌توانید یک بار به آن اعتراض کنید. اعتراض را کسی جز تصمیم‌گیرنده اول بررسی می‌کند.']}
        />
      }
    >
      <div className="space-y-lg">
        {rows.length === 0 ? (
          <EmptyState title="تصمیمی درباره شما ثبت نشده است" description="اگر گزارشی درباره پروفایل یا پیام شما به اقدام برسد، اینجا دیده می‌شود." />
        ) : (
          <ul className="hz-cardlist">
            {rows.map(({ report, appeal }) => (
              <li key={report.id} className="hz-cardlist__item" data-testid={'finder-decision-' + report.id}>
                <div className="hz-cardlist__row">
                  <span className="hz-cardlist__title">{TARGET_FA[report.targetKind] ?? report.targetKind}</span>
                  {appeal ? (
                    <StatusBadge tone={appeal.status === 'OVERTURNED' ? 'success' : appeal.status === 'OPEN' ? 'info' : 'neutral'}>
                      <span data-testid="finder-appeal-status">{APPEAL_FA[appeal.status]}</span>
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="hz-body-sm">
                  <span className="text-text-secondary">دلیل تصمیم: </span>
                  {report.decisionReason}
                </p>
                {report.decidedAt ? (
                  <span className="hz-cardlist__meta inline-flex items-center gap-xs">
                    <Icon name="calendarBlank" size="xs" />
                    {formatInstantFa(report.decidedAt)}
                  </span>
                ) : null}
                {appeal ? (
                  appeal.decisionReasonFa ? (
                    <p className="hz-body-sm border-t border-border-subtle pt-sm">
                      <span className="text-text-secondary">پاسخ اعتراض: </span>
                      {appeal.decisionReasonFa}
                    </p>
                  ) : null
                ) : (
                  <div className="border-t border-border-subtle pt-sm">
                    <AppealForm reportId={report.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
