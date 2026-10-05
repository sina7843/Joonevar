import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
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
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{live.length.toLocaleString('fa-IR') + ' پلن قابل خرید'}</span>
        <span className="hz-page-header__meta-item">هر انتشار نسخه تازه می‌سازد</span>
      </p>
      <Alert tone="info" title="انتشار پلن، تعرفه نمی‌سازد">
        <span data-testid="plan-page-note">
          تعرفه هر پلن در کلید تنظیمات خودش ثبت می‌شود و خالی بودن آن یعنی «تعیین‌نشده»، نه رایگان. دوره
          فروشگاه فقط با پرداخت تأییدشده روی سرور آغاز می‌شود و تغییر نسخه پلن، دوره‌های فروخته‌شده را
          تغییر نمی‌دهد.
        </span>
      </Alert>

      <Panel title="پلن‌های قابل خرید" count={live.length.toLocaleString('fa-IR')} aside="مبلغ‌ها به تومان">
        {live.length === 0 ? (
          <p className="text-caption text-text-secondary" data-testid="live-plans-empty">
            هنوز پلنی منتشر نشده است.
          </p>
        ) : (
          <ul data-testid="live-plans">
            {live.map((plan) => (
              <li key={plan.id} className="hz-setting">
                <div className="hz-setting__label">
                  <span className="hz-setting__name">{plan.labelFa}</span>
                  <bdi className="hz-setting__key" dir="ltr">
                    {plan.code}
                  </bdi>
                  <span className="hz-setting__hint">
                    {'نسخه ' + plan.version.toLocaleString('fa-IR') + ' · ' + plan.durationDays.toLocaleString('fa-IR') + ' روز · سقف محصول: ' +
                      (plan.productLimit === null ? 'بدون سقف' : plan.productLimit.toLocaleString('fa-IR')) + ' · کارمزد ' + percentFa(plan.commissionPercentBp)}
                  </span>
                </div>
                <div className="hz-setting__end">
                  <span className={plan.priceToman === null ? 'hz-setting__value hz-setting__value--unset' : 'hz-setting__value'}>
                    {plan.priceToman === null ? 'تعیین‌نشده' : plan.priceToman.toLocaleString('fa-IR') + ' تومان'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="hz-desk">
        <Panel title="تاریخچه نسخه‌ها" count={history.length.toLocaleString('fa-IR')}>
          {history.length === 0 ? (
            <div data-testid="plan-history-empty">
              <EmptyState title="هنوز نسخه‌ای منتشر نشده است" description="هر نسخه‌ای که منتشر شود اینجا می‌ماند." />
            </div>
          ) : (
            <ul data-testid="plan-history">
              {history.map((plan) => (
                <li key={plan.id} className="hz-setting">
                  <div className="hz-setting__label">
                    <span className="hz-setting__name">{plan.labelFa}</span>
                    <span className="hz-setting__hint">
                      <bdi dir="ltr">{plan.code}</bdi>
                      {' — نسخه ' + plan.version.toLocaleString('fa-IR') + ' · ' + when(plan.publishedAt)}
                    </span>
                  </div>
                  <div className="hz-setting__end">
                    <StatusBadge tone={plan.status === 'PUBLISHED' ? 'success' : 'neutral'} size="sm">
                      {plan.status === 'PUBLISHED' ? 'منتشرشده' : plan.status === 'ARCHIVED' ? 'بایگانی' : 'پیش‌نویس'}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="انتشار نسخه تازه">
          <SellerPlanForm />
        </Panel>
      </div>
    </OpsShell>
  );
}
