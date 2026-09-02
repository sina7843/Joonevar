'use client';

import { useActionState, useState } from 'react';
import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';
import {
  attachCheckAction,
  correctBirthAction,
  declarePregnancyAction,
  recordBirthAction,
  recordPuppyDeathAction,
  renamePuppyAction,
  startPregnancyFinderAction,
  type BreedingFormState,
} from './breeding-actions.ts';

const EMPTY: BreedingFormState = {};

function Result({ state }: { state: BreedingFormState }) {
  if (!state.message) return null;
  return (
    <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />
  );
}

/**
 * The owner's pregnancy declaration — §18.1, §18.3.
 *
 * A correction needs a reason and makes a new version; the earlier version is
 * kept and shown in the history below.
 */
export function DeclarePregnancyForm({
  permitId,
  isCorrection,
  defaults,
}: {
  permitId: string;
  isCorrection: boolean;
  defaults: { pregnant: boolean; expectedCount: number | null };
}) {
  const [state, submit, pending] = useActionState(declarePregnancyAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">{isCorrection ? 'اصلاح اعلام بارداری' : 'اعلام بارداری'}</h2>
      <form action={submit} className="mt-lg space-y-lg" data-testid="pregnancy-form">
        <input type="hidden" name="permitId" value={permitId} />
        <Result state={state} />
        <SelectField
          label="نتیجه اعلام شما"
          name="pregnant"
          required
          defaultValue={defaults.pregnant ? 'YES' : 'NO'}
          data-testid="pregnancy-result"
          options={[
            { value: 'YES', label: 'بارداری تأیید اعلام‌شده' },
            { value: 'NO', label: 'بارداری رخ نداده است' },
          ]}
        />
        <TextField
          label="تعداد تخمینی (اختیاری)"
          name="expectedCount"
          ltr
          defaultValue={defaults.expectedCount ?? ''}
          data-testid="pregnancy-expected"
        />
        <TextField label="توضیح (اختیاری)" name="note" data-testid="pregnancy-note" />
        {isCorrection ? (
          <TextField label="علت اصلاح" name="reason" required data-testid="pregnancy-reason" />
        ) : null}
        <Button type="submit" block disabled={pending} data-testid="submit-pregnancy">
          {pending ? 'در حال ثبت…' : isCorrection ? 'ثبت نسخه اصلاحی' : 'ثبت اعلام'}
        </Button>
      </form>
    </Card>
  );
}

