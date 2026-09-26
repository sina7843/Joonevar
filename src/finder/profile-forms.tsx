'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import {
  activateAction,
  addMediaAction,
  changeStateAction,
  declareFertilityAction,
  lifeEventAction,
  preferencesAction,
  removeMediaAction,
  reportProfileAction,
  setPrimaryAction,
  type ProfileFormState,
} from './profile-actions.ts';

const EMPTY: ProfileFormState = {};
const MB = 1024 * 1024;

export function FertilityForm({ animalId, current }: { animalId: string; current: string | null }) {
  const [state, submit, pending] = useActionState(declareFertilityAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid="finder-fertility-form">
      <input type="hidden" name="animalId" value={animalId} />
      <SelectField
        label="اظهار شما درباره باروری"
        name="status"
        required
        defaultValue={current ?? ''}
        options={[
          { value: 'NOT_STERILIZED', label: 'عقیم نشده است' },
          { value: 'STERILIZED', label: 'عقیم شده است' },
        ]}
        data-testid="finder-fertility-status"
      />
      <TextField label="توضیح (اختیاری)" name="noteFa" maxLength={300} />
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-fertility-submit">
          ثبت اظهار
        </Button>
        <Result state={state} testId="finder-fertility-result" />
      </div>
    </form>
  );
}

export function AddMediaForm({ animalId, kind }: { animalId: string; kind: 'IMAGE' | 'VIDEO' }) {
  const [state, submit, pending] = useActionState(addMediaAction, EMPTY);
  const id = kind.toLowerCase();
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid={'finder-media-form-' + id}>
      <input type="hidden" name="animalId" value={animalId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="sm:col-span-2">
        <FileField
          label={kind === 'IMAGE' ? 'تصویر (JPEG یا PNG)' : 'ویدئوی کوتاه (MP4)'}
          name="file"
          accept={kind === 'IMAGE' ? 'image/jpeg,image/png' : 'video/mp4'}
          maxBytes={kind === 'IMAGE' ? 5 * MB : 12 * MB}
          required
          testId={'finder-media-file-' + id}
        />
      </div>
      {kind === 'IMAGE' ? (
        <SelectField
          label="نقش تصویر"
          name="role"
          required
          options={[
            { value: 'FULL_BODY', label: 'تمام‌بدن' },
            { value: 'FACE', label: 'صورت' },
            { value: 'OTHER', label: 'تصویر دیگر' },
          ]}
          data-testid="finder-media-role"
        />
      ) : null}
      <TextField label="متن جایگزین" name="altFa" required maxLength={200} data-testid={'finder-media-alt-' + id} />
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" tone="secondary" disabled={pending} data-testid={'finder-media-submit-' + id}>
          {kind === 'IMAGE' ? 'افزودن تصویر' : 'افزودن ویدئو'}
        </Button>
        <Result state={state} testId={'finder-media-result-' + id} />
      </div>
    </form>
  );
}

export function MediaItemForms({ animalId, mediaId, canBePrimary }: { animalId: string; mediaId: string; canBePrimary: boolean }) {
  const [removeState, remove, removing] = useActionState(removeMediaAction, EMPTY);
  const [primaryState, primary, choosing] = useActionState(setPrimaryAction, EMPTY);
  return (
    <div className="mt-xs flex flex-wrap items-center gap-sm">
      {canBePrimary ? (
        <form onSubmit={submitWith(primary)}>
          <input type="hidden" name="animalId" value={animalId} />
          <input type="hidden" name="mediaId" value={mediaId} />
          <Button type="submit" tone="ghost" disabled={choosing} data-testid={'finder-media-primary-' + mediaId}>
            تصویر اصلی شود
          </Button>
        </form>
      ) : null}
      <form onSubmit={submitWith(remove)}>
        <input type="hidden" name="animalId" value={animalId} />
        <input type="hidden" name="mediaId" value={mediaId} />
        <Button type="submit" tone="ghost" disabled={removing} data-testid={'finder-media-remove-' + mediaId}>
          حذف
        </Button>
      </form>
      <Result state={removeState.message ? removeState : primaryState} testId={'finder-media-item-result-' + mediaId} />
    </div>
  );
}

