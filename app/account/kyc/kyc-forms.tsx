'use client';

import { useActionState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionRow, Button } from '../../../src/ui/button.tsx';
import { FileField } from '../../../src/ui/field.tsx';
import { submitKycAction, uploadKycDocumentAction, type FormState } from '../actions.ts';

const EMPTY: FormState = {};

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.tone === 'success' ? 'success' : state.tone === 'error' ? 'error' : 'info'} title={state.message} />
  );
}

/**
 * Document upload (§6.2): only the national card, as JPG, PNG or PDF up to
 * 10 MB. The real check happens on the server against the file's own bytes; the
 * `accept` attribute is only a convenience for the file picker.
 */
export function KycDocumentForm({ hasDocument }: { hasDocument: boolean }) {
  const [state, submit, pending] = useActionState(uploadKycDocumentAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="kyc-upload-form">
      <Result state={state} />
      <FileField
        label="تصویر کارت ملی"
        name="document"
        required
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={10 * 1024 * 1024}
        hint="JPG، PNG یا PDF تا ۱۰ مگابایت. این فایل خصوصی است و فقط برای بررسی انجمن در دسترس قرار می‌گیرد."
        testId="kyc-file"
      />
      <ActionRow
        primary={
          <Button type="submit" tone="secondary" iconStart="uploadSimple" loading={pending} disabled={pending} loadingLabel="در حال بارگذاری…" data-testid="upload-kyc">
            {hasDocument ? 'جایگزینی تصویر کارت ملی' : 'بارگذاری تصویر کارت ملی'}
          </Button>
        }
      />
    </form>
  );
}

export function KycSubmitForm({ disabled }: { disabled: boolean }) {
  const [state, submit, pending] = useActionState(submitKycAction, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid="kyc-submit-form">
      <Result state={state} />
      {/* Disabled until the case is complete, so it is not the view's primary yet. */}
      <Button type="submit" size="lg" block tone={disabled ? 'secondary' : 'primary'} loading={pending} disabled={disabled || pending} data-testid="submit-kyc">
        ارسال برای بررسی
      </Button>
    </form>
  );
}
