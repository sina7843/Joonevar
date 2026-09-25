import { PublicShell } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { loyaltyFor } from '../../../src/commerce/loyalty.ts';
import { LOYALTY_KIND_FA } from '../../../src/commerce/trust-model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * Points, and what they can and cannot do — PROMPT-012.
 *
 * The page says plainly that points are not money and never become a payment
 * out, because that is true of the code: there is no operation anywhere that
 * converts them to cash.
 */
export default async function RewardsPage() {
  const guard = await guardRoute('/account/rewards');
  if (!guard.ok) throw guard.denied;
  const view = await loyaltyFor(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="امتیاز خرید" pathname="/account/rewards">
      <div className="space-y-lg p-lg">
        <Card>
          <h2 className="text-label-lg">مانده امتیاز</h2>
          <p className="mt-sm text-h2" data-testid="loyalty-balance">
            {fa(view.balance)}
          </p>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="loyalty-value">
            {view.pointValueToman === null
              ? 'ارزش هر امتیاز هنوز ثبت نشده است؛ تا ثبت آن، امتیاز جمع می‌شود ولی خرج نمی‌شود.'
              : 'هر امتیاز ' + fa(view.pointValueToman) + ' تومان در سبد خرید.'}
          </p>
          <Alert tone="info" title="امتیاز پول نیست">
            <span data-testid="loyalty-no-cash">
              امتیاز فقط در سبد خرید به‌جای بخشی از مبلغ می‌نشیند و به هیچ حسابی واریز نمی‌شود.
            </span>
          </Alert>
        </Card>

        {view.expiringSoon.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">امتیازهایی که به‌زودی منقضی می‌شوند</h2>
            <ul className="mt-md space-y-2xs text-body-sm" data-testid="loyalty-expiring">
              {view.expiringSoon.map((lot, index) => (
                <li key={index}>
                  {fa(lot.points)} امتیاز تا {lot.expiresAt.toLocaleDateString('fa-IR')}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-label-lg">دفتر امتیاز</h2>
          {view.entries.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="loyalty-empty">
              هنوز امتیازی ثبت نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-2xs text-body-sm" data-testid="loyalty-entries">
              {view.entries.map((entry) => (
                <li key={entry.id} data-testid={'loyalty-entry-' + entry.id}>
                  {entry.createdAt.toLocaleDateString('fa-IR')} — {LOYALTY_KIND_FA[entry.kind]} — {fa(entry.points)} —{' '}
                  {entry.descriptionFa}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
