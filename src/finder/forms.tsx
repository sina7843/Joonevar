'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import {
  buyFinderPlanAction,
  publishFinderPlanAction,
  publishFinderRuleAction,
  setFinderSpeciesAction,
  withdrawFinderPlanAction,
  type FinderFormState,
} from './actions.ts';

const EMPTY: FinderFormState = {};

const SUSPENSION_OPTIONS = [
  { value: 'PERIOD_CONTINUES_NO_REFUND', label: 'در تعلیق، دوره ادامه می‌یابد؛ بدون بازپرداخت خودکار' },
  { value: 'PERIOD_PAUSED_NO_REFUND', label: 'در تعلیق، دوره متوقف می‌شود؛ بدون بازپرداخت خودکار' },
];
const MODE_OPTIONS = [
  { value: 'WARN', label: 'فقط هشدار' },
  { value: 'BLOCK', label: 'مانع درخواست' },
];

/** The plan version is the only thing sent; the price is frozen on the server (§22). */
export function BuyPlanForm({
  planVersionId,
  label,
  disabledReasonFa,
  testId,
}: {
  planVersionId: string;
  label: string;
  disabledReasonFa: string | null;
  testId: string;
}) {
  const [state, submit, pending] = useActionState(buyFinderPlanAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-sm" data-testid={'finder-buy-form-' + testId}>
      <input type="hidden" name="planVersionId" value={planVersionId} />
      <Result state={state} testId={'finder-buy-result-' + testId} />
      {disabledReasonFa ? (
        <p className="text-caption text-text-secondary" data-testid={'finder-buy-blocked-' + testId}>
          {disabledReasonFa}
        </p>
      ) : (
        <Button type="submit" disabled={pending} data-testid={'finder-buy-' + testId}>
          {pending ? 'در حال انتقال به درگاه…' : label}
        </Button>
      )}
    </form>
  );
}

export interface PlanDefaults {
  readonly titleFa: string;
  readonly priceToman: string;
  readonly activeAnimalCapacity: number | '';
  readonly suspensionPolicy: string;
  readonly noteFa: string;
}

/** Publishing writes a new immutable version; the version the operator saw guards against a stale panel. */
export function PublishPlanForm({
  audience,
  durationMonths,
  expectedCurrentVersion,
  defaults,
  testId,
}: {
  audience: string;
  durationMonths: number;
  expectedCurrentVersion: number;
  defaults: PlanDefaults;
  testId: string;
}) {
  const [state, submit, pending] = useActionState(publishFinderPlanAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md grid gap-md sm:grid-cols-2" data-testid={'finder-plan-form-' + testId}>
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="durationMonths" value={durationMonths} />
      <input type="hidden" name="expectedCurrentVersion" value={expectedCurrentVersion} />
      <TextField label="عنوان طرح" name="titleFa" required maxLength={120} defaultValue={defaults.titleFa} data-testid={'finder-plan-title-' + testId} />
      <TextField
        label="قیمت (تومان)"
        name="priceToman"
        inputMode="numeric"
        ltr
        hint="خالی = هنوز تعیین نشده؛ طرح نمایش داده می‌شود ولی فروخته نمی‌شود."
        defaultValue={defaults.priceToman}
        data-testid={'finder-plan-price-' + testId}
      />
      <TextField
        label="ظرفیت حیوان فعال"
        name="activeAnimalCapacity"
        type="number"
        min={1}
        required
        ltr
        defaultValue={defaults.activeAnimalCapacity}
        data-testid={'finder-plan-capacity-' + testId}
      />
      <SelectField
        label="سیاست تعلیق"
        name="suspensionPolicy"
        required
        options={SUSPENSION_OPTIONS}
        defaultValue={defaults.suspensionPolicy}
        data-testid={'finder-plan-suspension-' + testId}
      />
      <TextField label="شروع فروش (اختیاری)" name="purchasableFrom" type="date" ltr />
      <TextField label="پایان فروش (اختیاری)" name="purchasableUntil" type="date" ltr />
      <div className="sm:col-span-2">
        <TextAreaField label="توضیح برای خریدار (اختیاری)" name="noteFa" rows={2} maxLength={500} defaultValue={defaults.noteFa} />
      </div>
      <div className="sm:col-span-2">
        <TextField label="دلیل انتشار این نسخه" name="reasonFa" required maxLength={500} data-testid={'finder-plan-reason-' + testId} />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid={'finder-plan-publish-' + testId}>
          {expectedCurrentVersion === 0 ? 'انتشار طرح' : 'انتشار نسخه تازه'}
        </Button>
        <Result state={state} testId={'finder-plan-result-' + testId} />
      </div>
    </form>
  );
}

export function WithdrawPlanForm({ planVersionId, version, testId }: { planVersionId: string; version: number; testId: string }) {
  const [state, submit, pending] = useActionState(withdrawFinderPlanAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid={'finder-withdraw-form-' + testId}>
      <input type="hidden" name="planVersionId" value={planVersionId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div className="min-w-[12rem] flex-1">
        <TextField label="دلیل توقف فروش" name="reasonFa" required maxLength={500} />
      </div>
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'finder-withdraw-' + testId}>
        توقف فروش
      </Button>
      <div className="w-full">
        <Result state={state} testId={'finder-withdraw-result-' + testId} />
      </div>
    </form>
  );
}

