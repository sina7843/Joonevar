'use client';

import { useActionState, useState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';
import {
  addNoteAction,
  cancelDeclarationAction,
  respondDeclarationAction,
  startDeclarationAction,
  type DeclarationFormState,
} from './actions.ts';
import {
  NOTE_KIND_FA,
  SCOPE_NOTE_FA,
  UNVERIFIED_NOTE_FA,
} from '../../src/domain/declaration-copy.ts';

const EMPTY: DeclarationFormState = {};

function Result({ state }: { state: DeclarationFormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />
  );
}

/**
 * §20: own animal, the counterparty's existing record, and their number.
 *
 * The counterparty's animal is named by an identifier of a record that already
 * exists in Hamzist; a hand-typed animal is never accepted, and the number must
 * be the owner of that record.
 */
export function StartDeclarationForm({
  animals,
}: {
  animals: readonly { id: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState(startDeclarationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">اعلام وجود توافق شخصی</h2>
      <p className="mt-md text-caption text-text-secondary" data-testid="declaration-scope-note">
        {SCOPE_NOTE_FA}
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="start-declaration-form">
        <Result state={state} />
        <SelectField
          label="حیوان خود"
          name="ownAnimalId"
          required
          data-testid="declaration-own-animal"
          options={animals.map((animal) => ({ value: animal.id, label: animal.label }))}
        />
        <TextField
          label="شناسه حیوان طرف مقابل (شماره میکروچیپ، Pet ID یا کد شجره‌نامه)"
          name="identifier"
          ltr
          required
          hint="حیوان باید از قبل در هم‌زیست ثبت شده باشد؛ حیوان دستی پذیرفته نمی‌شود."
          data-testid="declaration-identifier"
        />
        <TextField
          label="شماره موبایل طرف مقابل"
          name="mobile"
          ltr
          required
          hint="این شماره باید متعلق به مالک همان حیوان باشد."
          data-testid="declaration-mobile"
        />
        <Button type="submit" block disabled={pending} data-testid="submit-declaration">
          {pending ? 'در حال ارسال دعوت…' : 'ارسال دعوت به طرف مقابل'}
        </Button>
      </form>
    </Card>
  );
}

/** The invited person's own answer — no signing step and no second OTP (§20). */
export function RespondDeclarationForm({ declarationId }: { declarationId: string }) {
  const [state, submit, pending] = useActionState(respondDeclarationAction, EMPTY);
  const [decision, setDecision] = useState<'CONFIRM' | 'REJECT'>('CONFIRM');
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="respond-declaration-form">
      <input type="hidden" name="declarationId" value={declarationId} />
      <Result state={state} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">پاسخ شما درباره «وجود» این توافق</legend>
        {(
          [
            ['CONFIRM', 'بله، چنین توافقی وجود دارد'],
            ['REJECT', 'خیر، با ثبت دلیل'],
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
              data-testid={'declaration-decision-' + value}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {decision === 'REJECT' ? (
        <TextField label="دلیل" name="reason" required data-testid="declaration-reject-reason" />
      ) : null}
      <Button type="submit" block disabled={pending} data-testid="submit-declaration-response">
        {pending ? 'در حال ثبت…' : 'ثبت پاسخ'}
      </Button>
    </form>
  );
}

export function CancelDeclarationForm({ declarationId }: { declarationId: string }) {
  const [state, submit, pending] = useActionState(cancelDeclarationAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-md" data-testid="cancel-declaration-form">
      <input type="hidden" name="declarationId" value={declarationId} />
      <Result state={state} />
      <Button type="submit" tone="secondary" block disabled={pending} data-testid="cancel-declaration">
        {pending ? 'در حال لغو…' : 'لغو دعوت'}
      </Button>
    </form>
  );
}

/** §17.3: an optional personal note that stays outside the official flow. */
export function PersonalNoteForm({ declarationId }: { declarationId: string }) {
  const [state, submit, pending] = useActionState(addNoteAction, EMPTY);
  const [kind, setKind] = useState<'MATING_DATE' | 'PREGNANCY' | 'BIRTH'>('MATING_DATE');
  return (
    <Card>
      <h2 className="text-label-lg">یادداشت شخصی (اختیاری)</h2>
      <p className="mt-md text-caption text-text-secondary" data-testid="note-unverified-note">
        {UNVERIFIED_NOTE_FA}
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="personal-note-form">
        <input type="hidden" name="declarationId" value={declarationId} />
        <Result state={state} />
        <SelectField
          label="نوع یادداشت"
          name="kind"
          required
          value={kind}
          onChange={(event) => setKind(event.target.value as 'MATING_DATE' | 'PREGNANCY' | 'BIRTH')}
          data-testid="note-kind"
          options={(['MATING_DATE', 'PREGNANCY', 'BIRTH'] as const).map((value) => ({
            value,
            label: NOTE_KIND_FA[value] ?? value,
          }))}
        />
        <TextField
          label={kind === 'MATING_DATE' ? 'تاریخ (میلادی، YYYY-MM-DD)' : 'تاریخ (اختیاری)'}
          name="noteDate"
          ltr
          required={kind === 'MATING_DATE'}
          data-testid="note-date"
        />
        <TextField label="توضیح (اختیاری)" name="note" data-testid="note-text" />
        <Button type="submit" block disabled={pending} data-testid="submit-note">
          {pending ? 'در حال ثبت…' : 'ثبت یادداشت شخصی'}
        </Button>
      </form>
    </Card>
  );
}
