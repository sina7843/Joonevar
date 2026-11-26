'use client';

import { useActionState, useState } from 'react';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { TextAreaField } from '../ui/field.tsx';
import { Check, Result } from './directory-forms.tsx';
import { TRUSTED_DECISIONS, TRUSTED_DECISION_DESC_FA, TRUSTED_DECISION_FA } from './trusted-model.ts';
import { DecisionForm } from '../ui/decision.tsx';
import { decideTrustedCaseAction, reviseTrustedApplicationAction, submitTrustedApplicationAction, type TrustedState } from './trusted-actions.ts';

const EMPTY: TrustedState = {};

export interface TrustedEquipmentOption {
  readonly code: string;
  readonly nameFa: string;
}

/**
 * The trusted application, or a new version of it.
 *
 * Two things are required and neither is a file: accepting the published terms,
 * and declaring that a microchip reader exists. Anything else the applicant
 * declares is optional and is shown everywhere as «تجهیزات اعلام‌شده».
 */
export function TrustedApplicationForm({
  mode,
  termsFa,
  termsVersion,
  declarationVersion,
  equipment,
  caseId,
  version,
}: {
  mode: 'NEW' | 'REVISION';
  termsFa: string;
  termsVersion: string;
  declarationVersion: string;
  equipment: readonly TrustedEquipmentOption[];
  caseId?: string;
  version?: number;
}) {
  const [state, submit, pending] = useActionState(mode === 'REVISION' ? reviseTrustedApplicationAction : submitTrustedApplicationAction, EMPTY);
  const [accepted, setAccepted] = useState(false);
  const [declared, setDeclared] = useState(false);
  const testId = mode === 'REVISION' ? 'trusted-revision-form' : 'trusted-application-form';

  return (
    <form action={submit} className="space-y-lg" data-testid={testId}>
      {mode === 'REVISION' ? (
        <>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="expectedVersion" value={version} />
        </>
      ) : null}
      <input type="hidden" name="acceptedTermsVersion" value={accepted ? termsVersion : ''} />
      <input type="hidden" name="microchipReaderDeclared" value={declared ? 'YES' : 'NO'} />

      <section className="space-y-sm">
        <h3 className="text-label-lg">{'تعهدنامه (نسخه ' + termsVersion + ')'}</h3>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border-default p-md text-body-sm whitespace-pre-line" data-testid="trusted-terms-text">
          {termsFa}
        </div>
        <label className="flex items-start gap-sm text-body-sm">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-2xs size-[var(--size-selection-md)]"
            data-testid="trusted-accept-terms"
          />
          {'متن بالا را خواندم و نسخه ' + termsVersion + ' آن را می‌پذیرم.'}
        </label>
      </section>

      <section className="space-y-sm">
        <h3 className="text-label-lg">{'خوداظهاری تجهیزات (نسخه ' + declarationVersion + ')'}</h3>
        <label className="flex items-start gap-sm text-body-sm">
          <input
            type="checkbox"
            checked={declared}
            onChange={(event) => setDeclared(event.target.checked)}
            className="mt-2xs size-[var(--size-selection-md)]"
            data-testid="trusted-declare-reader"
          />
          اعلام می‌کنم دستگاه میکروچیپ‌ریدر در اختیار دارم. برای این مورد مدرکی لازم نیست و هرجا نمایش داده شود، «تجهیزات اعلام‌شده» نوشته می‌شود.
        </label>
        {equipment.length > 0 ? (
          <fieldset className="space-y-2xs">
            <legend className="text-label-sm">سایر تجهیزات اعلام‌شده (اختیاری)</legend>
            {equipment.map((item) => (
              <Check key={item.code} name="equipmentCodes" value={item.code} label={item.nameFa} defaultChecked={false} testId={'trusted-equipment-' + item.code} />
            ))}
          </fieldset>
        ) : null}
      </section>

      <TextAreaField label="توضیح (اختیاری)" name="statementFa" rows={3} maxLength={1000} data-testid="trusted-statement" />

      {!accepted || !declared ? (
        <Alert tone="info" title="برای ارسال، پذیرش تعهدنامه و خوداظهاری تجهیزات لازم است" />
      ) : null}
      <Result state={state} testId="trusted-application-result" />
      <Button type="submit" block disabled={pending || !accepted || !declared} data-testid={mode === 'REVISION' ? 'resubmit-trusted' : 'submit-trusted'}>
        {pending ? 'در حال ثبت…' : mode === 'REVISION' ? 'ارسال نسخه اصلاح‌شده' : 'ثبت درخواست دامپزشک معتمد'}
      </Button>
    </form>
  );
}

/**
 * The association's decision on one trusted application (DS P10 panel).
 * The decision service still requires a reason for every outcome (approval
 * included), so the reason is asked for all three; the consequence sits under
 * each label (DS DecisionDesk).
 */
export function DecideTrustedCaseForm({ caseId, version }: { caseId: string; version: number }) {
  return (
    <DecisionForm
      action={decideTrustedCaseAction}
      hidden={{ caseId, expectedVersion: version }}
      formTestId="trusted-decision-form"
      submitTestId="submit-trusted-decision"
      reasonName="reasonFa"
      reasonTestId="trusted-decision-reason"
      reasonFor={TRUSTED_DECISIONS}
      reasonLabel={(value) => (value === 'REJECT' ? 'دلیل رد' : value === 'REQUEST_CORRECTION' ? 'دلیل اصلاح' : 'دلیل تأیید')}
      audience="به متقاضی نمایش داده می‌شود"
      drafts={['تعهدنامه یا خوداظهاری تجهیزات کامل نیست', 'پروانه یا عضویت معتبر نیست']}
      choices={TRUSTED_DECISIONS.map((value) => ({ value, label: TRUSTED_DECISION_FA[value], desc: TRUSTED_DECISION_DESC_FA[value], testId: 'trusted-decision-' + value }))}
    />
  );
}