export interface RuleDefaults {
  readonly speciesCode: string;
  readonly breedId: string | null;
  readonly sex: 'MALE' | 'FEMALE' | '';
  readonly minAgeMonths: number | null;
  readonly maxAgeMonths: number | null;
  readonly cooldownUnit: 'DAYS' | 'MONTHS';
  readonly cooldownValue: number | null;
  readonly cooldownMode: string;
  readonly kinshipMaxDegree: number | null;
  readonly kinshipMode: string;
  readonly warningFa: string;
}

/**
 * One form for both a new version of an existing rule (key fixed, current
 * version as guard) and a new breed rule (key chosen, guard 0).
 */
export function PublishRuleForm({
  defaults,
  expectedCurrentVersion,
  breeds,
  testId,
}: {
  defaults: RuleDefaults;
  expectedCurrentVersion: number;
  /** Given only for a new rule; an existing rule's key cannot change. */
  breeds: ReadonlyArray<{ value: string; label: string }> | null;
  testId: string;
}) {
  const [state, submit, pending] = useActionState(publishFinderRuleAction, EMPTY);
  const num = (v: number | null) => (v === null ? '' : v);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid={'finder-rule-form-' + testId}>
      <input type="hidden" name="speciesCode" value={defaults.speciesCode} />
      <input type="hidden" name="expectedCurrentVersion" value={expectedCurrentVersion} />
      {breeds ? (
        <>
          <SelectField label="نژاد" name="breedId" required options={breeds} data-testid={'finder-rule-breed-' + testId} />
          <SelectField
            label="جنس"
            name="sex"
            required
            options={[
              { value: 'MALE', label: 'نر' },
              { value: 'FEMALE', label: 'ماده' },
            ]}
            data-testid={'finder-rule-sex-' + testId}
          />
        </>
      ) : (
        <>
          <input type="hidden" name="breedId" value={defaults.breedId ?? ''} />
          <input type="hidden" name="sex" value={defaults.sex} />
        </>
      )}
      <TextField label="حداقل سن (ماه)" name="minAgeMonths" type="number" min={0} ltr defaultValue={num(defaults.minAgeMonths)} hint="خالی = تنظیم‌نشده" />
      <TextField label="حداکثر سن (ماه)" name="maxAgeMonths" type="number" min={1} ltr defaultValue={num(defaults.maxAgeMonths)} hint="خالی = تنظیم‌نشده" />
      <TextField label="فاصله جفت‌گیری" name="cooldownValue" type="number" min={0} required ltr defaultValue={num(defaults.cooldownValue)} />
      <SelectField
        label="واحد فاصله"
        name="cooldownUnit"
        required
        options={[
          { value: 'DAYS', label: 'روز' },
          { value: 'MONTHS', label: 'ماه' },
        ]}
        defaultValue={defaults.cooldownUnit}
      />
      <SelectField label="رفتار فاصله جفت‌گیری" name="cooldownMode" required options={MODE_OPTIONS} defaultValue={defaults.cooldownMode} />
      <TextField
        label="آستانه درجه خویشاوندی"
        name="kinshipMaxDegree"
        type="number"
        min={1}
        max={6}
        ltr
        defaultValue={num(defaults.kinshipMaxDegree)}
        hint="۱ = والد/فرزند و خواهر/برادر تنی؛ خالی = هر خویشاوندی شناخته‌شده"
      />
      <SelectField label="رفتار خویشاوندی" name="kinshipMode" required options={MODE_OPTIONS} defaultValue={defaults.kinshipMode} />
      <div className="sm:col-span-2 lg:col-span-3">
        <TextAreaField label="متن هشدار (اختیاری)" name="warningFa" rows={2} maxLength={500} defaultValue={defaults.warningFa} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <TextField label="دلیل انتشار" name="reasonFa" required maxLength={500} data-testid={'finder-rule-reason-' + testId} />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={pending} data-testid={'finder-rule-publish-' + testId}>
          {expectedCurrentVersion === 0 ? 'انتشار قاعده نژاد' : 'انتشار نسخه تازه'}
        </Button>
        <Result state={state} testId={'finder-rule-result-' + testId} />
      </div>
    </form>
  );
}

export function FinderSpeciesForm({
  speciesCode,
  enabled,
  version,
}: {
  speciesCode: string;
  enabled: boolean;
  version: number;
}) {
  const [state, submit, pending] = useActionState(setFinderSpeciesAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid={'finder-species-form-' + speciesCode}>
      <input type="hidden" name="speciesCode" value={speciesCode} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div className="min-w-[12rem] flex-1">
        <TextField label="دلیل" name="reasonFa" required maxLength={500} />
      </div>
      <Button type="submit" tone={enabled ? 'ghost' : 'primary'} disabled={pending} data-testid={'finder-species-toggle-' + speciesCode}>
        {enabled ? 'بستن جفت‌یابی این گونه' : 'باز کردن جفت‌یابی این گونه'}
      </Button>
      <div className="w-full">
        <Result state={state} testId={'finder-species-result-' + speciesCode} />
      </div>
    </form>
  );
}
