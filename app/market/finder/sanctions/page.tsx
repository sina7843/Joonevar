import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
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
  return (
    <OpsShell actor={guard.actor} title="تعلیق و محدودیت" nav={marketNav(guard.actor)} pathname="/market/finder/sanctions">
      <div className="space-y-lg">
        <Alert tone="warning" title="بدون بازپرداخت">
          {NO_REFUND_FA}
        </Alert>
        <Card>
          <h2 className="text-label-lg">ثبت محدودیت</h2>
          <p className="mt-xs text-caption text-text-secondary">پروفایل‌های حساب از جفت‌یابی خارج می‌شوند و درخواست‌های باز با دلیل بسته می‌شوند؛ قرارداد تأییدشده و سابقه دست نمی‌خورد.</p>
          <div className="mt-sm">
            <ImposeSanctionForm canRestrictAccount={hasFinderCapability(guard.actor, 'FINDER_ACCOUNT_RESTRICT')} />
          </div>
        </Card>
        <Card>
          <h2 className="text-label-lg">سابقه</h2>
          <ul className="mt-sm space-y-sm" data-testid="finder-sanctions">
            {rows.map((s) => {
              const live = !s.liftedAt && (!s.endsAt || s.endsAt > now);
              return (
                <li key={s.id} className="rounded-md border border-border-subtle p-sm">
                  <p className="text-label-md">{(s.scope === 'ACCOUNT' ? 'محدودیت حساب' : 'تعلیق جفت‌یابی') + (live ? ' — فعال' : ' — پایان‌یافته')}</p>
                  <p className="mt-xs text-body-sm">{s.reasonFa}</p>
                  <p className="mt-xs text-caption text-text-secondary">
                    {formatInstantFa(s.startsAt) + (s.endsAt ? ' تا ' + formatInstantFa(s.endsAt) : ' تا رفع') + (s.liftedAt ? ' · رفع: ' + (s.liftReasonFa ?? '') : '')}
                  </p>
                  {live ? <LiftSanctionForm sanctionId={s.id} /> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </OpsShell>
  );
}
