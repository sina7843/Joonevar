'use client';

import { useActionState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { instructSendAction, type GeneticsFormState } from './actions.ts';

const EMPTY: GeneticsFormState = {};

export function InstructSendForm({ sampleId }: { sampleId: string }) {
  const [state, submit, pending] = useActionState(instructSendAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid={'instruct-form-' + sampleId}>
      <input type="hidden" name="sampleId" value={sampleId} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'} title={state.message} /> : null}
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="submit-instruct">
        {pending ? 'در حال ثبت…' : 'صدور دستور ارسال'}
      </Button>
    </form>
  );
}
