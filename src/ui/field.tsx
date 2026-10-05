'use client';

import { useId, useState, type ReactNode } from 'react';
import { Icon } from './icon.tsx';

/**
 * Form fields — DS *Field*, *TextField*, *SelectField*, *TextAreaField*,
 * *LocationField*, *FileField* (`.hz-field`, `.hz-input`, `.hz-select`,
 * `.hz-textarea`, `.hz-file`).
 *
 * The label sits above the control, the hint below it and the error below the
 * hint. The error is wired with `aria-invalid` and `aria-describedby` and
 * announced through `role="alert"`; hint and error share one describedby list,
 * so the hint is not lost when an error appears. Text fields draw focus with
 * their own 2px border (bundle), not an outer ring.
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
    <div className="hz-field">
      <label htmlFor={inputId} className="hz-field__label">
        {label}
        {required ? (
          <span className="hz-field__req" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="hz-field__opt">(اختیاری)</span>
        )}
      </label>
      {children({ inputId, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <div id={hintId} className="hz-field__hint">
          {hint}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} role="alert" className="hz-field__error">
          <Icon name="warning" size="xs" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  required,
  ltr = false,
  suffix,
  className = '',
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Identifiers, codes and phone numbers read left-to-right (§24.3). */
  ltr?: boolean;
  /** A unit at the end: «تومان»، «کیلوگرم». */
  suffix?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => {
        const input = (
          <input
            id={inputId}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            dir={ltr ? 'ltr' : undefined}
            className={['hz-input', ltr ? 'hz-input--ltr' : '', className].join(' ').trim()}
            {...rest}
          />
        );
        return suffix ? (
          <span className="hz-input-wrap hz-input-wrap--suffix">
            {input}
            <span className="hz-input-wrap__suffix">{suffix}</span>
          </span>
        ) : (
          input
        );
      }}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  rows = 5,
  className = '',
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <textarea
          id={inputId}
          rows={rows}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={['hz-textarea', className].join(' ').trim()}
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
  className = '',
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
        <span className="hz-select-wrap">
          <select
            id={inputId}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={['hz-select', className].join(' ').trim()}
            {...rest}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      )}
    </Field>
  );
}

/**
 * Location field.
 *
 * No map provider is configured yet (MAP-001), so the map is presented as
 * unavailable while manual entry stays fully usable. An empty residence location
 * must not block KYC, animal registration or kennel submission (§6.2, §15.2).
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
            className="hz-textarea"
          />
        )}
      </Field>
      {mapAvailable ? (
        <button type="button" onClick={onPickOnMap} className="hz-link hz-link--standalone">
          <Icon name="mapPin" size="sm" />
          انتخاب موقعیت روی نقشه
        </button>
      ) : (
        <p className="hz-caption">انتخاب موقعیت روی نقشه در این نسخه در دسترس نیست؛ نشانی را دستی وارد کنید.</p>
      )}
    </div>
  );
}

/**
 * A file input that refuses an oversized file in the browser — DS *FileField*.
 *
 * Uploads travel through a Server Action, and a request larger than the body
 * limit fails before any of the product's own checks run. This says the reason
 * in the form, in Persian, and clears the selection so the request is never
 * sent. The server still applies the real limit, the accepted types and the
 * signature check: this is a courtesy, not the rule.
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
        <div className={['hz-file', chosen ? '' : 'hz-file--empty', invalid ? 'hz-file--invalid' : ''].join(' ').trim()}>
          <span className="hz-file__icon" aria-hidden="true">
            <Icon name={invalid ? 'warning' : chosen ? 'fileText' : 'uploadSimple'} size="md" />
          </span>
          <span className="hz-file__body">
            <span className="hz-file__name" data-testid={testId ? testId + '-name' : undefined}>
              {chosen ? chosen.name : 'فایلی انتخاب نشده'}
            </span>
            <span className="hz-file__meta">{chosen ? chosen.sizeFa : 'حداکثر ' + megabytes + ' مگابایت'}</span>
          </span>
          <span className="hz-file__actions">
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
              className="hz-visually-hidden"
              data-testid={testId}
            />
            <label htmlFor={inputId} className="hz-btn hz-btn--secondary hz-btn--sm">
              <Icon name="uploadSimple" size="xs" />
              {chosen ? 'تغییر فایل' : 'انتخاب فایل'}
            </label>
          </span>
        </div>
      )}
    </Field>
  );
}
