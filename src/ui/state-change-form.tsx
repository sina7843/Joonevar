'use client';

import { useActionState, useState } from 'react';
import { Alert } from './alert.tsx';
import { Button } from './button.tsx';
import { ReasonField } from './decision.tsx';

export interface StateChangeState {
  readonly ok?: boolean;
  readonly message?: string;
}

const EMPTY: StateChangeState = {};
const fa = (n: number) => n.toLocaleString('fa-IR');

/**
 * P11 edit for a versioned on/off record (RTO-018): «دلیل تغییر *» and
 * «ذخیره به‌عنوان نسخه N», posting `reasonFa` and `expectedVersion`.
 *
 * Collapsed rows open one at a time behind `openLabel`; the editor closes by
 * itself once the saved version comes back, because it is open only for the
 * version it was opened on.
 */
export function StateChangeForm({
  action,
  hidden,
  version,
  changeFa,
  openLabel,
  alwaysOpen = false,
  ids,
}: {
  action: (previous: StateChangeState, form: FormData) => Promise<StateChangeState>;
  hidden: Readonly<Record<string, string>>;
  version: number;
  /** What saving does, in one line («کنارگذاشتن از انتخاب‌های جدید»). */
  changeFa: string;
  /** Collapsed button label; ignored when `alwaysOpen`. */
  openLabel?: string;
  alwaysOpen?: boolean;
  ids: { form?: string; open?: string; reason: string; save: string; result?: string };
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = alwaysOpen || openedAt === version;
  const result = state.message ? (
    <div data-testid={ids.result}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  ) : null;

  if (!open) {
    return (
      <div className="space-y-xs">
        {result}
        <Button tone="ghost" size="sm" onClick={() => setOpenedAt(version)} data-testid={ids.open}>
          {openLabel}
        </Button>
      </div>
    );
  }

  return (
    <form action={submit} className="hz-setting__edit space-y-sm" data-testid={ids.form}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="expectedVersion" value={version} />
      {result}
      <p className="text-caption text-text-secondary">{changeFa + ' · نسخه فعلی ' + fa(version)}</p>
      <ReasonField
        name="reasonFa"
        label="دلیل تغییر"
        required
        rows={2}
        audience="در تاریخچه با نام شما ثبت می‌شود"
        testId={ids.reason}
      />
      <div className="hz-action-row">
        <Button size="sm" type="submit" disabled={pending} loading={pending} loadingLabel="در حال ذخیره…" data-testid={ids.save}>
          {'ذخیره به‌عنوان نسخه ' + fa(version + 1)}
        </Button>
        {alwaysOpen ? null : (
          <Button size="sm" tone="secondary" onClick={() => setOpenedAt(null)}>
            انصراف
          </Button>
        )}
      </div>
    </form>
  );
}
