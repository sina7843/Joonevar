import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { SectionHeader } from '../../../src/ui/section-header.tsx';
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

const GROUPS = [
  { id: 'flags', label: 'کلیدهای قطع و وصل' },
  { id: 'species', label: 'گونه‌ها' },
  { id: 'plans', label: 'طرح‌های اشتراک' },
  { id: 'history', label: 'تاریخچه نسخه‌ها' },
  { id: 'template', label: 'قالب قرارداد' },
  { id: 'rules', label: 'قاعده‌های نژاد و جنس' },
] as const;

const SUMMARY = 'hz-link hz-link--standalone cursor-pointer';

/**
 * Mating-finder configuration — PHASE-4 PROMPT-002.
 *
 * Plans, prices, capacities, breed rules, the species gate and the kill
 * switches are the superadmin's (PRODUCT_DECISIONS §12). Every change here
 * writes a new version or a versioned setting with an audit row; nothing a
 * person already bought or agreed to is rewritten by it.
 *
 * DS P11: group nav (240) at the start from 1024px, one group card per
 * concern, one row per key/plan/rule; edits open in place.
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
    <OpsShell actor={guard.actor} title="جفت‌یابی" pathname="/admin/mating-finder" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          هر انتشار یک نسخه تازه و تغییرناپذیر می‌سازد و نسخه قبلی را بایگانی می‌کند. اشتراکی که خریده شده، همان نسخه‌ای را
          نگه می‌دارد که خریده است. قیمت، ظرفیت، بازه سنی و آستانه خویشاوندی هیچ مقدار ازپیش‌تعیین‌شده‌ای ندارند.
        </span>
      </p>

      <div className="hz-settings">
        <nav className="hz-settings__nav hz-show-lg self-start" aria-label="گروه‌های تنظیمات جفت‌یابی">
          <p className="hz-settings__nav-title">{fa(GROUPS.length) + ' گروه'}</p>
          {GROUPS.map((group) => (
            <a key={group.id} href={'#mf-' + group.id} className="hz-side-item hz-side-item--dense">
              <span className="hz-side-item__label">{group.label}</span>
            </a>
          ))}
        </nav>

        <div className="hz-settings__main">
          <section id="mf-flags" className="hz-card scroll-mt-s64" aria-labelledby="mf-flags-title">
            <SectionHeader title="کلیدهای قطع و وصل" size="sm" id="mf-flags-title" />
            <p className="mt-xs text-caption text-text-secondary">
              همه بسته شروع می‌شوند و مقدار تنظیم‌نشده بسته خوانده می‌شود. تغییر آن‌ها و مرزهای فنی (انقضای درخواست، کد
              تأیید، رسانه و ظرفیت حساب رایگان) از{' '}
              <Link href="/admin/settings" className="hz-link" data-testid="finder-settings-link">
                تنظیمات محصول
              </Link>{' '}
              با دلیل و نسخه انجام می‌شود.
            </p>
            <ul data-testid="finder-flags">
              {flags.map((flag) => (
                <li key={flag.key} className="hz-setting">
                  <div className="hz-setting__label">
                    <span className="hz-setting__name">{flag.labelFa}</span>
                    <bdi className="hz-setting__key" dir="ltr">
                      {flag.key}
                    </bdi>
                  </div>
                  <div className="hz-setting__end">
                    {/* GAPS #4: no dictionary key for an open/closed flow flag. */}
                    <span data-testid={'finder-flag-' + flag.key}>
                      <StatusBadge tone={flag.enabled ? 'success' : 'neutral'} size="sm">
                        {flag.enabled ? 'باز' : 'بسته'}
                      </StatusBadge>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section id="mf-species" className="hz-card scroll-mt-s64" aria-labelledby="mf-species-title">
            <SectionHeader title="گونه‌های باز برای جفت‌یابی" size="sm" id="mf-species-title" />
            <p className="mt-xs text-caption text-text-secondary">عرضه اولیه فقط برای سگ است. باز کردن گونه دیگر تصمیم محصولی و حقوقی است و دلیلش ثبت می‌شود.</p>
            <ul>
              {species.map((row) => (
                <li key={row.id} className="hz-setting" data-testid={'finder-species-' + row.speciesCode}>
                  <div className="hz-setting__label">
                    <span className="hz-setting__name">{row.nameFa}</span>
                    <bdi className="hz-setting__key" dir="ltr">
                      {row.speciesCode}
                    </bdi>
                  </div>
                  <div className="hz-setting__end">
                    {/* GAPS #4: no dictionary key for an open/closed flow flag. */}
                    <StatusBadge tone={row.enabled ? 'success' : 'neutral'} size="sm">
                      {row.enabled ? 'باز' : 'بسته'}
                    </StatusBadge>
                  </div>
                  <div className="col-span-full">
                    <FinderSpeciesForm speciesCode={row.speciesCode} enabled={row.enabled} version={row.version} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section id="mf-plans" className="hz-card scroll-mt-s64" aria-labelledby="mf-plans-title">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <SectionHeader title="طرح‌های اشتراک" size="sm" id="mf-plans-title" />
              <span className="text-caption text-text-secondary">مبلغ‌ها به تومان</span>
            </div>
            <p className="mt-xs text-caption text-text-secondary">
              دو خانواده مستقل مالک و کنل، هرکدام در چهار مدت. قیمت خالی یعنی طرح دیده می‌شود ولی خریدنی نیست. ظرفیت مورد
              انتظار مالک مشترک ۳ حیوان است، ولی فقط با انتشار صریح شما اعمال می‌شود.
            </p>
            <ul>
              {slots.map((slot) => {
                const testId = slot.audience + '-' + slot.durationMonths;
                const current = slot.current;
                return (
                  <li key={testId} className="hz-setting" data-testid={'finder-slot-' + testId}>
                    <div className="hz-setting__label">
                      <h3 className="hz-setting__name">
                        {'طرح ' + FINDER_AUDIENCE_FA[slot.audience] + ' — ' + FINDER_DURATION_FA[slot.durationMonths as FinderDuration]}
                      </h3>
                      {current ? (
                        <span className="hz-setting__hint">
                          {current.titleFa + ' · ' + price(current.priceToman) + ' · ظرفیت ' + fa(current.activeAnimalCapacity) + ' · ' + SUSPENSION_POLICY_FA[current.suspensionPolicy]}
                          {slot.problemFa ? ' · ' + slot.problemFa : ''}
                        </span>
                      ) : (
                        <span className="hz-setting__hint">تا انتشار، این طرح خریدنی نیست.</span>
                      )}
                    </div>
                    <div className="hz-setting__end">
                      {/* GAPS #4: no dictionary key for a plan slot's sale state (version + on sale / not sold). */}
                      <span data-testid={'finder-slot-state-' + testId}>
                        <StatusBadge tone={current ? (slot.problemFa ? 'warning' : 'success') : 'neutral'} size="sm">
                          {current ? 'نسخه ' + fa(current.version) + (slot.problemFa ? ' — فروخته نمی‌شود' : ' — در فروش') : 'منتشر نشده'}
                        </StatusBadge>
                      </span>
                    </div>
                    <details className="col-span-full">
                      <summary className={SUMMARY} data-testid={'finder-slot-toggle-' + testId}>
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
                  </li>
                );
              })}
            </ul>
          </section>

          <section id="mf-history" className="hz-card scroll-mt-s64" aria-labelledby="mf-history-title">
            <SectionHeader title="تاریخچه نسخه‌های طرح" size="sm" id="mf-history-title" count={fa(history.length)} />
            {history.length === 0 ? (
              <p className="mt-md text-body-sm text-text-secondary">هنوز طرحی منتشر نشده است.</p>
            ) : (
              <ul data-testid="finder-plan-history">
                {history.map((row) => (
                  <li key={row.id} className="hz-setting">
                    <div className="hz-setting__label">
                      <span className="hz-setting__name">
                        {FINDER_AUDIENCE_FA[row.audience] + ' ' + FINDER_DURATION_FA[row.durationMonths as FinderDuration] + ' · نسخه ' + fa(row.version)}
                      </span>
                      <span className="hz-setting__hint">
                        {price(row.priceToman) + ' · ظرفیت ' + fa(row.activeAnimalCapacity) + ' · ' + formatInstantFa(row.publishedAt) + ' · ' + row.reasonFa}
                        {row.archiveReasonFa ? ' · بایگانی: ' + row.archiveReasonFa : ''}
                      </span>
                    </div>
                    <div className="hz-setting__end">
                      <StatusBadge status={row.status} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="mf-template" className="hz-card scroll-mt-s64 space-y-md" aria-labelledby="mf-template-title">
            <SectionHeader title="قالب قرارداد جفت‌گیری" size="sm" id="mf-template-title" />
            <p className="text-caption text-text-secondary">
              {'متن حقوقی بندها با شماست و هیچ متنی از پیش ثبت نشده است. تا انتشار قالب، تنظیم قرارداد بسته است. ' + NOT_A_LEGAL_SIGNATURE_FA}
            </p>
            {template ? (
              <div data-testid="finder-template-current">
                <h3 className="text-label-lg">{template.titleFa + ' — نسخه ' + fa(template.version)}</h3>
                <ul className="mt-xs list-inside list-disc text-body-sm">
                  {(template.clauses as TemplateClause[]).map((c) => (
                    <li key={c.key}>{c.titleFa + (c.required ? ' (اجباری)' : ' (اختیاری)')}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="hz-setting__value--unset text-body-sm" data-testid="finder-template-none">
                قالبی منتشر نشده است.
              </p>
            )}
            <details>
              <summary className={SUMMARY} data-testid="finder-template-toggle">
                {template ? 'انتشار نسخه تازه قالب' : 'انتشار قالب'}
              </summary>
              <PublishTemplateForm
                expectedCurrentVersion={template?.version ?? 0}
                required={REQUIRED_CLAUSE_KEYS.map((key) => ({ value: key, label: REQUIRED_CLAUSE_FA[key] }))}
              />
            </details>
          </section>

          <section id="mf-rules" className="hz-card scroll-mt-s64 space-y-md" aria-labelledby="mf-rules-title">
            <SectionHeader title="قاعده‌های نژاد و جنس" size="sm" id="mf-rules-title" count={fa(published.length)} />
            <Alert tone="info" title="حالت پایه فقط هشدار است">
              فاصله پایه نر ۱۴ روز و ماده ۶ ماه است و درخواست را نمی‌بندد. بازه سنی و آستانه خویشاوندی تا انتشار شما تنظیم‌نشده
              می‌مانند؛ نژادی که قاعده سنی ندارد، درخواستش بسته می‌ماند و دلیل آن به کاربر گفته می‌شود.
            </Alert>
            <ul>
              {published.map((rule) => (
                <li key={rule.id} className="hz-setting" data-testid={'finder-rule-' + rule.id}>
                  <div className="hz-setting__label">
                    <h3 className="hz-setting__name">
                      {(rule.breedNameFa ?? 'پیش‌فرض گونه') + ' · ' + (rule.sex === 'MALE' ? 'نر' : 'ماده') + ' · نسخه ' + fa(rule.version)}
                    </h3>
                    <bdi className="hz-setting__key" dir="ltr">
                      {rule.speciesCode}
                    </bdi>
                    <span className="hz-setting__hint">
                      {'سن: ' + orUnset(rule.minAgeMonths, 'ماه') + ' تا ' + orUnset(rule.maxAgeMonths, 'ماه') +
                        ' · فاصله: ' + (rule.cooldownDays !== null ? fa(rule.cooldownDays) + ' روز' : fa(rule.cooldownMonths!) + ' ماه') + ' (' + RULE_MODE_FA[rule.cooldownMode] + ')' +
                        ' · خویشاوندی: ' + (rule.kinshipMaxDegree === null ? 'هر درجه شناخته‌شده' : 'تا درجه ' + fa(rule.kinshipMaxDegree)) + ' (' + RULE_MODE_FA[rule.kinshipMode] + ')'}
                    </span>
                  </div>
                  <details className="col-span-full">
                    <summary className={SUMMARY} data-testid={'finder-rule-toggle-' + rule.id}>
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
                </li>
              ))}
            </ul>
            <div className="hz-card hz-card--subtle" data-testid="finder-rule-new">
              <h3 className="text-label-lg">قاعده تازه برای یک نژاد</h3>
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
            </div>
          </section>
        </div>
      </div>
    </OpsShell>
  );
}