export function ActivateForm({ animalId, disabledReasonFa }: { animalId: string; disabledReasonFa: string | null }) {
  const [state, submit, pending] = useActionState(activateAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm space-y-sm" data-testid="finder-activate-form">
      <input type="hidden" name="animalId" value={animalId} />
      <Result state={state} testId="finder-activate-result" />
      {disabledReasonFa ? (
        <p className="text-caption text-text-secondary">{disabledReasonFa}</p>
      ) : (
        <Button type="submit" disabled={pending} data-testid="finder-activate">
          فعال‌سازی در جفت‌یابی
        </Button>
      )}
    </form>
  );
}

export function StateForm({
  animalId,
  profileId,
  version,
  targets,
}: {
  animalId: string;
  profileId: string;
  version: number;
  targets: ReadonlyArray<{ value: string; label: string }>;
}) {
  const [state, submit, pending] = useActionState(changeStateAction, EMPTY);
  if (targets.length === 0) return null;
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid="finder-state-form">
      <input type="hidden" name="animalId" value={animalId} />
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div className="min-w-[12rem] flex-1">
        <SelectField label="تغییر وضعیت" name="to" required options={targets} data-testid="finder-state-to" />
      </div>
      <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-state-submit">
        ثبت وضعیت
      </Button>
      <div className="w-full">
        <Result state={state} testId="finder-state-result" />
      </div>
    </form>
  );
}

export function PreferencesForm({ animalId, current }: { animalId: string; current: string | null }) {
  const [state, submit, pending] = useActionState(preferencesAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm space-y-sm" data-testid="finder-preferences-form">
      <input type="hidden" name="animalId" value={animalId} />
      <TextAreaField label="ترجیحات شما برای جفت (اختیاری)" name="preferencesFa" rows={3} maxLength={1000} defaultValue={current ?? ''} />
      <div className="flex flex-wrap items-center gap-md">
        <Button type="submit" tone="secondary" disabled={pending}>
          ذخیره ترجیحات
        </Button>
        <Result state={state} testId="finder-preferences-result" />
      </div>
    </form>
  );
}

export function LifeEventForm({ animalId, options }: { animalId: string; options: ReadonlyArray<{ value: string; label: string }> }) {
  const [state, submit, pending] = useActionState(lifeEventAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-3" data-testid="finder-life-form">
      <input type="hidden" name="animalId" value={animalId} />
      <SelectField label="رویداد" name="kind" required options={options} data-testid="finder-life-kind" />
      <TextField label="تاریخ" name="occurredOn" type="date" required ltr data-testid="finder-life-date" />
      <TextField label="توضیح" name="reasonFa" required maxLength={300} data-testid="finder-life-reason" />
      <div className="flex flex-wrap items-center gap-md sm:col-span-3">
        <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-life-submit">
          ثبت رویداد
        </Button>
        <Result state={state} testId="finder-life-result" />
      </div>
    </form>
  );
}

export function ReportProfileForm({ profileId, images }: { profileId: string; images: ReadonlyArray<{ value: string; label: string }> }) {
  const [state, submit, pending] = useActionState(reportProfileAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid="finder-report-form">
      <input type="hidden" name="profileId" value={profileId} />
      <SelectField
        label="موضوع"
        name="mediaId"
        placeholder="کل پروفایل"
        options={images}
        data-testid="finder-report-target"
      />
      <SelectField
        label="دلیل"
        name="reason"
        required
        options={[
          { value: 'INCORRECT_INFO', label: 'اطلاعات نادرست' },
          { value: 'OFFENSIVE', label: 'تصویر یا متن نامناسب' },
          { value: 'PRIVACY', label: 'افشای اطلاعات خصوصی' },
          { value: 'OTHER', label: 'دلیل دیگر' },
        ]}
        data-testid="finder-report-reason"
      />
      <div className="sm:col-span-2">
        <TextAreaField label="توضیح" name="details" rows={2} maxLength={1000} />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" tone="ghost" disabled={pending} data-testid="finder-report-submit">
          ثبت گزارش
        </Button>
        <Result state={state} testId="finder-report-result" />
      </div>
    </form>
  );
}
