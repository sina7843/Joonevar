'use client';

import { useState } from 'react';

/**
 * DS *Switch* (`.hz-switch`, 44×24, `role="switch"`). With `name` it carries
 * its value in a hidden input (`true` / `false`), so it can sit inside a form
 * that is submitted with a reason (P11 boolean settings).
 */
export function Switch({
  name,
  defaultChecked = false,
  labelledBy,
  describedBy,
  label,
  disabled = false,
  onChange,
  testId,
}: {
  name?: string;
  defaultChecked?: boolean;
  labelledBy?: string;
  describedBy?: string;
  /** Accessible name when there is no visible label to point at. */
  label?: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  testId?: string;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <>
      {name ? <input type="hidden" name={name} value={checked ? 'true' : 'false'} /> : null}
      <button
        type="button"
        role="switch"
        className="hz-switch"
        aria-checked={checked}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={labelledBy ? undefined : label}
        disabled={disabled}
        onClick={() => {
          setChecked(!checked);
          onChange?.(!checked);
        }}
        data-testid={testId}
      />
    </>
  );
}
