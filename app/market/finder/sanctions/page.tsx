import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Panel } from '../../../../src/ui/desk.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { NO_REFUND_FA, sanctionsList } from '../../../../src/finder/sanctions.ts';
import { hasFinderCapability } from '../../../../src/finder/model.ts';
import { ImposeSanctionForm, LiftSanctionForm } from '../../../../src/finder/ops-forms.tsx';

export const dynamic = 'force-dynamic';

/** Finder suspensions and account restrictions — PHASE-4 PROMPT-007. Superadmin only; never a refund. */
export default async function FinderSanctionsPage() {
  const guard = await guardRoute('/market/finder/sanctions');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  let rows;
  try {
    rows = await sanctionsList(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const now = new Date();
  const active = rows.filter((row) => !row.liftedAt && (!row.endsAt || row.endsAt > now)).length;
  return (
    <OpsShell actor={guard.actor} title="تعلیق و محدودیت" nav={marketNav(guard.actor)} pathname="/market/finder/sanctions">
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{active.toLocaleString('fa-IR') + ' محدودیت فعال'}</span>
        <span className="hz-page-header__meta-item">{rows.length.toLocaleString('fa-IR') + ' مورد در سابقه'}</span>
      </p>
      <Alert tone="warning" title="بدون بازپرداخت">
        {NO_REFUND_FA}
      </Alert>
      <div className="hz-desk">
        <Panel title="سابقه" count={rows.length.toLocaleString('fa-IR')}>
          {rows.length === 0 ? (
            <p className="text-body-sm text-text-secondary">هنوز محدودیتی ثبت نشده است.</p>
          ) : null}
          <ul className="divide-y divide-border-subtle" data-testid="finder-sanctions">
            {rows.map((s) => {
              const live = !s.liftedAt && (!s.endsAt || s.endsAt > now);
              return (
                <li key={s.id} className="space-y-xs py-md first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <h3 className="text-label-lg">{s.scope === 'ACCOUNT' ? 'محدودیت حساب' : 'تعلیق جفت‌یابی'}</h3>
                    {/* GAPS #4: no dictionary key for a live/ended sanction (ACTIVE would read as success). */}
                    <StatusBadge tone={live ? 'warning' : 'neutral'} size="sm">
                      {live ? 'فعال' : 'پایان‌یافته'}
                    </StatusBadge>
                  </div>
                  <p className="text-body-sm">{s.reasonFa}</p>
                  <p className="text-caption text-text-secondary">
                    {formatInstantFa(s.startsAt) + (s.endsAt ? ' تا ' + formatInstantFa(s.endsAt) : ' تا رفع') + (s.liftedAt ? ' · رفع: ' + (s.liftReasonFa ?? '') : '')}
                  </p>
                  {live ? <LiftSanctionForm sanctionId={s.id} /> : null}
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="ثبت محدودیت">
          <p className="text-caption text-text-secondary">پروفایل‌های حساب از جفت‌یابی خارج می‌شوند و درخواست‌های باز با دلیل بسته می‌شوند؛ قرارداد تأییدشده و سابقه دست نمی‌خورد.</p>
          <ImposeSanctionForm canRestrictAccount={hasFinderCapability(guard.actor, 'FINDER_ACCOUNT_RESTRICT')} />
        </Panel>
      </div>
    </OpsShell>
  );
}
