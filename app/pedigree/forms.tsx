'use client';

import { useActionState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { Field, TextField } from '../../src/ui/field.tsx';
import {
  createIssuanceAction,
  createPostalRequestAction,
  createReceiptAction,
  payIssuanceAction,
  retryPedigreeIssuanceAction,
  submitAppealAction,
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

/** Animals whose Parentage Result is final and that have no pedigree yet. */
export function SelectIssuanceAnimals({
  animals,
  feeLabel,
}: {
  animals: ReadonlyArray<{ animalId: string; name: string | null; ready: boolean; reasonFa: string | null }>;
  feeLabel: string | null;
}) {
  const [state, submit, pending] = useActionState(createIssuanceAction, EMPTY);
  const ready = animals.filter((a) => a.ready);

  return (
    <Card>
      <h2 className="text-label-lg">صدور شجره‌نامه</h2>
      <p className="mt-md text-caption text-text-secondary">
        صدور سند به دو شرط نیاز دارد: نتیجه Parentage نهایی و پرداخت صدور در هم‌زیست. تأیید فیش مرکز، این
        پرداخت نیست.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="issuance-select-form">
        <Result state={state} />
        <ul className="space-y-md" data-testid="issuance-animal-list">
          {animals.map((animal) => (
            <li key={animal.animalId} className="rounded-lg border border-border-subtle p-lg">
              <label className="flex items-start gap-sm text-body-sm">
                <input
                  type="checkbox"
                  name="animalId"
                  value={animal.animalId}
                  disabled={!animal.ready}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid={'issuance-pick-' + animal.animalId}
                />
                <span>
                  <span className="block">{animal.name ?? 'بدون نام'}</span>
                  <span
                    className="text-caption text-text-secondary"
                    data-testid={'issuance-note-' + animal.animalId}
                  >
                    {animal.ready ? (feeLabel ? 'هزینه صدور: ' + feeLabel : '') : animal.reasonFa}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button
          type="submit"
          block
          disabled={pending || ready.length === 0 || feeLabel === null}
          data-testid="create-issuance"
        >
          {pending ? 'در حال ساخت درخواست…' : 'ادامه و مرور هزینه'}
        </Button>
      </form>
    </Card>
  );
}

export function PayIssuanceForm({ batchId }: { batchId: string }) {
  const [state, submit, pending] = useActionState(payIssuanceAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="pay-issuance-form">
      <input type="hidden" name="batchId" value={batchId} />
      <Result state={state} />
      <Button type="submit" block disabled={pending} data-testid="pay-issuance">
        {pending ? 'در حال انتقال به درگاه…' : 'پرداخت صدور'}
      </Button>
    </form>
  );
}

export function RetryPedigreeIssuanceForm({ batchId }: { batchId: string }) {
  const [state, submit, pending] = useActionState(retryPedigreeIssuanceAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="retry-pedigree-form">
      <input type="hidden" name="batchId" value={batchId} />
      <Result state={state} />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="retry-pedigree-issuance">
        {pending ? 'در حال بررسی…' : 'بررسی دوباره صدور'}
      </Button>
    </form>
  );
}

/**
 * Filing an appeal — §14.5.
 *
 * The form writes an appeal, never the result: there is no field here that
 * could change what the centre recorded.
 */
export function AppealForm({ animalId, resultId }: { animalId: string; resultId: string }) {
  const [state, submit, pending] = useActionState(submitAppealAction, EMPTY);
  return (
    <Card>
      <h3 className="text-label-lg">اعتراض به این نتیجه</h3>
      <p className="mt-md text-caption text-text-secondary">
        اعتراض به همان مرکز ژنتیک ارجاع می‌شود و پاسخ در همین پرونده دیده می‌شود. ثبت اعتراض، اجازه ویرایش
        نتیجه رسمی نیست و به‌تنهایی نمونه یا نتیجه قبلی را پاک نمی‌کند.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="appeal-form">
        <input type="hidden" name="animalId" value={animalId} />
        <input type="hidden" name="resultId" value={resultId} />
        <Result state={state} />
        <TextField label="متن اعتراض" name="message" required data-testid="appeal-message" />
        <Button tone="secondary" type="submit" block disabled={pending} data-testid="submit-appeal">
          {pending ? 'در حال ثبت…' : 'ثبت اعتراض'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * A postal request — §14.6, D17.
 *
 * Phase one records the request only. The address may be prefilled from what
 * the person already saved, and an empty residence never blocks this form.
 */
export function PostalRequestForm({
  documentType,
  documentId,
  prefill,
}: {
  documentType: 'REGISTRATION_SHEET' | 'PEDIGREE';
  documentId: string;
  prefill: { provinceFa: string | null; cityFa: string | null; addressFa: string | null } | null;
}) {
  const [state, submit, pending] = useActionState(createPostalRequestAction, EMPTY);
  return (
    <Card>
      <h3 className="text-label-lg">درخواست ارسال پستی</h3>
      <p className="mt-md text-caption text-text-secondary">
        در این فاز فقط درخواست ثبت می‌شود. اتصال به شرکت پستی، تعرفه حمل، برچسب، کد رهگیری و وضعیت تحویل جزو
        این فاز نیست و ثبت درخواست به معنی ارسال واقعی سند نیست.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="postal-form">
        <input type="hidden" name="documentType" value={documentType} />
        <input type="hidden" name="documentId" value={documentId} />
        <Result state={state} />
        <TextField label="نام گیرنده" name="recipientName" required data-testid="postal-recipient" />
        <TextField label="شماره تماس گیرنده" name="recipientPhone" required ltr data-testid="postal-phone" />
        <TextField
          label="استان"
          name="province"
          defaultValue={prefill?.provinceFa ?? ''}
          data-testid="postal-province"
        />
        <TextField label="شهر" name="city" defaultValue={prefill?.cityFa ?? ''} data-testid="postal-city" />
        <TextField
          label="نشانی"
          name="address"
          required
          defaultValue={prefill?.addressFa ?? ''}
          hint={prefill?.addressFa ? 'از نشانی ذخیره‌شده شما پر شده است؛ می‌توانید تغییرش دهید.' : undefined}
          data-testid="postal-address"
        />
        <TextField label="کد پستی" name="postalCode" ltr data-testid="postal-code" />
        <Button type="submit" block disabled={pending} data-testid="submit-postal">
          {pending ? 'در حال ثبت…' : 'ثبت درخواست ارسال'}
        </Button>
      </form>
    </Card>
  );
}
