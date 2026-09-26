import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { configuredMoney, formatTomanFa } from '../../../src/domain/money.ts';
import { breedOptions } from '../../../src/animals/service.ts';
import { marketSpecies } from '../../../src/marketplace/species.ts';
import { planHistory, planSlots } from '../../../src/finder/plans.ts';
import { ruleHistory } from '../../../src/finder/rules.ts';
import { finderFlagStates } from '../../../src/finder/flags.ts';
import {
  FINDER_AUDIENCE_FA,
  FINDER_DURATION_FA,
  FINDER_LAUNCH_SPECIES,
  RULE_MODE_FA,
  SUSPENSION_POLICY_FA,
  type FinderDuration,
} from '../../../src/finder/model.ts';
import { FinderSpeciesForm, PublishPlanForm, PublishRuleForm, WithdrawPlanForm } from '../../../src/finder/forms.tsx';
import { PublishTemplateForm } from '../../../src/finder/request-forms.tsx';
import { currentTemplate } from '../../../src/finder/contracts.ts';
import { NOT_A_LEGAL_SIGNATURE_FA, REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS, type TemplateClause } from '../../../src/finder/request-model.ts';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const price = (value: bigint | null): string => (value === null ? 'تعیین‌نشده' : formatTomanFa(configuredMoney(value.toString()))!);
const orUnset = (value: number | null, unit: string): string => (value === null ? 'تنظیم‌نشده' : fa(value) + ' ' + unit);

/**
 * Mating-finder configuration — PHASE-4 PROMPT-002.
 *
 * Plans, prices, capacities, breed rules, the species gate and the kill
 * switches are the superadmin's (PRODUCT_DECISIONS §12). Every change here
 * writes a new version or a versioned setting with an audit row; nothing a
 * person already bought or agreed to is rewritten by it.
 */
