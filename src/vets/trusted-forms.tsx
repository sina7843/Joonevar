'use client';

import { useActionState, useState } from 'react';
import { Alert } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { TextAreaField } from '../ui/field.tsx';
import { Check, Result } from './directory-forms.tsx';
import { TRUSTED_DECISIONS, TRUSTED_DECISION_FA, type TrustedDecision } from './trusted-model.ts';
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
        <div className="max-h-64 overflow-y-auto rounded-md border border-border-subtle p-md text-body-sm whitespace-pre-line" data-testid="trusted-terms-text">
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
            <legend className="text-label-md">سایر تجهیزات اعلام‌شده (اختیاری)</legend>
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

/** The association's decision on one trusted application, always with a reason. */
export function DecideTrustedCaseForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideTrustedCaseAction, EMPTY);
  const [decision, setDecision] = useState<TrustedDecision>('APPROVE');
  return (
    <form action={submit} className="space-y-lg" data-testid="trusted-decision-form">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">نتیجه بررسی</legend>
        {TRUSTED_DECISIONS.map((value) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'trusted-decision-' + value}
            />
            {TRUSTED_DECISION_FA[value]}
          </label>
        ))}
      </fieldset>
      <TextAreaField label="دلیل" name="reasonFa" required rows={3} maxLength={1000} hint="برای متقاضی نمایش داده می‌شود." data-testid="trusted-decision-reason" />
      <Button type="submit" disabled={pending} data-testid="submit-trusted-decision">
        {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
      </Button>
      <Result state={state} testId="trusted-decision-result" />
    </form>
  );
}
