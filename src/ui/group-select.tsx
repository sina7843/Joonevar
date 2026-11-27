'use client';

import { useRouter } from 'next/navigation';

/** P11 768–1023: the group nav as a SelectField above the list; choosing a group opens it. */
export function GroupSelect({
  label,
  options,
  className,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string; href: string; current: boolean }>;
  className?: string;
}) {
  const router = useRouter();
  const current = options.find((option) => option.current);
  return (
    <div className={['hz-field', className].filter(Boolean).join(' ')}>
      <label className="hz-field__label" htmlFor="settings-group">
        {label}
      </label>
      <span className="hz-select-wrap">
        <select
          id="settings-group"
          className="hz-select"
          value={current?.value ?? ''}
          onChange={(event) => {
            const next = options.find((option) => option.value === event.target.value);
            if (next) router.push(next.href);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
