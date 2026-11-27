'use client';

import { useState } from 'react';
import { Icon } from './icon.tsx';

/**
 * DS *QuantityStepper* (`.hz-qty`): «+ · count · −» in one bordered group,
 * min 1, max = what is available. The count is an `<output>`; the value posts
 * through a hidden input named `name`. «−» never removes a line (CartRow has its
 * own remove).
 */
export function QuantityStepper({
  name,
  max,
  value,
  defaultValue = 1,
  onChange,
  label,
  testId,
  size = 'md',
  disabled = false,
}: {
  name?: string;
  max: number;
  value?: number;
  defaultValue?: number;
  onChange?: (next: number) => void;
  label: string;
  testId?: string;
  size?: 'md' | 'sm';
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue);
  const count = value ?? own;
  const set = (next: number) => {
    const clamped = Math.max(1, Math.min(max, next));
    if (value === undefined) setOwn(clamped);
    onChange?.(clamped);
  };
  return (
    <div
      className={['hz-qty', size === 'sm' ? 'hz-qty--sm' : '', disabled ? 'hz-qty--disabled' : ''].join(' ').trim()}
      role="group"
      aria-label={label}
      data-testid={testId}
    >
      <button
        type="button"
        className="hz-icon-btn"
        aria-label="افزودن یکی"
        disabled={disabled || count >= max}
        onClick={() => set(count + 1)}
        data-testid={testId ? testId + '-more' : undefined}
      >
        <Icon name="plus" size="sm" />
      </button>
      <output className="hz-qty__count" aria-live="polite">
        {count.toLocaleString('fa-IR')}
      </output>
      <button
        type="button"
        className="hz-icon-btn"
        aria-label="کم کردن یکی"
        disabled={disabled || count <= 1}
        onClick={() => set(count - 1)}
        data-testid={testId ? testId + '-less' : undefined}
      >
        <Icon name="minus" size="sm" />
      </button>
      {name ? <input type="hidden" name={name} value={count} /> : null}
    </div>
  );
}
