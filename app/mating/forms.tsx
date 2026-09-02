'use client';

import { useActionState, useState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';
import {
  cancelPermitPaymentAction,
  confirmPartyAction,
  payPermitAction,
  resolvePartyAction,
  saveRuleAction,
  startPermitAction,
  submitPermitAction,
  type PermitFormState,
} from './actions.ts';
import {
  PRE_BIRTH_RULE_NOTE_FA,
  RULE_TYPE_FA,
  type AllocationRuleType,
} from '../../src/domain/allocation.ts';

const EMPTY: PermitFormState = {};

function Result({ state }: { state: PermitFormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />
  );
}

/**
 * §16 steps 1 to 4 in one screen: own animal, counterparty code, resolve, then
 * invite. The invitation button appears only after the code has really
 * resolved, so nobody is invited by a typo.
 */
export function StartPermitForm({
  animals,
}: {
  animals: readonly { id: string; label: string }[];
}) {
  const [resolveState, resolve, resolving] = useActionState(resolvePartyAction, EMPTY);
  const [startState, start, starting] = useActionState(startPermitAction, EMPTY);
  const [ownAnimalId, setOwnAnimalId] = useState(animals[0]?.id ?? '');
  const [code, setCode] = useState('');
  const resolved = resolveState.resolved;

  return (
    <Card>
      <h2 className="text-label-lg">شروع مجوز رسمی جفت‌گیری</h2>
      <p className="mt-md text-caption text-text-secondary">
        این مسیر رسمی است و پرونده، شناسه و وضعیت جدا از «اعلام توافق شخصی» دارد.
      </p>

      <form action={resolve} className="mt-lg space-y-lg" data-testid="resolve-party-form">
        <Result state={resolveState} />
        <SelectField
          label="حیوان شجره‌دار شما"
          name="ownAnimalId"
          required
          value={ownAnimalId}
          onChange={(event) => setOwnAnimalId(event.target.value)}
          data-testid="own-animal"
          options={animals.map((animal) => ({ value: animal.id, label: animal.label }))}
        />
        <TextField
          label="کد شجره‌نامه حیوان مقابل"
          name="pedigreeCode"
          ltr
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          data-testid="counterparty-code"
        />
        <Button type="submit" block disabled={resolving} data-testid="resolve-party">
          {resolving ? 'در حال شناسایی…' : 'شناسایی حیوان و طرف مقابل'}
        </Button>
      </form>

      {resolved ? (
        <div className="mt-lg space-y-lg">
          <dl className="grid grid-cols-2 gap-sm text-body-sm" data-testid="resolved-party">
            <dt className="text-text-secondary">حیوان مقابل</dt>
            <dd data-testid="resolved-animal">{resolved.animalName}</dd>
            <dt className="text-text-secondary">جنسیت</dt>
            <dd>{resolved.sexFa}</dd>
            <dt className="text-text-secondary">کد شجره‌نامه</dt>
            <dd dir="ltr" className="text-left font-mono">{resolved.pedigreeCode}</dd>
            <dt className="text-text-secondary">مالک</dt>
            <dd data-testid="resolved-owner">{resolved.ownerName}</dd>
          </dl>
          <form action={start} className="space-y-lg" data-testid="start-permit-form">
            <Result state={startState} />
            <input type="hidden" name="ownAnimalId" value={ownAnimalId} />
            <input type="hidden" name="pedigreeCode" value={code} />
            <Button type="submit" block disabled={starting} data-testid="invite-party">
              {starting ? 'در حال ارسال دعوت…' : 'ارسال دعوت به طرف مقابل'}
            </Button>
          </form>
        </div>
      ) : null}
    </Card>
  );
}

/** The counterparty's own answer — §16 step 4. */
export function ConfirmPartyForm({ permitId }: { permitId: string }) {
  const [state, submit, pending] = useActionState(confirmPartyAction, EMPTY);
  const [decision, setDecision] = useState<'ACCEPT' | 'DECLINE'>('ACCEPT');

  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="confirm-party-form">
      <input type="hidden" name="permitId" value={permitId} />
      <Result state={state} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">پاسخ شما</legend>
        {(
          [
            ['ACCEPT', 'تأیید مشارکت در این پرونده'],
            ['DECLINE', 'رد دعوت با دلیل'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'party-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {decision === 'DECLINE' ? (
        <TextField label="دلیل" name="reason" required data-testid="party-decline-reason" />
      ) : null}
      <Button type="submit" block disabled={pending} data-testid="submit-party-decision">
        {pending ? 'در حال ثبت…' : 'ثبت پاسخ'}
      </Button>
    </form>
  );
}

/** §16 step 5 — fixed, percentage or mixed, recorded before birth. */
export function AllocationRuleForm({
  permitId,
  ruleType,
  sire,
  dam,
  note,
}: {
  permitId: string;
  ruleType: AllocationRuleType | null;
  sire: { fixedCount: number | null; percent: number | null };
  dam: { fixedCount: number | null; percent: number | null };
  note: string | null;
}) {
  const [state, submit, pending] = useActionState(saveRuleAction, EMPTY);
  const [type, setType] = useState<AllocationRuleType>(ruleType ?? 'PERCENTAGE');

  return (
    <Card>
      <h2 className="text-label-lg">توافق تقسیم (Allocation Rule)</h2>
      <p className="mt-md text-caption text-text-secondary" data-testid="pre-birth-note">
        {PRE_BIRTH_RULE_NOTE_FA}
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="allocation-rule-form">
        <input type="hidden" name="permitId" value={permitId} />
        <Result state={state} />
        <fieldset className="space-y-sm">
          <legend className="text-label-md">نوع توافق</legend>
          {(['FIXED', 'PERCENTAGE', 'MIXED'] as const).map((value) => (
            <label key={value} className="flex items-center gap-sm text-body-sm">
              <input
                type="radio"
                name="ruleType"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="size-[var(--size-selection-md)]"
                data-testid={'rule-type-' + value}
              />
              {RULE_TYPE_FA[value]}
            </label>
          ))}
        </fieldset>

        {type === 'PERCENTAGE' ? null : (
          <div className="space-y-lg">
            <TextField
              label="سهم ثابت سمت پدر (تعداد توله)"
              name="sireFixed"
              ltr
              defaultValue={sire.fixedCount ?? ''}
              data-testid="sire-fixed"
            />
            <TextField
              label="سهم ثابت سمت مادر (تعداد توله)"
              name="damFixed"
              ltr
              defaultValue={dam.fixedCount ?? ''}
              data-testid="dam-fixed"
            />
          </div>
        )}
        {type === 'FIXED' ? null : (
          <div className="space-y-lg">
            <TextField
              label="درصد سهم سمت پدر"
              name="sirePercent"
              ltr
              defaultValue={sire.percent ?? ''}
              data-testid="sire-percent"
            />
            <TextField
              label="درصد سهم سمت مادر"
              name="damPercent"
              ltr
              defaultValue={dam.percent ?? ''}
              data-testid="dam-percent"
            />
          </div>
        )}
        <TextField label="توضیح توافق (اختیاری)" name="ruleNote" defaultValue={note ?? ''} data-testid="rule-note" />
        <Button type="submit" block disabled={pending} data-testid="save-rule">
          {pending ? 'در حال ثبت…' : 'ثبت توافق تقسیم'}
        </Button>
      </form>
    </Card>
  );
}

export function PayPermitForm({ permitId, batchId }: { permitId: string; batchId: string | null }) {
  const [state, submit, pending] = useActionState(payPermitAction, EMPTY);
  return (
    <div className="mt-lg space-y-md">
      <form action={submit} data-testid="pay-permit-form">
        <input type="hidden" name="permitId" value={permitId} />
        <Result state={state} />
        <Button type="submit" block disabled={pending} data-testid="pay-permit">
          {pending ? 'در حال انتقال به درگاه…' : 'پرداخت هزینه مجوز'}
        </Button>
      </form>
      {batchId ? (
        <form action={cancelPermitPaymentAction} data-testid="cancel-permit-payment-form">
          <input type="hidden" name="permitId" value={permitId} />
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" tone="secondary" block data-testid="cancel-permit-payment">
            انصراف از پرداخت
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** §16 step 7 and 8: submit is only reachable after the verified payment. */
export function SubmitPermitForm({ permitId }: { permitId: string }) {
  const [state, submit, pending] = useActionState(submitPermitAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="submit-permit-form">
      <input type="hidden" name="permitId" value={permitId} />
      <Result state={state} />
      <Button type="submit" block disabled={pending} data-testid="submit-permit">
        {pending ? 'در حال ارسال…' : 'ارسال نهایی برای بررسی'}
      </Button>
    </form>
  );
}
