'use client';

import { useActionState } from 'react';
import { Alert } from '../../src/ui/alert.tsx';
import { Button } from '../../src/ui/button.tsx';
import { TextAreaField } from '../../src/ui/field.tsx';
import {
  applyForMembershipAction,
  cancelMembershipPaymentAction,
  payMembershipAction,
  reviseMembershipApplicationAction,
  type CheckoutState,
} from './actions.ts';

const EMPTY: CheckoutState = {};

function Result({ state, testId }: { state: CheckoutState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/** Apply for membership; the association decides, and nothing is paid yet. */
export function ApplyForMembershipForm() {
  const [state, submit, pending] = useActionState(applyForMembershipAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="membership-application-form">
      <TextAreaField
        label="توضیح (اختیاری)"
        name="statementFa"
        rows={3}
        maxLength={1000}
        hint="هرچه بررسی‌کننده انجمن باید بداند. این متن ادعای شماست، نه چیزی که انجمن تأیید کرده باشد."
        data-testid="membership-statement"
      />
      <Result state={state} testId="membership-application-result" />
      <Button type="submit" block disabled={pending} data-testid="submit-membership-application">
        {pending ? 'در حال ثبت…' : 'ثبت درخواست عضویت'}
      </Button>
    </form>
  );
}

/** Answer a correction the association asked for, on the same application. */
export function ReviseMembershipApplicationForm({ applicationId, version, defaultStatement }: { applicationId: string; version: number; defaultStatement: string }) {
  const [state, submit, pending] = useActionState(reviseMembershipApplicationAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="membership-revision-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <TextAreaField label="پاسخ شما" name="statementFa" rows={3} maxLength={1000} defaultValue={defaultStatement} data-testid="membership-revision-statement" />
      <Result state={state} testId="membership-revision-result" />
      <Button type="submit" block disabled={pending} data-testid="submit-membership-revision">
        {pending ? 'در حال ثبت…' : 'ارسال دوباره برای بررسی'}
      </Button>
    </form>
  );
}

export function PayMembershipForm({ label, testId = 'pay-membership' }: { label: string; testId?: string }) {
  const [state, submit, pending] = useActionState(payMembershipAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="pay-membership-form">
      {state.message ? <Alert tone="error" title={state.message} /> : null}
      <Button type="submit" block disabled={pending} data-testid={testId}>
        {pending ? 'در حال انتقال به درگاه…' : label}
      </Button>
    </form>
  );
}

export function CancelMembershipPaymentForm() {
  return (
    <form action={cancelMembershipPaymentAction}>
      <Button tone="secondary" type="submit" block data-testid="cancel-membership-payment">
        لغو پرداخت در جریان
      </Button>
    </form>
  );
}
