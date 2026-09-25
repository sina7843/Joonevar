import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { planHistory, publishedPlans } from '../../../src/commerce/plans.ts';
import { SellerPlanForm } from '../../../src/marketplace/settlement-forms.tsx';

export const dynamic = 'force-dynamic';

const percentFa = (bp: number) => (bp / 100).toLocaleString('fa-IR') + '٪';
const when = (value: Date | null) =>
  value === null ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(value);

/**
 * Seller plans — PROMPT-008.
 *
 * A plan version says how long a period lasts, how many products it allows,
 * what commission it carries and what it lets a store do with promotion.
 * Publishing a new version archives the previous one and changes nothing for
 * the periods already sold, which is why a store's subscription freezes what it
 * bought rather than pointing at whatever the plan says today.
 */
export default async function SellerPlansPage() {
  const guard = await guardRoute('/market/plans');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let history;
  try {
    history = await planHistory(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }
  const live = await publishedPlans(db());

  return (
    <OpsShell actor={guard.actor} title="پلن‌های فروشندگی" nav={marketNav(guard.actor)} pathname="/market/plans">
      <div className="space-y-lg">
        <Alert tone="info" title="انتشار پلن، تعرفه نمی‌سازد">
          <span data-testid="plan-page-note">
            تعرفه هر پلن در کلید تنظیمات خودش ثبت می‌شود و خالی بودن آن یعنی «تعیین‌نشده»، نه رایگان. دوره
            فروشگاه فقط با پرداخت تأییدشده روی سرور آغاز می‌شود و تغییر نسخه پلن، دوره‌های فروخته‌شده را
            تغییر نمی‌دهد.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">پلن‌های قابل خرید</h2>
          {live.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="live-plans-empty">
              هنوز پلنی منتشر نشده است.
            </p>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="live-plans">
              {live.map((plan) => (
                <li key={plan.id} className="flex flex-wrap items-center gap-sm text-body-sm">
                  <StatusBadge tone="success">{plan.code}</StatusBadge>
                  <span>{plan.labelFa}</span>
                  <span className="text-caption text-text-secondary">نسخه {plan.version.toLocaleString('fa-IR')}</span>
                  <span className="text-caption text-text-secondary">
                    {plan.durationDays.toLocaleString('fa-IR')} روز
                  </span>
                  <span className="text-caption text-text-secondary">
                    سقف محصول: {plan.productLimit === null ? 'بدون سقف' : plan.productLimit.toLocaleString('fa-IR')}
                  </span>
                  <span className="text-caption text-text-secondary">کارمزد {percentFa(plan.commissionPercentBp)}</span>
                  <span className="text-caption text-text-secondary">
                    تعرفه: {plan.priceToman === null ? 'تعیین‌نشده' : plan.priceToman.toLocaleString('fa-IR') + ' تومان'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">انتشار نسخه تازه</h2>
          <div className="mt-lg">
            <SellerPlanForm />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">تاریخچه نسخه‌ها</h2>
          {history.length === 0 ? (
            <div className="mt-lg" data-testid="plan-history-empty">
              <EmptyState title="هنوز نسخه‌ای منتشر نشده است" description="هر نسخه‌ای که منتشر شود اینجا می‌ماند." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="plan-history">
              {history.map((plan) => (
                <li key={plan.id} className="flex flex-wrap items-center gap-sm text-body-sm">
                  <StatusBadge tone={plan.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {plan.status === 'PUBLISHED' ? 'منتشرشده' : plan.status === 'ARCHIVED' ? 'بایگانی' : 'پیش‌نویس'}
                  </StatusBadge>
                  <span>{plan.labelFa}</span>
                  <span className="text-caption text-text-secondary">
                    {plan.code} — نسخه {plan.version.toLocaleString('fa-IR')}
                  </span>
                  <span className="text-caption text-text-secondary">{when(plan.publishedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
