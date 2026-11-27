'use client';

import { useRef, useState } from 'react';

const toLatin = (value: string) => value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * DS *OtpField* (`.hz-otp`): six one-digit boxes, left to right, that post one
 * `name` value. Typing moves on, Backspace on an empty box goes back, and a
 * pasted or autofilled code (in any box) is spread across the boxes. Persian
 * digits are accepted and posted as Latin.
 */
export function OtpField({
  name,
  length = 6,
  label = 'کد تأیید ۶ رقمی',
  invalid = false,
  describedBy,
  testId,
  autoFocus = false,
}: {
  name: string;
  length?: number;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
  /** On the first box; filling it with the whole code spreads it (tests, autofill). */
  testId?: string;
  autoFocus?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ''));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const put = (from: number, raw: string) => {
    const incoming = toLatin(raw).replace(/\D/g, '');
    if (incoming === '') {
      setDigits((current) => current.map((digit, index) => (index === from ? '' : digit)));
      return;
    }
    const next = [...digits];
    let at = from;
    for (const digit of incoming) {
      if (at >= length) break;
      next[at] = digit;
      at += 1;
    }
    setDigits(next);
    boxes.current[Math.min(at, length - 1)]?.focus();
  };

  return (
    <div className="hz-otp" role="group" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          value={digit}
          onChange={(event) => put(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && digit === '' && index > 0) boxes.current[index - 1]?.focus();
          }}
          onPaste={(event) => {
            event.preventDefault();
            put(index, event.clipboardData.getData('text'));
          }}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={'رقم ' + (index + 1).toLocaleString('fa-IR') + ' از ' + length.toLocaleString('fa-IR')}
          autoFocus={autoFocus && index === 0}
          data-testid={index === 0 ? testId : undefined}
        />
      ))}
      <input type="hidden" name={name} value={digits.join('')} />
    </div>
  );
}
