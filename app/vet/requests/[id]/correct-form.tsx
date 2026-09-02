'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Card } from '../../../../src/ui/card.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../../../src/ui/field.tsx';
import { correctServiceAction, type VetFormState } from '../../actions.ts';

const EMPTY: VetFormState = {};

/**
 * In-place service correction — §11.4.
 *
 * Only this animal's request is replaced. The reason is mandatory because the
 * old request stays in the audit trail with it, and the corrected request comes
 * back needing a fresh check-in.
 */
export function CorrectServiceForm({
  requestId,
  options,
}: {
  requestId: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const [state, submit, pending] = useActionState(correctServiceAction, EMPTY);

  return (
    <Card>
      <h3 className="text-label-lg">وضعیت مشاهده‌شده با درخواست فرق دارد</h3>
      <p className="mt-md text-caption text-text-secondary">
        درخواست فعلی همین حیوان جایگزین می‌شود و کد جدید صادر می‌شود. درخواست سایر حیوان‌های همین گروه تغییر
        نمی‌کند.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="correct-service-form">
        <input type="hidden" name="requestId" value={requestId} />
        {state.message ? (
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message}>
            {state.ok && state.requestId ? (
              <Link
                href={'/vet/requests/' + state.requestId}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-corrected-request"
              >
                رفتن به درخواست جدید برای پذیرش
              </Link>
            ) : null}
          </Alert>
        ) : null}
        <SelectField
          label="نوع خدمت صحیح"
          name="serviceType"
          required
          options={options}
          data-testid="correct-service-type"
        />
        <TextField
          label="دلیل تغییر"
          name="reason"
          required
          hint="این دلیل همراه درخواست قبلی در تاریخچه می‌ماند."
          data-testid="correct-reason"
        />
        <Button tone="secondary" type="submit" block disabled={pending} data-testid="submit-correction">
          {pending ? 'در حال ثبت…' : 'اصلاح نوع خدمت'}
        </Button>
      </form>
    </Card>
  );
}
