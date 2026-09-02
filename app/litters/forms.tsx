'use client';

import { useActionState, useState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';
import {
  cancelCardPaymentAction,
  payCardsAction,
  proposeAllocationAction,
  respondAllocationAction,
  type AllocationFormState,
} from './actions.ts';

const EMPTY: AllocationFormState = {};

function Result({ state }: { state: AllocationFormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />
  );
}

/**
 * §19.3: one proposed owner per puppy.
 *
 * The pre-birth rule is printed above as context; it fills nothing in by
 * itself, because it never decides which puppy belongs to whom.
 */
export function ProposeAllocationForm({
  litterId,
  permitId,
  puppies,
  parties,
  isRevision,
}: {
  litterId: string;
  permitId: string;
  puppies: readonly { id: string; tempCode: string; nameFa: string | null; statusFa: string; current: string | null }[];
  parties: readonly { accountId: string; label: string }[];
  isRevision: boolean;
}) {
  const [state, submit, pending] = useActionState(proposeAllocationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">{isRevision ? 'ثبت نسخه اصلاح‌شده تخصیص' : 'پیشنهاد تخصیص توله‌ها'}</h2>
      <form action={submit} className="mt-lg space-y-lg" data-testid="propose-allocation-form">
        <input type="hidden" name="litterId" value={litterId} />
        <input type="hidden" name="permitId" value={permitId} />
        <Result state={state} />
        {puppies.map((puppy) => (
          <SelectField
            key={puppy.id}
            label={puppy.tempCode + ' · ' + (puppy.nameFa ?? 'بدون نام') + ' · ' + puppy.statusFa}
            name={'owner:' + puppy.id}
            required
            defaultValue={puppy.current ?? ''}
            data-testid={'assign-' + puppy.tempCode}
            options={parties.map((party) => ({ value: party.accountId, label: party.label }))}
          />
        ))}
        <TextField label="توضیح (اختیاری)" name="note" data-testid="allocation-note" />
        <Button type="submit" block disabled={pending} data-testid="submit-allocation">
          {pending ? 'در حال ثبت…' : isRevision ? 'ثبت نسخه جدید' : 'ثبت پیشنهاد تخصیص'}
        </Button>
      </form>
    </Card>
  );
}

/** §19.3: the answer is bound to the version it was shown for. */
export function RespondAllocationForm({
  litterId,
  allocationId,
  version,
}: {
  litterId: string;
  allocationId: string;
  version: number;
}) {
  const [state, submit, pending] = useActionState(respondAllocationAction, EMPTY);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="respond-allocation-form">
      <input type="hidden" name="litterId" value={litterId} />
      <input type="hidden" name="allocationId" value={allocationId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">{'پاسخ شما به نسخه ' + version}</legend>
        {(
          [
            ['APPROVE', 'تأیید همین نسخه'],
            ['REJECT', 'رد با دلیل'],
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
              data-testid={'allocation-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {decision === 'REJECT' ? (
        <TextField label="دلیل" name="reason" required data-testid="allocation-reject-reason" />
      ) : null}
      <Button type="submit" block disabled={pending} data-testid="submit-allocation-response">
        {pending ? 'در حال ثبت…' : 'ثبت پاسخ'}
      </Button>
    </form>
  );
}

/** §19.4: choose one or more eligible puppies and pay once for all of them. */
export function CardCheckoutForm({
  permitId,
  batchId,
  puppies,
}: {
  permitId: string;
  batchId: string | null;
  puppies: readonly { id: string; tempCode: string; nameFa: string | null }[];
}) {
  const [state, submit, pending] = useActionState(payCardsAction, EMPTY);
  return (
    <div className="mt-lg space-y-md">
      <form action={submit} className="space-y-lg" data-testid="card-checkout-form">
        <input type="hidden" name="permitId" value={permitId} />
        <Result state={state} />
        <fieldset className="space-y-sm">
          <legend className="text-label-md">توله‌های واجد شرایط</legend>
          {puppies.map((puppy) => (
            <label key={puppy.id} className="flex items-center gap-sm text-body-sm">
              <input
                type="checkbox"
                name="puppy"
                value={puppy.id}
                className="size-[var(--size-selection-md)]"
                data-testid={'card-pick-' + puppy.tempCode}
              />
              {puppy.tempCode} · {puppy.nameFa ?? 'بدون نام'}
            </label>
          ))}
        </fieldset>
        <Button type="submit" block disabled={pending} data-testid="pay-cards">
          {pending ? 'در حال انتقال به درگاه…' : 'پرداخت و ادامه'}
        </Button>
      </form>
      {batchId ? (
        <form action={cancelCardPaymentAction} data-testid="cancel-card-payment-form">
          <input type="hidden" name="permitId" value={permitId} />
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" tone="secondary" block data-testid="cancel-card-payment">
            انصراف از پرداخت
          </Button>
        </form>
      ) : null}
    </div>
  );
}
