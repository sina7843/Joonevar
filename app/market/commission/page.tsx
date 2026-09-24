import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { commissionRuleHistory } from '../../../src/marketplace/commission-rules.ts';
import { marketSpecies } from '../../../src/marketplace/species.ts';
import { CommissionRuleForm } from '../../../src/marketplace/settlement-forms.tsx';

export const dynamic = 'force-dynamic';

const moneyFa = (value: bigint | null) => (value === null ? '—' : value.toLocaleString('fa-IR'));
const percentFa = (bp: number) => (bp / 100).toLocaleString('fa-IR') + '٪';
const when = (value: Date | null) =>
  value === null ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(value);

/**
 * The commission formula, by species and seller kind — PROMPT-006.
 *
 * PRODUCT_DECISIONS §5 makes the deposit exactly this commission, so this page
 * is where the deposit of every future deal is decided. Publishing a version
 * archives the previous one and leaves every struck deal pointing at the row it
 * was priced by.
 */
export default async function CommissionRulesPage() {
  const guard = await guardRoute('/market/commission');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let rules;
  try {
    rules = await commissionRuleHistory(db(), guard.actor);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  // Only a species this market is actually open for: publishing a formula for
  // a closed species would be a tariff for a flow nobody can reach.
  const species = await marketSpecies(db(), 'ANIMAL_SALE');
  const options = species
    .filter((row) => row.enabled)
    .map((row) => ({ value: row.speciesCode, label: row.nameFa }));

  return (
    <OpsShell actor={guard.actor} title="قاعده کارمزد حیوان" nav={marketNav(guard.actor)} pathname="/market/commission">
      <div className="space-y-lg">
        <Alert tone="info" title="بیعانه هر معامله دقیقاً همین کارمزد است">
          <span data-testid="commission-note">
            فرمول = مبلغ ثابت + درصدی از قیمت نهایی، با کف و سقف اختیاری. تا وقتی برای یک گونه قاعده‌ای
            منتشر نشده باشد، تنظیمات عمومی بازار اعمال می‌شود و اگر آن هم تعیین‌نشده باشد، مسیر بیعانه باز
            نمی‌شود. تغییر این نسخه روی معامله‌های ثبت‌شده اثر ندارد.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">انتشار نسخه تازه</h2>
          {options.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="commission-no-species">
              هنوز هیچ گونه‌ای در بازار فروش حیوان فعال نیست؛ ابتدا از صفحه «گونه‌های فعال» یکی را باز کنید.
            </p>
          ) : (
            <div className="mt-lg">
              <CommissionRuleForm speciesOptions={options} />
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">تاریخچه نسخه‌ها</h2>
          {rules.length === 0 ? (
            <div className="mt-lg" data-testid="commission-history-empty">
              <EmptyState
                title="هنوز قاعده‌ای منتشر نشده است"
                description="تا آن زمان، کارمزد از تنظیمات عمومی بازار خوانده می‌شود."
              />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="commission-history">
              {rules.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-sm" data-testid={'rule-' + rule.id}>
                  <StatusBadge tone={rule.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                    {rule.status === 'PUBLISHED' ? 'منتشرشده' : rule.status === 'ARCHIVED' ? 'بایگانی' : 'پیش‌نویس'}
                  </StatusBadge>
                  <span className="text-body-sm">
                    {rule.speciesCode}
                    {rule.sellerKind === null ? ' — همه فروشندگان' : rule.sellerKind === 'OWNER' ? ' — مالک' : ' — کنل'}
                  </span>
                  <span className="text-caption text-text-secondary">نسخه {rule.version.toLocaleString('fa-IR')}</span>
                  <span className="text-caption text-text-secondary">
                    {moneyFa(rule.fixedToman)} تومان + {percentFa(rule.percentBp)}
                  </span>
                  <span className="text-caption text-text-secondary">
                    کف {moneyFa(rule.minToman)} / سقف {moneyFa(rule.maxToman)}
                  </span>
                  <span className="text-caption text-text-secondary">{when(rule.publishedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