/** §18.2: the optional verification, started in the Finder and then attached. */
export function RequestPregnancyCheckForm({
  permitId,
  requests,
}: {
  permitId: string;
  requests: readonly { id: string; label: string }[];
}) {
  const [state, submit, pending] = useActionState(attachCheckAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">درخواست تأیید اختیاری دامپزشک</h2>
      <p className="mt-md text-caption text-text-secondary">
        این مرحله اختیاری است. دامپزشک و مرکز را در Finder انتخاب می‌کنید، درخواست فقط به همان دامپزشک
        تخصیص می‌یابد و صف عمومی برای برداشتن پرونده وجود ندارد.
      </p>
      <form action={startPregnancyFinderAction} className="mt-lg" data-testid="pregnancy-finder-form">
        <input type="hidden" name="permitId" value={permitId} />
        <Button type="submit" block tone="secondary" data-testid="open-pregnancy-finder">
          انتخاب دامپزشک در Finder
        </Button>
      </form>

      {requests.length > 0 ? (
        <form action={submit} className="mt-lg space-y-lg" data-testid="attach-check-form">
          <input type="hidden" name="permitId" value={permitId} />
          <Result state={state} />
          <SelectField
            label="اتصال درخواست مراجعه به این پرونده"
            name="requestId"
            required
            data-testid="check-request"
            options={requests.map((row) => ({ value: row.id, label: row.label }))}
          />
          <Button type="submit" block disabled={pending} data-testid="attach-check">
            {pending ? 'در حال اتصال…' : 'اتصال به پرونده بارداری'}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

/** §19.1: two independent counts; both may be zero. */
export function RecordBirthForm({ permitId }: { permitId: string }) {
  const [state, submit, pending] = useActionState(recordBirthAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">ثبت نتیجه زایمان</h2>
      <p className="mt-md text-caption text-text-secondary">
        تعداد توله زنده و مرده دو عدد مستقل و صفر یا بیشترند. برای هر توله زنده یک پرونده موقت ساخته می‌شود؛
        برای توله‌ای که در همین اعلام مرده ثبت شود، پرونده، کد موقت یا کارت ساخته نمی‌شود.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="birth-form">
        <input type="hidden" name="permitId" value={permitId} />
        <Result state={state} />
        <TextField label="تاریخ تولد (میلادی، YYYY-MM-DD)" name="bornOn" ltr required data-testid="born-on" />
        <TextField label="تعداد توله زنده" name="liveCount" ltr required data-testid="live-count" />
        <TextField label="تعداد توله مرده" name="deadCount" ltr required data-testid="dead-count" />
        <TextField label="توضیح (اختیاری)" name="note" data-testid="birth-note" />
        <Button type="submit" block disabled={pending} data-testid="submit-birth">
          {pending ? 'در حال ثبت…' : 'ثبت نتیجه زایمان'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * §19.2: correcting the counts.
 *
 * Reducing the live count asks which existing profiles the corrected report
 * withdraws, because a smaller number is never permission to delete a file on
 * its own.
 */
export function CorrectBirthForm({
  permitId,
  version,
  defaults,
  standing,
}: {
  permitId: string;
  version: number;
  defaults: { liveCount: number; deadCount: number };
  standing: readonly { id: string; tempCode: string; nameFa: string | null; statusFa: string }[];
}) {
  const [state, submit, pending] = useActionState(correctBirthAction, EMPTY);
  const [live, setLive] = useState(String(defaults.liveCount));
  const reducing = Number(live) < standing.length;

  return (
    <Card>
      <h2 className="text-label-lg">اصلاح تعداد</h2>
      <p className="mt-md text-caption text-text-secondary">
        وجود پرونده توله مانع اصلاح نیست و بررسی انجمن دوباره لازم نمی‌شود. نسخه و مقدار قبلی حذف نمی‌شود.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="correct-birth-form">
        <input type="hidden" name="permitId" value={permitId} />
        <input type="hidden" name="version" value={version} />
        <Result state={state} />
        <TextField
          label="تعداد توله زنده"
          name="liveCount"
          ltr
          required
          value={live}
          onChange={(event) => setLive(event.target.value)}
          data-testid="correct-live-count"
        />
        <TextField
          label="تعداد توله مرده"
          name="deadCount"
          ltr
          required
          defaultValue={defaults.deadCount}
          data-testid="correct-dead-count"
        />
        <TextField label="علت اصلاح" name="reason" required data-testid="correct-reason" />
        {reducing ? (
          <fieldset className="space-y-sm" data-testid="withdraw-list">
            <legend className="text-label-md">کدام پرونده‌ها با این اصلاح کنار گذاشته می‌شوند؟</legend>
            <p className="text-caption text-text-secondary">
              این کار پرونده را حذف نمی‌کند؛ آن را با علت شما «حذف‌شده با اصلاح گزارش اولیه» ثبت می‌کند.
            </p>
            {standing.map((puppy) => (
              <label key={puppy.id} className="flex items-center gap-sm text-body-sm">
                <input
                  type="checkbox"
                  name="withdraw"
                  value={puppy.id}
                  className="size-[var(--size-selection-md)]"
                  data-testid={'withdraw-' + puppy.tempCode}
                />
                {puppy.tempCode} · {puppy.nameFa ?? 'بدون نام'} · {puppy.statusFa}
              </label>
            ))}
          </fieldset>
        ) : null}
        <Button type="submit" block disabled={pending} data-testid="submit-correction">
          {pending ? 'در حال ثبت…' : 'ثبت نسخه اصلاحی'}
        </Button>
      </form>
    </Card>
  );
}

/** §19.2: a death after birth, distinct from having been dead at birth. */
export function PuppyDeathForm({
  permitId,
  puppyId,
  tempCode,
  version,
}: {
  permitId: string;
  puppyId: string;
  tempCode: string;
  version: number;
}) {
  const [state, submit, pending] = useActionState(recordPuppyDeathAction, EMPTY);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        tone="secondary"
        onClick={() => setOpen(true)}
        data-testid={'open-death-' + tempCode}
      >
        ثبت مرگ پس از تولد
      </Button>
    );
  }
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'death-form-' + tempCode}>
      <input type="hidden" name="permitId" value={permitId} />
      <input type="hidden" name="puppyId" value={puppyId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <TextField
        label="تاریخ مرگ (میلادی، YYYY-MM-DD)"
        name="diedOn"
        ltr
        required
        data-testid={'died-on-' + tempCode}
      />
      <TextField label="علت" name="reason" required data-testid={'death-reason-' + tempCode} />
      <Button type="submit" block disabled={pending} data-testid={'submit-death-' + tempCode}>
        {pending ? 'در حال ثبت…' : 'ثبت مرگ توله'}
      </Button>
    </form>
  );
}

/** The name stays optional until the microchip stage (§19.1). */
export function PuppyNameForm({
  permitId,
  puppyId,
  tempCode,
  version,
  nameFa,
}: {
  permitId: string;
  puppyId: string;
  tempCode: string;
  version: number;
  nameFa: string | null;
}) {
  const [state, submit, pending] = useActionState(renamePuppyAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-md" data-testid={'name-form-' + tempCode}>
      <input type="hidden" name="permitId" value={permitId} />
      <input type="hidden" name="puppyId" value={puppyId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} />
      <TextField
        label="نام توله (اختیاری تا مرحله میکروچیپ)"
        name="name"
        defaultValue={nameFa ?? ''}
        data-testid={'puppy-name-' + tempCode}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-name-' + tempCode}>
        {pending ? 'در حال ذخیره…' : 'ذخیره نام'}
      </Button>
    </form>
  );
}
