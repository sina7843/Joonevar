'use client';

import { useId, type ReactNode } from 'react';

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
