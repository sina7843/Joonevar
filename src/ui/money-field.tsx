'use client';

import { useState } from 'react';
import { Field } from './field.tsx';

const toLatin = (value: string) =>
  value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const digitsOf = (value: string) => toLatin(value).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
const show = (digits: string) => (digits === '' ? '' : BigInt(digits).toLocaleString('fa-IR'));

/**
 * DS *MoneyField*: a toman amount typed in Persian or Latin digits, shown in
 * Persian digits with the thousands separator and the «تومان» suffix, posted
 * as plain Latin digits under `name` (what the server parses). No decimals.
 */
export function MoneyField({
  label,
  name,
  defaultValue = '',
  hint,
  error,
  required,
  disabled,
  testId,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const [digits, setDigits] = useState(() => digitsOf(defaultValue));
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ inputId, describedBy, invalid }) => (
        <span className="hz-input-wrap hz-input-wrap--suffix">
          <input
            id={inputId}
            className="hz-input"
            inputMode="numeric"
            autoComplete="off"
            value={show(digits)}
            onChange={(event) => setDigits(digitsOf(event.target.value))}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            disabled={disabled}
            data-testid={testId}
          />
          <span className="hz-input-wrap__suffix">تومان</span>
          <input type="hidden" name={name} value={digits} disabled={disabled} />
        </span>
      )}
    </Field>
  );
}
