'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../../src/ui/field.tsx';
import { checkInAction, type VetFormState } from '../actions.ts';

const EMPTY: VetFormState = {};

export function CheckInForm({
  locations,
}: {
  locations: ReadonlyArray<{ id: string; nameFa: string }>;
}) {
  const [state, submit, pending] = useActionState(checkInAction, EMPTY);

  return (
    <Card>
      <form action={submit} className="space-y-lg" data-testid="check-in-form">
        {state.message ? (
          <Alert
            tone={state.ok ? 'success' : 'error'}
            title={state.message}
          >
            {state.ok && state.requestId ? (
              <Link
                href={'/vet/requests/' + state.requestId}
                className="text-text-brand underline underline-offset-4"
                data-testid="open-checked-in-request"
              >
                ادامه پرونده این حیوان
              </Link>
            ) : null}
          </Alert>
        ) : null}

        <SelectField
          label="مرکز"
          name="locationId"
          required
          defaultValue={locations[0]?.id ?? ''}
          options={locations.map((l) => ({ value: l.id, label: l.nameFa }))}
          data-testid="check-in-location"
        />
        <TextField
          label="کد مراجعه"
          name="code"
          required
          ltr
          hint="اسکن QR و ورود دستی هر دو همین کد را وارد می‌کنند."
          data-testid="check-in-code"
        />
        <Button type="submit" block disabled={pending} data-testid="submit-check-in">
          {pending ? 'در حال بررسی…' : 'پذیرش'}
        </Button>
      </form>
    </Card>
  );
}
