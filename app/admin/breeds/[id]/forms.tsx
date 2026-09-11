'use client';

import { startTransition, useActionState } from 'react';
import { Card } from '../../../../src/ui/card.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../../../../src/ui/field.tsx';
import {
  BREED_CLAIM_KINDS,
  BREED_COATS,
  BREED_LEVELS,
  BREED_PROFILE_STATUSES,
  BREED_SIZES,
  CLAIM_KIND_FA,
  COAT_FA,
  LEVEL_ATTRIBUTES,
  LEVEL_FA,
  SIZE_FA,
  STATUS_FA,
  canTransition,
  type BreedProfileStatus,
} from '../../../../src/breeds/model.ts';
import {
  addMedicalClaimAction,
  archiveMedicalClaimAction,
  changeBreedStatusAction,
  markBreedDuplicateAction,
  updateBreedProfileAction,
  type BreedEditState,
} from './actions.ts';

const EMPTY: BreedEditState = {};

function Result({ state, testId }: { state: BreedEditState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

const options = <T extends string>(list: readonly T[], labels: Record<T, string>) =>
  list.map((value) => ({ value, label: labels[value] }));

export interface EditableBreed {
  readonly id: string;
  readonly version: number;
  readonly nameFa: string;
  readonly nameEn: string;
  readonly slug: string;
  readonly altNames: readonly string[];
  readonly speciesCode: string;
  readonly groupId: string | null;
  readonly originCountry: string | null;
  readonly size: string | null;
  readonly coat: string | null;
  readonly energy: string | null;
  readonly trainability: string | null;
  readonly careNeed: string | null;
  readonly withChildren: string | null;
  readonly withOtherAnimals: string | null;
  readonly historyFa: string | null;
  readonly standardFa: string | null;
  readonly standardUrl: string | null;
  readonly profileStatus: BreedProfileStatus;
}

export function BreedProfileForm({
  breed,
  groups,
  species,
}: {
  breed: EditableBreed;
  groups: ReadonlyArray<{ id: string; fciGroup: number; nameFa: string }>;
  species: ReadonlyArray<{ code: string; nameFa: string }>;
}) {
  const [state, submit, pending] = useActionState(updateBreedProfileAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">مشخصات و محتوای نژاد</h2>
      {/*
        Submitted from onSubmit rather than the `action` prop. React resets a
        form after its action, and a reset <select> falls back to its first
        option — the empty one — so the next save would have silently cleared
        the group, size and levels that had just been stored (DEC-0157).
      */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => submit(data));
        }}
        className="mt-lg space-y-lg"
        data-testid="breed-profile-form"
      >
        <input type="hidden" name="breedId" value={breed.id} />
        <input type="hidden" name="expectedVersion" value={breed.version} />
        <Result state={state} testId="breed-profile-result" />

        <div className="grid gap-lg md:grid-cols-2">
          <TextField label="نام فارسی" name="nameFa" required defaultValue={breed.nameFa} data-testid="profile-name-fa" />
          <TextField label="نام لاتین" name="nameEn" ltr required defaultValue={breed.nameEn} data-testid="profile-name-en" />
          <TextField
            label="نشانی صفحه"
            name="slug"
            ltr
            required
            defaultValue={breed.slug}
            hint="حروف کوچک لاتین، رقم و خط تیره. نشانی قبلی به نشانی تازه هدایت می‌شود."
            data-testid="profile-slug"
          />
          <SelectField
            label="گونه"
            name="speciesCode"
            required
            defaultValue={breed.speciesCode}
            options={species.map((row) => ({ value: row.code, label: row.nameFa }))}
            data-testid="profile-species"
          />
          <SelectField
            label="گروه FCI"
            name="groupId"
            defaultValue={breed.groupId ?? ''}
            options={groups.map((group) => ({
              value: group.id,
              label: 'گروه ' + group.fciGroup.toLocaleString('fa-IR') + ' — ' + group.nameFa,
            }))}
            placeholder="بدون گروه FCI"
            data-testid="profile-group"
          />
          <TextField
            label="کشور مبدأ"
            name="originCountry"
            ltr
            maxLength={2}
            defaultValue={breed.originCountry ?? ''}
            hint="کد دوحرفی ISO؛ مثلاً IR، DE یا GB."
            data-testid="profile-country"
          />
          <SelectField
            label="اندازه"
            name="size"
            defaultValue={breed.size ?? ''}
            options={options(BREED_SIZES, SIZE_FA)}
            placeholder="تعیین‌نشده"
            data-testid="profile-size"
          />
          <SelectField
            label="پوشش"
            name="coat"
            defaultValue={breed.coat ?? ''}
            options={options(BREED_COATS, COAT_FA)}
            placeholder="تعیین‌نشده"
            data-testid="profile-coat"
          />
          {LEVEL_ATTRIBUTES.map(({ key, labelFa }) => (
            <SelectField
              key={key}
              label={labelFa}
              name={key}
              defaultValue={breed[key] ?? ''}
              options={options(BREED_LEVELS, LEVEL_FA)}
              placeholder="تعیین‌نشده"
              data-testid={'profile-' + key}
            />
          ))}
        </div>

        <TextAreaField
          label="نام‌های دیگر"
          name="altNames"
          rows={3}
          defaultValue={breed.altNames.join('\n')}
          hint="هر نام در یک خط. در جست‌وجو هم پیدا می‌شوند."
          data-testid="profile-alt-names"
        />
        <TextAreaField label="تاریخچه" name="historyFa" rows={6} defaultValue={breed.historyFa ?? ''} data-testid="profile-history" />
        <TextAreaField
          label="خلاصه استاندارد"
          name="standardFa"
          rows={5}
          defaultValue={breed.standardFa ?? ''}
          data-testid="profile-standard"
        />
        <TextField
          label="پیوند متن کامل استاندارد"
          name="standardUrl"
          type="url"
          ltr
          defaultValue={breed.standardUrl ?? ''}
          data-testid="profile-standard-url"
        />

        <Button type="submit" block disabled={pending} data-testid="save-breed-profile">
          {pending ? 'در حال ذخیره…' : 'ذخیره پرونده نژاد'}
        </Button>
      </form>
    </Card>
  );
}

