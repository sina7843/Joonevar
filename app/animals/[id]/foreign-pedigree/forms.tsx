'use client';

import { useActionState } from 'react';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { FileField, SelectField, TextField } from '../../../../src/ui/field.tsx';
import {
  saveForeignDetailsAction,
  submitForeignCaseAction,
  uploadForeignSideAction,
  type FormState,
} from '../../actions.ts';

const EMPTY: FormState = {};

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.tone === 'success' ? 'success' : state.tone === 'error' ? 'error' : 'info'} title={state.message} />
  );
}

/**
 * Issuer and document code.
 *
 * The issuer is picked from the association-managed registry; free text is not
 * accepted, so an unapproved issuer can never be shown as approved (D14). An
 * empty registry means there is nothing to pick yet, and the page says so.
 */
export function ForeignDetailsForm({
  animalId,
  issuers,
  values,
}: {
  animalId: string;
  issuers: ReadonlyArray<{ id: string; name: string }>;
  values: { issuerId: string; documentCode: string };
}) {
  const [state, submit, pending] = useActionState(saveForeignDetailsAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="foreign-details-form">
      <Result state={state} />
      <input type="hidden" name="animalId" value={animalId} />
      {issuers.length === 0 ? (
        <Alert tone="warning" title="فهرست صادرکنندگان موردتأیید هنوز تکمیل نشده است">
          تا زمانی که انجمن فهرست واقعی را وارد نکند، امکان انتخاب صادرکننده و ارسال پرونده وجود ندارد.
        </Alert>
      ) : (
        <SelectField
          label="صادرکننده مدرک"
          name="issuerId"
          required
          hint="فقط صادرکنندگان موردتأیید انجمن قابل انتخاب‌اند."
          defaultValue={values.issuerId}
          options={issuers.map((issuer) => ({ value: issuer.id, label: issuer.name }))}
          data-testid="foreign-issuer"
        />
      )}
      <TextField
        label="کد مدرک"
        name="documentCode"
        ltr
        defaultValue={values.documentCode}
        data-testid="foreign-document-code"
      />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="save-foreign-details">
        {pending ? 'در حال ذخیره…' : 'ذخیره اطلاعات مدرک'}
      </Button>
    </form>
  );
}

/** One side of the document. Front and back are two independent uploads (§9.4). */
export function ForeignSideForm({
  animalId,
  side,
  attached,
}: {
  animalId: string;
  side: 'FRONT' | 'BACK';
  attached: boolean;
}) {
  const [state, submit, pending] = useActionState(uploadForeignSideAction, EMPTY);
  const sideFa = side === 'FRONT' ? 'روی برگه' : 'پشت برگه';
  return (
    <form action={submit} className="space-y-lg" data-testid={'foreign-' + side.toLowerCase() + '-form'}>
      <Result state={state} />
      <input type="hidden" name="animalId" value={animalId} />
      <input type="hidden" name="side" value={side} />
      <FileField
        label={side === 'FRONT' ? 'روی برگه Export Pedigree' : 'پشت برگه Export Pedigree'}
        name="document"
        required
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={10 * 1024 * 1024}
        hint={
          attached
            ? 'فایل قبلی شما حفظ شده است؛ در صورت نیاز می‌توانید همین طرف را جایگزین کنید.'
            : 'JPG، PNG یا PDF تا ۱۰ مگابایت. این فایل خصوصی است.'
        }
        testId={'foreign-' + side.toLowerCase() + '-file'}
      />
      <Button
        tone="secondary"
        type="submit"
        block
        disabled={pending}
        data-testid={'upload-foreign-' + side.toLowerCase()}
      >
        {pending ? 'در حال بارگذاری…' : attached ? 'جایگزینی تصویر ' + sideFa : 'بارگذاری تصویر ' + sideFa}
      </Button>
    </form>
  );
}

export function ForeignSubmitForm({ animalId, disabled }: { animalId: string; disabled: boolean }) {
  const [state, submit, pending] = useActionState(submitForeignCaseAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="foreign-submit-form">
      <Result state={state} />
      <input type="hidden" name="animalId" value={animalId} />
      <Button type="submit" block disabled={disabled || pending} data-testid="submit-foreign">
        {pending ? 'در حال ارسال…' : 'ارسال برای بررسی انجمن'}
      </Button>
    </form>
  );
}
