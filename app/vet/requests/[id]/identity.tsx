'use client';

import { useActionState } from 'react';
import { Card } from '../../../../src/ui/card.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../../../src/ui/field.tsx';
import { recordIdentityAction, type VetFormState } from '../../actions.ts';

const EMPTY: VetFormState = {};

export interface IdentityDefaults {
  readonly name: string | null;
  readonly breedId: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly birthDate: string | null;
  readonly birthDateApproximate: boolean;
  readonly color: string | null;
  readonly markings: string | null;
}

/**
 * Official identity — §13, §12.5.
 *
 * The owner's declaration is prefilled so the vet corrects rather than retypes,
 * but what is stored is what the vet confirms while looking at the animal. Once
 * saved the panel becomes a read-only record: there is no second write here,
 * because §10 sends a later correction back through the process that produced
 * the data.
 */
export function IdentityPanel({
  requestId,
  breeds,
  defaults,
  verified,
}: {
  requestId: string;
  breeds: ReadonlyArray<{ id: string; nameFa: string; nameEn: string }>;
  defaults: IdentityDefaults;
  verified: { readonly at: Date; readonly byName: string | null } | null;
}) {
  const [state, submit, pending] = useActionState(recordIdentityAction, EMPTY);
  const breedName = breeds.find((b) => b.id === defaults.breedId);

  if (verified) {
    return (
      <Card>
        <h3 className="text-label-lg">مشخصات رسمی حیوان</h3>
        <p className="mt-md text-caption text-text-secondary" data-testid="identity-locked">
          این مشخصات در {verified.at.toLocaleDateString('fa-IR')} ثبت شده‌اند و تغییر نمی‌کنند. اصلاح آن‌ها از
          همان مسیری انجام می‌شود که آن‌ها را ساخته است.
        </p>
        <dl className="mt-lg grid grid-cols-2 gap-sm text-body-sm" data-testid="identity-summary">
          <dt className="text-text-secondary">نام</dt>
          <dd>{defaults.name ?? '—'}</dd>
          <dt className="text-text-secondary">نژاد</dt>
          <dd>{breedName ? breedName.nameFa : '—'}</dd>
          <dt className="text-text-secondary">جنسیت</dt>
          <dd>{defaults.sex === 'MALE' ? 'نر' : defaults.sex === 'FEMALE' ? 'ماده' : '—'}</dd>
          <dt className="text-text-secondary">تاریخ تولد</dt>
          <dd>
            {defaults.birthDate ?? '—'}
            {defaults.birthDateApproximate ? ' (تقریبی)' : ''}
          </dd>
          <dt className="text-text-secondary">رنگ</dt>
          <dd>{defaults.color ?? '—'}</dd>
          <dt className="text-text-secondary">علائم ظاهری</dt>
          <dd>{defaults.markings ?? '—'}</dd>
        </dl>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-label-lg">مشخصات رسمی حیوان</h3>
      <Alert tone="warning" title="پیش از ثبت میکروچیپ تکمیل شود">
        آنچه مالک وارد کرده اظهار اوست. مشخصات رسمی همین‌جا و با دیدن حیوان ثبت می‌شود و پس از ثبت تغییر
        نمی‌کند؛ میکروچیپ هم تا آن زمان ثبت نمی‌شود.
      </Alert>

      <form action={submit} className="mt-lg space-y-lg" data-testid="identity-form">
        <input type="hidden" name="requestId" value={requestId} />
        {state.message ? (
          <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
        ) : null}

        <TextField
          label="نام حیوان"
          name="name"
          required
          defaultValue={defaults.name ?? ''}
          data-testid="identity-name"
        />
        <SelectField
          label="نژاد"
          name="breedId"
          required
          defaultValue={defaults.breedId ?? ''}
          options={breeds.map((b) => ({ value: b.id, label: b.nameFa + ' · ' + b.nameEn }))}
          data-testid="identity-breed"
        />
        <SelectField
          label="جنسیت"
          name="sex"
          required
          defaultValue={defaults.sex ?? ''}
          options={[
            { value: 'MALE', label: 'نر' },
            { value: 'FEMALE', label: 'ماده' },
          ]}
          data-testid="identity-sex"
        />
        <TextField
          label="تاریخ تولد"
          name="birthDate"
          type="date"
          required
          ltr
          defaultValue={defaults.birthDate ?? ''}
          data-testid="identity-birth-date"
        />
        <label className="flex items-center gap-sm text-label-md">
          <input
            type="checkbox"
            name="birthDateApproximate"
            defaultChecked={defaults.birthDateApproximate}
            className="size-[var(--size-selection-md)]"
            data-testid="identity-birth-approximate"
          />
          تاریخ تولد تقریبی است
        </label>
        <TextField
          label="رنگ"
          name="color"
          required
          defaultValue={defaults.color ?? ''}
          data-testid="identity-color"
        />
        <TextField
          label="علائم ظاهری"
          name="markings"
          required
          defaultValue={defaults.markings ?? ''}
          data-testid="identity-markings"
        />

        <Button type="submit" block disabled={pending} data-testid="identity-submit">
          {pending ? 'در حال ثبت…' : 'ثبت نهایی مشخصات رسمی'}
        </Button>
      </form>
    </Card>
  );
}
