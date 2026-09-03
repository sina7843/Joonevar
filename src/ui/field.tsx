'use client';

import { useId, useState, type ReactNode } from 'react';
import { Icon } from './icon.tsx';

/**
 * Form field wrapper.
 *
 * The error is wired with `aria-invalid` and `aria-describedby` and announced
 * through `role="alert"`, so a screen reader user learns which field failed and
 * why. Hint and error share one describedby list, so the hint is not lost when
 * an error appears.
 */
interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (ids: { inputId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldShellProps) {
  const id = useId();
  const inputId = id + '-input';
  const hintId = id + '-hint';
  const errorId = id + '-error';
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-xs">
      <label htmlFor={inputId} className="block text-label-md text-text-primary">
        {label}
        {required ? (
          <span className="text-status-error-text" aria-hidden="true">
            {' *'}
          </span>
        ) : (
          <span className="mr-xs text-caption text-text-secondary">(اختیاری)</span>
        )}
      </label>
      {children({ inputId, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-caption text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-status-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border bg-bg-surface px-md text-body-sm text-text-primary ' +
  'min-h-[var(--size-control-md)] placeholder:text-text-disabled ' +
  'disabled:bg-bg-disabled disabled:text-text-disabled';

const controlTone = (invalid: boolean) =>
  invalid ? 'border-status-error-border' : 'border-border-subtle focus:border-border-brand';

export function TextField({
  label,
  hint,
  error,
  required,
  ltr = false,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Identifiers, codes and phone numbers read left-to-right (§24.3). */
  ltr?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <input
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          dir={ltr ? 'ltr' : undefined}
          className={[CONTROL, controlTone(invalid), ltr ? 'text-left font-mono' : ''].join(' ')}
          {...rest}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  options,
  placeholder = 'انتخاب کنید',
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <select
          id={inputId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={[CONTROL, controlTone(invalid), 'py-sm'].join(' ')}
          {...rest}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/**
 * Location field.
 *
 * No map provider is configured yet, and MAP-001 is still open in the
 * prototype, so the map is presented as unavailable while manual entry stays
 * fully usable. An empty residence location must not block KYC, animal
 * registration or kennel submission (§6.2, §15.2).
 */
export function LocationField({
  label,
  hint,
  error,
  required,
  mapAvailable,
  value,
  onChange,
  onPickOnMap,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  mapAvailable: boolean;
  value: string;
  onChange?: (next: string) => void;
  onPickOnMap?: () => void;
}) {
  return (
    <div className="space-y-sm">
      <Field label={label} hint={hint} error={error} required={required}>
        {({ inputId, describedBy, invalid }) => (
          <textarea
            id={inputId}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            rows={3}
            className={[
              'w-full rounded-md border bg-bg-surface p-md text-body-sm',
              'min-h-[var(--size-textarea-rows-3)]',
              controlTone(invalid),
            ].join(' ')}
          />
        )}
      </Field>
      {mapAvailable ? (
        <button
          type="button"
          onClick={onPickOnMap}
          className="text-label-md text-text-brand underline underline-offset-4"
        >
          انتخاب موقعیت روی نقشه
        </button>
      ) : (
        <p className="text-caption text-text-secondary">
          انتخاب موقعیت روی نقشه در این نسخه در دسترس نیست؛ نشانی را دستی وارد کنید.
        </p>
      )}
    </div>
  );
}

/**
 * A file input that refuses an oversized file in the browser.
 *
 * Uploads travel through a Server Action, and a request larger than the
 * configured body limit fails before any of the product's own checks run — the
 * person sees a blank application error instead of a reason. This says the
 * reason in the form, in Persian, and clears the selection so the request is
 * never sent. The server still applies the real limit, the accepted types and
 * the signature check: this is a courtesy, not the rule.
 */
export function FileField({
  label,
  name,
  accept,
  maxBytes,
  hint,
  required,
  testId,
}: {
  label: string;
  name: string;
  accept: string;
  maxBytes: number;
  hint?: string;
  required?: boolean;
  testId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ name: string; sizeFa: string } | null>(null);
  const megabytes = Math.floor(maxBytes / (1024 * 1024));

  const sizeFa = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? mb.toFixed(1) + ' مگابایت' : Math.max(1, Math.round(bytes / 1024)) + ' کیلوبایت';
  };

  return (
    <Field label={label} hint={hint} required={required} error={error ?? undefined}>
      {({ inputId, describedBy, invalid }) => (
        /*
         * A bare file input is a grey box with a browser-chosen English label,
         * and nothing about it says it can be clicked. The label is the control:
         * it fills the width, states what to do, and after a choice it shows the
         * file's own name and size so the person can see what they picked
         * without opening the dialog again. The input itself stays a real file
         * input, focusable and keyboard-operable — it is only visually hidden.
         */
        <label
          htmlFor={inputId}
          className={[
            'flex w-full cursor-pointer items-center gap-md rounded-lg border border-dashed p-lg text-body-sm',
            'transition-colors hover:bg-bg-brand-subtle',
            'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-brand',
            invalid ? 'border-status-error-border' : 'border-border-brand',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className="flex size-[var(--size-control-sm)] shrink-0 items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand"
          >
            <Icon name={chosen ? 'check' : 'uploadSimple'} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-label-md text-text-brand">
              {chosen ? 'تغییر فایل انتخاب‌شده' : 'انتخاب فایل'}
            </span>
            <span className="mt-2xs block truncate text-caption text-text-secondary" data-testid={testId ? testId + '-name' : undefined}>
              {chosen ? chosen.name + ' · ' + chosen.sizeFa : 'برای انتخاب، همین‌جا را لمس یا کلیک کنید.'}
            </span>
          </span>
          <input
            id={inputId}
            name={name}
            type="file"
            accept={accept}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && file.size > maxBytes) {
                setError('حجم این فایل بیش از حد مجاز است (حداکثر ' + megabytes + ' مگابایت).');
                event.target.value = '';
                setChosen(null);
                return;
              }
              setError(null);
              setChosen(file ? { name: file.name, sizeFa: sizeFa(file.size) } : null);
            }}
            className="sr-only"
            data-testid={testId}
          />
        </label>
      )}
    </Field>
  );
}
