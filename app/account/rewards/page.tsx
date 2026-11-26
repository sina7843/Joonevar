import { PublicShell } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { loyaltyFor } from '../../../src/commerce/loyalty.ts';
import { LOYALTY_KIND_FA } from '../../../src/commerce/trust-model.ts';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';

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
    <PublicShell
      actor={guard.actor}
      title="امتیاز خرید"
      pathname="/account/rewards"
      header={<PageHeader title="امتیاز خرید" back={{ href: '/dashboard' }} meta={['امتیاز فقط در سبد خرید فروشگاه خرج می‌شود.']} />}
    >
      <div className="space-y-xl">
        <Card className="space-y-sm">
          <SectionHeader title="مانده امتیاز" size="sm" />
          <p className="text-h1" data-testid="loyalty-balance">
            {fa(view.balance)}
          </p>
          <p className="hz-caption" data-testid="loyalty-value">
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
          <Card className="space-y-md">
            <SectionHeader title="امتیازهایی که به‌زودی منقضی می‌شوند" size="sm" />
            <ul className="space-y-xs" data-testid="loyalty-expiring">
              {view.expiringSoon.map((lot, index) => (
                <li key={index} className="hz-inline-msg hz-inline-msg--warning">
                  <Icon name="hourglassMedium" size="xs" />
                  <span className="hz-inline-msg__text">
                    {fa(lot.points)} امتیاز تا {lot.expiresAt.toLocaleDateString('fa-IR')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="space-y-md">
          <SectionHeader title="دفتر امتیاز" size="sm" />
          {view.entries.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="loyalty-empty">
              هنوز امتیازی ثبت نشده است.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle" data-testid="loyalty-entries">
              {view.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-sm py-sm" data-testid={'loyalty-entry-' + entry.id}>
                  <span className="min-w-0">
                    <span className="block text-label-sm">{LOYALTY_KIND_FA[entry.kind] + ' — ' + entry.descriptionFa}</span>
                    <span className="hz-caption">{entry.createdAt.toLocaleDateString('fa-IR')}</span>
                  </span>
                  <span className="text-label-lg">{fa(entry.points)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
