'use client';

import { useActionState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { Field, TextField } from '../../src/ui/field.tsx';
import {
  createReceiptAction,
  submitReceiptAction,
  uploadReceiptAction,
  type PedigreeFormState,
} from './actions.ts';

const EMPTY: PedigreeFormState = {};

function Result({ state }: { state: PedigreeFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />;
}

/**
 * Choosing animals for the genetics centre — §14.1.
 *
 * Nothing about a veterinarian or a new collection is asked for here: the
 * sample already on record is what travels, and its code is what the receipt
 * is mapped to.
 */
export function SelectPedigreeAnimals({
  animals,
  centreConfigured,
}: {
  animals: ReadonlyArray<{
    animalId: string;
    name: string | null;
    ready: boolean;
    sampleTrackingCode: string | null;
    reasonFa: string | null;
  }>;
  centreConfigured: boolean;
}) {
  const [state, submit, pending] = useActionState(createReceiptAction, EMPTY);
  const ready = animals.filter((a) => a.ready);

  return (
    <Card>
      <h2 className="text-label-lg">انتخاب حیوان‌ها</h2>
      <p className="mt-md text-caption text-text-secondary">
        نمونه ثبت‌شده همین حیوان استفاده می‌شود؛ انتخاب دامپزشک یا نمونه‌گیری دوباره لازم نیست.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="pedigree-select-form">
        <Result state={state} />
        <ul className="space-y-md" data-testid="pedigree-animal-list">
          {animals.map((animal) => (
            <li key={animal.animalId} className="rounded-lg border border-border-subtle p-lg">
              <label className="flex items-start gap-sm text-body-sm">
                <input
                  type="checkbox"
                  name="animalId"
                  value={animal.animalId}
                  disabled={!animal.ready}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid={'pedigree-pick-' + animal.animalId}
                />
                <span>
                  <span className="block">{animal.name ?? 'بدون نام'}</span>
                  <span
                    className="text-caption text-text-secondary"
                    data-testid={'pedigree-note-' + animal.animalId}
                  >
                    {animal.ready ? 'کد رهگیری نمونه: ' + animal.sampleTrackingCode : animal.reasonFa}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button
          type="submit"
          block
          disabled={pending || ready.length === 0 || !centreConfigured}
          data-testid="create-receipt"
        >
          {pending ? 'در حال ثبت…' : 'ثبت فیش پرداخت به مرکز'}
        </Button>
      </form>
    </Card>
  );
}

export function ReceiptForms({
  receiptId,
  canEdit,
  hasFile,
}: {
  receiptId: string;
  canEdit: boolean;
  hasFile: boolean;
}) {
  const [uploadState, upload, uploading] = useActionState(uploadReceiptAction, EMPTY);
  const [submitState, submitReceipt, submitting] = useActionState(submitReceiptAction, EMPTY);
  if (!canEdit) return null;

  return (
    <>
      <Card>
        <h3 className="text-label-lg">تصویر فیش</h3>
        <form action={upload} className="mt-lg space-y-lg" data-testid="receipt-upload-form">
          <input type="hidden" name="receiptId" value={receiptId} />
          <Result state={uploadState} />
          <Field label="فایل فیش" hint="تصویر یا PDF فیش پرداخت مستقیم به مرکز.">
            {({ inputId, describedBy }) => (
              <input
                id={inputId}
                aria-describedby={describedBy}
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,application/pdf"
                className="w-full text-body-sm"
                data-testid="receipt-file"
              />
            )}
          </Field>
          <Button tone="secondary" type="submit" block disabled={uploading} data-testid="upload-receipt">
            {uploading ? 'در حال بارگذاری…' : 'بارگذاری فیش'}
          </Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-label-lg">ارسال برای بررسی مرکز</h3>
        <form action={submitReceipt} className="mt-lg space-y-lg" data-testid="receipt-submit-form">
          <input type="hidden" name="receiptId" value={receiptId} />
          <Result state={submitState} />
          <TextField label="توضیح (اختیاری)" name="note" data-testid="receipt-note" />
          <Button type="submit" block disabled={submitting || !hasFile} data-testid="submit-receipt">
            {submitting ? 'در حال ارسال…' : 'ارسال فیش به مرکز ژنتیک'}
          </Button>
        </form>
      </Card>
    </>
  );
}
