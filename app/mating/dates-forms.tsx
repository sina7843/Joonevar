'use client';

import { useActionState, useState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { TextField } from '../../src/ui/field.tsx';
import {
  confirmDateAction,
  declareDateAction,
  differentDateAction,
  type DateFormState,
} from './dates-actions.ts';

const EMPTY: DateFormState = {};

function Result({ state }: { state: DateFormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />
  );
}

/**
 * Declaring a date — §17.1.
 *
 * The same form serves a first declaration and a correction; a correction only
 * adds the version it replaces, and never edits it in place.
 */
export function DeclareDateForm({
  permitId,
  replacesVersion = null,
}: {
  permitId: string;
  replacesVersion?: number | null;
}) {
  const [state, submit, pending] = useActionState(declareDateAction, EMPTY);
  const suffix = replacesVersion === null ? '' : '-correction';
  return (
    <Card>
      <h2 className="text-label-lg">
        {replacesVersion === null ? 'اعلام تاریخ جفت‌گیری' : 'اصلاح تاریخ (نسخه جدید)'}
      </h2>
      <p className="mt-md text-caption text-text-secondary">
        هر دو طرف می‌توانند یک یا چند تاریخ اعلام کنند. اصلاح، نسخه تازه‌ای می‌سازد و رکورد قبلی حذف
        نمی‌شود؛ نسخه اصلاح‌شده دوباره باید به تأیید طرف مقابل برسد.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid={'declare-date-form' + suffix}>
        <input type="hidden" name="permitId" value={permitId} />
        {replacesVersion === null ? null : (
          <input type="hidden" name="replacesVersion" value={replacesVersion} />
        )}
        <Result state={state} />
        <TextField
          label="تاریخ جفت‌گیری (میلادی، YYYY-MM-DD)"
          name="matedOn"
          ltr
          required
          data-testid={'mated-on' + suffix}
        />
        <TextField label="توضیح (اختیاری)" name="note" data-testid={'date-note' + suffix} />
        <Button type="submit" block disabled={pending} data-testid={'submit-date' + suffix}>
          {pending ? 'در حال ثبت…' : replacesVersion === null ? 'اعلام تاریخ' : 'ثبت نسخه اصلاحی'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * The counterparty's answer — §17.1.
 *
 * Either the same date is confirmed, or a different one is declared and both
 * values stay visible as a DATE_CONFLICT.
 */
export function RespondToDateForm({
  permitId,
  declarationId,
  version,
  matedOn,
}: {
  permitId: string;
  declarationId: string;
  version: number;
  matedOn: string;
}) {
  const [confirmState, confirm, confirming] = useActionState(confirmDateAction, EMPTY);
  const [conflictState, conflictSubmit, conflicting] = useActionState(differentDateAction, EMPTY);
  const [different, setDifferent] = useState(false);

  return (
    <Card>
      <h2 className="text-label-lg">پاسخ شما به نسخه {version}</h2>
      <p className="mt-md text-body-sm" data-testid="pending-date-value">
        تاریخ اعلام‌شده: <span dir="ltr" className="font-mono">{matedOn}</span>
      </p>

      <form action={confirm} className="mt-lg space-y-lg" data-testid="confirm-date-form">
        <input type="hidden" name="permitId" value={permitId} />
        <input type="hidden" name="declarationId" value={declarationId} />
        <input type="hidden" name="version" value={version} />
        <Result state={confirmState} />
        <Button type="submit" block disabled={confirming} data-testid="confirm-date">
          {confirming ? 'در حال ثبت…' : 'تأیید همین تاریخ'}
        </Button>
      </form>

      <div className="mt-lg">
        <Button
          type="button"
          tone="secondary"
          block
          onClick={() => setDifferent((value) => !value)}
          data-testid="toggle-different-date"
        >
          اعلام تاریخ متفاوت
        </Button>
      </div>

      {different ? (
        <form action={conflictSubmit} className="mt-lg space-y-lg" data-testid="different-date-form">
          <input type="hidden" name="permitId" value={permitId} />
          <input type="hidden" name="declarationId" value={declarationId} />
          <input type="hidden" name="version" value={version} />
          <Result state={conflictState} />
          <TextField
            label="تاریخ مورد نظر شما (میلادی، YYYY-MM-DD)"
            name="matedOn"
            ltr
            required
            data-testid="different-mated-on"
          />
          <TextField label="توضیح (اختیاری)" name="note" data-testid="different-note" />
          <Button type="submit" block disabled={conflicting} data-testid="submit-different-date">
            {conflicting ? 'در حال ثبت…' : 'ثبت تاریخ متفاوت'}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
