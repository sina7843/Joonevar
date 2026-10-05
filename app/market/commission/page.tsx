import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { marketNav, OpsShell } from '../../../src/ui/shell.tsx';
import { Panel } from '../../../src/ui/desk.tsx';
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
 *
 * DS P11 entity config: the publish form, then the rule versions as a
 * DataTable (cards below 768).
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

  const live = rules.filter((rule) => rule.status === 'PUBLISHED').length;
  return (
    <OpsShell actor={guard.actor} title="قاعده کارمزد حیوان" nav={marketNav(guard.actor)} pathname="/market/commission">
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{live.toLocaleString('fa-IR') + ' قاعده منتشرشده'}</span>
        <span className="hz-page-header__meta-item">هر انتشار نسخه تازه می‌سازد و نسخه قبلی بایگانی می‌شود</span>
      </p>
      <Alert tone="info" title="بیعانه هر معامله دقیقاً همین کارمزد است">
        <span data-testid="commission-note">
          فرمول = مبلغ ثابت + درصدی از قیمت نهایی، با کف و سقف اختیاری. تا وقتی برای یک گونه قاعده‌ای
          منتشر نشده باشد، تنظیمات عمومی بازار اعمال می‌شود و اگر آن هم تعیین‌نشده باشد، مسیر بیعانه باز
          نمی‌شود. تغییر این نسخه روی معامله‌های ثبت‌شده اثر ندارد.
        </span>
      </Alert>

      <Panel title="انتشار نسخه تازه">
        {options.length === 0 ? (
          <p className="text-caption text-text-secondary" data-testid="commission-no-species">
            هنوز هیچ گونه‌ای در بازار فروش حیوان فعال نیست؛ ابتدا از صفحه «گونه‌های فعال» یکی را باز کنید.
          </p>
        ) : (
          <CommissionRuleForm speciesOptions={options} />
        )}
      </Panel>

      <Panel title="تاریخچه نسخه‌ها" count={rules.length.toLocaleString('fa-IR')} aside="مبلغ‌ها به تومان">
        {rules.length === 0 ? (
          <div data-testid="commission-history-empty">
            <EmptyState
              title="هنوز قاعده‌ای منتشر نشده است"
              description="تا آن زمان، کارمزد از تنظیمات عمومی بازار خوانده می‌شود."
            />
          </div>
        ) : (
          <div className="hz-table-wrap">
            <table className="hz-table hz-table--dense hz-table--stack">
              <caption className="hz-visually-hidden">تاریخچه نسخه‌های قاعده کارمزد</caption>
              <thead>
                <tr>
                  <th scope="col">گونه و فروشنده</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">فرمول</th>
                  <th scope="col">کف / سقف</th>
                  <th scope="col">انتشار</th>
                </tr>
              </thead>
              <tbody data-testid="commission-history">
                {rules.map((rule) => (
                  <tr key={rule.id} data-testid={'rule-' + rule.id}>
                    <td className="hz-table__lead">
                      <div className="hz-case">
                        <span className="hz-case__name">
                          <bdi dir="ltr">{rule.speciesCode}</bdi>
                          {rule.sellerKind === null ? ' — همه فروشندگان' : rule.sellerKind === 'OWNER' ? ' — مالک' : ' — کنل'}
                        </span>
                        <span className="hz-case__sub">نسخه {rule.version.toLocaleString('fa-IR')}</span>
                      </div>
                    </td>
                    <td data-label="وضعیت">
                      <StatusBadge tone={rule.status === 'PUBLISHED' ? 'success' : 'neutral'} size="sm">
                        {rule.status === 'PUBLISHED' ? 'منتشرشده' : rule.status === 'ARCHIVED' ? 'بایگانی' : 'پیش‌نویس'}
                      </StatusBadge>
                    </td>
                    <td data-label="فرمول" className="hz-num">
                      {moneyFa(rule.fixedToman)} تومان + {percentFa(rule.percentBp)}
                    </td>
                    <td data-label="کف / سقف" className="hz-num">
                      کف {moneyFa(rule.minToman)} / سقف {moneyFa(rule.maxToman)}
                    </td>
                    <td data-label="انتشار">{when(rule.publishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </OpsShell>
  );
}
