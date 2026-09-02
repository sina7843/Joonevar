'use client';

import { useActionState } from 'react';
import { Card } from '../../../../src/ui/card.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { createVisitAction, type FormState } from '../../actions.ts';

const EMPTY: FormState = {};

export function ConfirmVisitForm({
  context,
  selection,
  vetAccountId,
  locationId,
}: {
  context: string;
  selection: string;
  vetAccountId: string;
  locationId: string;
}) {
  const [state, submit, pending] = useActionState(createVisitAction, EMPTY);
  return (
    <Card>
      <form action={submit} className="space-y-lg" data-testid="confirm-visit-form">
        <input type="hidden" name="context" value={context} />
        <input type="hidden" name="sel" value={selection} />
        <input type="hidden" name="vet" value={vetAccountId} />
        <input type="hidden" name="loc" value={locationId} />
        {state.message ? <Alert tone={state.tone === 'success' ? 'success' : 'error'} title={state.message} /> : null}
        <Button type="submit" block disabled={pending} data-testid="create-visit">
          {pending ? 'در حال ثبت…' : 'ثبت درخواست و صدور کد مراجعه'}
        </Button>
      </form>
    </Card>
  );
}