export default async function AdminMatingFinderPage() {
  const guard = await guardRoute('/admin/mating-finder');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const now = new Date();

  const [flags, slots, history, rules, species, breeds, template] = await Promise.all([
    finderFlagStates(db()),
    planSlots(db(), now),
    planHistory(db()),
    ruleHistory(db()),
    marketSpecies(db(), 'MATING'),
    breedOptions(db()),
    currentTemplate(db()),
  ]);
  const published = rules.filter((rule) => rule.status === 'PUBLISHED');
  const dogBreeds = breeds.filter((breed) => breed.speciesCode === FINDER_LAUNCH_SPECIES).map((b) => ({ value: b.id, label: b.nameFa }));

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/mating-finder" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">جفت‌یابی — تنظیمات پایه</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            هر انتشار یک نسخه تازه و تغییرناپذیر می‌سازد و نسخه قبلی را بایگانی می‌کند. اشتراکی که خریده شده، همان نسخه‌ای را
            نگه می‌دارد که خریده است. قیمت، ظرفیت، بازه سنی و آستانه خویشاوندی هیچ مقدار ازپیش‌تعیین‌شده‌ای ندارند.
          </p>
        </Card>

        <Card>
          <h2 className="text-label-lg">کلیدهای قطع و وصل</h2>
          <p className="mt-xs text-caption text-text-secondary">
            همه بسته شروع می‌شوند و مقدار تنظیم‌نشده بسته خوانده می‌شود. تغییر آن‌ها و مرزهای فنی (انقضای درخواست، کد
            تأیید، رسانه و ظرفیت حساب رایگان) از{' '}
            <Link href="/admin/settings" className="text-text-brand underline underline-offset-4" data-testid="finder-settings-link">
              تنظیمات محصول
            </Link>{' '}
            با دلیل و نسخه انجام می‌شود.
          </p>
          <ul className="mt-md grid gap-sm sm:grid-cols-2 lg:grid-cols-3" data-testid="finder-flags">
            {flags.map((flag) => (
              <li key={flag.key} className="flex items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm">
                <span className="text-body-sm">{flag.labelFa}</span>
                <span data-testid={'finder-flag-' + flag.key}>
                  <StatusBadge tone={flag.enabled ? 'success' : 'neutral'}>{flag.enabled ? 'باز' : 'بسته'}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-label-lg">گونه‌های باز برای جفت‌یابی</h2>
          <p className="mt-xs text-caption text-text-secondary">عرضه اولیه فقط برای سگ است. باز کردن گونه دیگر تصمیم محصولی و حقوقی است و دلیلش ثبت می‌شود.</p>
          <ul className="mt-md space-y-md">
            {species.map((row) => (
              <li key={row.id} className="rounded-lg border border-border-subtle p-md" data-testid={'finder-species-' + row.speciesCode}>
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="text-label-md">{row.nameFa}</span>
                  <StatusBadge tone={row.enabled ? 'success' : 'neutral'}>{row.enabled ? 'باز' : 'بسته'}</StatusBadge>
                </div>
                <FinderSpeciesForm speciesCode={row.speciesCode} enabled={row.enabled} version={row.version} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-label-lg">طرح‌های اشتراک</h2>
          <p className="mt-xs text-caption text-text-secondary">
            دو خانواده مستقل مالک و کنل، هرکدام در چهار مدت. قیمت خالی یعنی طرح دیده می‌شود ولی خریدنی نیست. ظرفیت مورد
            انتظار مالک مشترک ۳ حیوان است، ولی فقط با انتشار صریح شما اعمال می‌شود.
          </p>
          <div className="mt-md space-y-lg">
            {slots.map((slot) => {
              const testId = slot.audience + '-' + slot.durationMonths;
              const current = slot.current;
              return (
                <section key={testId} className="rounded-lg border border-border-subtle p-lg" data-testid={'finder-slot-' + testId}>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <h3 className="text-label-md">
                      {'طرح ' + FINDER_AUDIENCE_FA[slot.audience] + ' — ' + FINDER_DURATION_FA[slot.durationMonths as FinderDuration]}
                    </h3>
                    <span data-testid={'finder-slot-state-' + testId}>
                      <StatusBadge tone={current ? (slot.problemFa ? 'warning' : 'success') : 'neutral'}>
                        {current ? 'نسخه ' + fa(current.version) + (slot.problemFa ? ' — فروخته نمی‌شود' : ' — در فروش') : 'منتشر نشده'}
                      </StatusBadge>
                    </span>
                  </div>
                  {current ? (
                    <p className="mt-xs text-caption text-text-secondary">
                      {current.titleFa + ' · ' + price(current.priceToman) + ' · ظرفیت ' + fa(current.activeAnimalCapacity) + ' · ' + SUSPENSION_POLICY_FA[current.suspensionPolicy]}
                      {slot.problemFa ? ' · ' + slot.problemFa : ''}
                    </p>
                  ) : null}
                  <details className="mt-sm">
                    <summary className="cursor-pointer text-label-md text-text-brand" data-testid={'finder-slot-toggle-' + testId}>
                      {current ? 'انتشار نسخه تازه یا توقف فروش' : 'انتشار این طرح'}
                    </summary>
                  <PublishPlanForm
                    audience={slot.audience}
                    durationMonths={slot.durationMonths}
                    expectedCurrentVersion={current?.version ?? 0}
                    defaults={{
                      titleFa: current?.titleFa ?? '',
                      priceToman: current?.priceToman?.toString() ?? '',
                      activeAnimalCapacity: current?.activeAnimalCapacity ?? '',
                      suspensionPolicy: current?.suspensionPolicy ?? '',
                      noteFa: current?.noteFa ?? '',
                    }}
                    testId={testId}
                  />
                  {current ? <WithdrawPlanForm planVersionId={current.id} version={current.version} testId={testId} /> : null}
                  </details>
                </section>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">تاریخچه نسخه‌های طرح</h2>
          {history.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">هنوز طرحی منتشر نشده است.</p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="finder-plan-history">
              {history.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm">
                  <span className="text-body-sm">
                    {FINDER_AUDIENCE_FA[row.audience] + ' ' + FINDER_DURATION_FA[row.durationMonths as FinderDuration] + ' · نسخه ' + fa(row.version) +
                      ' · ' + price(row.priceToman) + ' · ظرفیت ' + fa(row.activeAnimalCapacity) + ' · ' + formatInstantFa(row.publishedAt) + ' · ' + row.reasonFa}
                    {row.archiveReasonFa ? ' · بایگانی: ' + row.archiveReasonFa : ''}
                  </span>
                  <StatusBadge tone={row.status === 'PUBLISHED' ? 'success' : 'neutral'}>{row.status === 'PUBLISHED' ? 'منتشرشده' : 'بایگانی'}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">قالب قرارداد جفت‌گیری</h2>
          <p className="mt-xs text-caption text-text-secondary">
            {'متن حقوقی بندها با شماست و هیچ متنی از پیش ثبت نشده است. تا انتشار قالب، تنظیم قرارداد بسته است. ' + NOT_A_LEGAL_SIGNATURE_FA}
          </p>
          {template ? (
            <div className="mt-md" data-testid="finder-template-current">
              <p className="text-label-md">{template.titleFa + ' — نسخه ' + fa(template.version)}</p>
              <ul className="mt-xs list-inside list-disc text-caption">
                {(template.clauses as TemplateClause[]).map((c) => (
                  <li key={c.key}>{c.titleFa + (c.required ? ' (اجباری)' : ' (اختیاری)')}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-md text-body-sm" data-testid="finder-template-none">
              قالبی منتشر نشده است.
            </p>
          )}
          <details className="mt-md">
            <summary className="cursor-pointer text-label-md text-text-brand" data-testid="finder-template-toggle">
              {template ? 'انتشار نسخه تازه قالب' : 'انتشار قالب'}
            </summary>
            <PublishTemplateForm
              expectedCurrentVersion={template?.version ?? 0}
              required={REQUIRED_CLAUSE_KEYS.map((key) => ({ value: key, label: REQUIRED_CLAUSE_FA[key] }))}
            />
          </details>
        </Card>

        <Card>
          <h2 className="text-label-lg">قاعده‌های نژاد و جنس</h2>
          <Alert tone="info" title="حالت پایه فقط هشدار است">
            فاصله پایه نر ۱۴ روز و ماده ۶ ماه است و درخواست را نمی‌بندد. بازه سنی و آستانه خویشاوندی تا انتشار شما تنظیم‌نشده
            می‌مانند؛ نژادی که قاعده سنی ندارد، درخواستش بسته می‌ماند و دلیل آن به کاربر گفته می‌شود.
          </Alert>
          <div className="mt-md space-y-lg">
            {published.map((rule) => (
              <section key={rule.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'finder-rule-' + rule.id}>
                <h3 className="text-label-md">
                  {rule.speciesCode + ' · ' + (rule.breedNameFa ?? 'پیش‌فرض گونه') + ' · ' + (rule.sex === 'MALE' ? 'نر' : 'ماده') + ' · نسخه ' + fa(rule.version)}
                </h3>
                <p className="mt-xs text-caption text-text-secondary">
                  {'سن: ' + orUnset(rule.minAgeMonths, 'ماه') + ' تا ' + orUnset(rule.maxAgeMonths, 'ماه') +
                    ' · فاصله: ' + (rule.cooldownDays !== null ? fa(rule.cooldownDays) + ' روز' : fa(rule.cooldownMonths!) + ' ماه') + ' (' + RULE_MODE_FA[rule.cooldownMode] + ')' +
                    ' · خویشاوندی: ' + (rule.kinshipMaxDegree === null ? 'هر درجه شناخته‌شده' : 'تا درجه ' + fa(rule.kinshipMaxDegree)) + ' (' + RULE_MODE_FA[rule.kinshipMode] + ')'}
                </p>
                <details className="mt-sm">
                  <summary className="cursor-pointer text-label-md text-text-brand" data-testid={'finder-rule-toggle-' + rule.id}>
                    انتشار نسخه تازه
                  </summary>
                <PublishRuleForm
                  expectedCurrentVersion={rule.version}
                  breeds={null}
                  defaults={{
                    speciesCode: rule.speciesCode,
                    breedId: rule.breedId,
                    sex: rule.sex,
                    minAgeMonths: rule.minAgeMonths,
                    maxAgeMonths: rule.maxAgeMonths,
                    cooldownUnit: rule.cooldownDays !== null ? 'DAYS' : 'MONTHS',
                    cooldownValue: rule.cooldownDays ?? rule.cooldownMonths,
                    cooldownMode: rule.cooldownMode,
                    kinshipMaxDegree: rule.kinshipMaxDegree,
                    kinshipMode: rule.kinshipMode,
                    warningFa: rule.warningFa ?? '',
                  }}
                  testId={rule.id}
                />
                </details>
              </section>
            ))}
            <section className="rounded-lg border border-border-subtle p-lg" data-testid="finder-rule-new">
              <h3 className="text-label-md">قاعده تازه برای یک نژاد</h3>
              <p className="mt-xs text-caption text-text-secondary">قاعده نژاد بر پیش‌فرض گونه مقدم است. اگر آن نژاد و جنس قاعده دارد، نسخه تازه را از همان کارت منتشر کنید.</p>
              <PublishRuleForm
                expectedCurrentVersion={0}
                breeds={dogBreeds}
                defaults={{
                  speciesCode: FINDER_LAUNCH_SPECIES,
                  breedId: null,
                  sex: '',
                  minAgeMonths: null,
                  maxAgeMonths: null,
                  cooldownUnit: 'DAYS',
                  cooldownValue: null,
                  cooldownMode: 'WARN',
                  kinshipMaxDegree: null,
                  kinshipMode: 'WARN',
                  warningFa: '',
                }}
                testId="new"
              />
            </section>
          </div>
        </Card>
      </div>
    </OpsShell>
  );
}