export function BreedStatusForm({
  breedId,
  version,
  status,
}: {
  breedId: string;
  version: number;
  status: BreedProfileStatus;
}) {
  const [state, submit, pending] = useActionState(changeBreedStatusAction, EMPTY);
  const targets = BREED_PROFILE_STATUSES.filter((to) => canTransition(status, to));
  return (
    <Card>
      <h2 className="text-label-lg">وضعیت صفحه عمومی</h2>
      <p className="mt-xs text-body-sm text-text-secondary" data-testid="breed-profile-status">
        {'وضعیت فعلی: ' + STATUS_FA[status]}
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="breed-status-form">
        <input type="hidden" name="breedId" value={breedId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <Result state={state} testId="breed-status-result" />
        <SelectField
          label="وضعیت تازه"
          name="to"
          required
          options={targets.map((to) => ({ value: to, label: STATUS_FA[to] }))}
          data-testid="breed-status-to"
        />
        <TextAreaField label="دلیل" name="reason" rows={2} required data-testid="breed-status-reason" />
        <Button type="submit" disabled={pending} data-testid="change-breed-status">
          {pending ? 'در حال ثبت…' : 'ثبت وضعیت'}
        </Button>
      </form>
    </Card>
  );
}

export function MedicalClaimForm({ breedId }: { breedId: string }) {
  const [state, submit, pending] = useActionState(addMedicalClaimAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">افزودن مطلب سلامت و ژنتیک</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        هر مطلب سلامت منبع و تاریخ بازبینی لازم دارد. آزمایش پیشنهادی فقط اطلاع‌رسانی است و درخواستی نمی‌سازد.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="claim-form">
        <input type="hidden" name="breedId" value={breedId} />
        <Result state={state} testId="claim-result" />
        <SelectField
          label="نوع مطلب"
          name="kind"
          required
          options={options(BREED_CLAIM_KINDS, CLAIM_KIND_FA)}
          data-testid="claim-kind"
        />
        <TextField label="عنوان" name="titleFa" required data-testid="claim-title" />
        <TextAreaField label="توضیح" name="noteFa" rows={3} data-testid="claim-note" />
        <div className="grid gap-lg md:grid-cols-2">
          <TextField label="منبع" name="sourceTitle" required data-testid="claim-source" />
          <TextField label="پیوند منبع" name="sourceUrl" type="url" ltr data-testid="claim-source-url" />
          <TextField label="تاریخ بازبینی" name="reviewedOn" type="date" ltr required data-testid="claim-reviewed-on" />
        </div>
        <Button type="submit" disabled={pending} data-testid="add-claim">
          {pending ? 'در حال ثبت…' : 'ثبت مطلب'}
        </Button>
      </form>
    </Card>
  );
}

export function ArchiveClaimForm({ breedId, claimId }: { breedId: string; claimId: string }) {
  const [state, submit, pending] = useActionState(archiveMedicalClaimAction, EMPTY);
  return (
    <form action={submit} className="mt-md space-y-sm" data-testid="archive-claim-form">
      <input type="hidden" name="breedId" value={breedId} />
      <input type="hidden" name="claimId" value={claimId} />
      <Result state={state} testId="archive-claim-result" />
      <TextField label="دلیل برداشتن از صفحه" name="reason" required data-testid="archive-claim-reason" />
      <Button type="submit" tone="ghost" disabled={pending} data-testid="archive-claim">
        {pending ? 'در حال ثبت…' : 'برداشتن از صفحه عمومی'}
      </Button>
    </form>
  );
}

export function DuplicateForm({
  breedId,
  version,
  targets,
}: {
  breedId: string;
  version: number;
  targets: ReadonlyArray<{ id: string; nameFa: string; nameEn: string }>;
}) {
  const [state, submit, pending] = useActionState(markBreedDuplicateAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">ثبت به‌عنوان نژاد تکراری</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        نژاد تکراری از انتخاب‌های جدید کنار می‌رود و صفحه‌اش به نژاد اصلی اشاره می‌کند. حیوان‌ها و کنل‌هایی که با این
        نژاد ثبت شده‌اند تغییر نمی‌کنند.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="duplicate-form">
        <input type="hidden" name="breedId" value={breedId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <Result state={state} testId="duplicate-result" />
        <SelectField
          label="نژاد اصلی"
          name="primaryBreedId"
          required
          options={targets.map((target) => ({ value: target.id, label: target.nameFa + ' — ' + target.nameEn }))}
          data-testid="duplicate-primary"
        />
        <TextAreaField label="دلیل" name="reason" rows={2} required data-testid="duplicate-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="mark-duplicate">
          {pending ? 'در حال ثبت…' : 'ثبت تکراری'}
        </Button>
      </form>
    </Card>
  );
}
