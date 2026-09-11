'use client';

import { startTransition, useActionState, useState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import {
  changeContentStatusAction,
  createCategoryAction,
  createContentAction,
  restoreRevisionAction,
  setCategoryActiveAction,
  updateContentAction,
  uploadContentImageAction,
  type ContentFormState,
} from './actions.ts';
import type { ContentPanel, ContentStatus } from './model.ts';

const EMPTY: ContentFormState = {};

function Result({ state, testId }: { state: ContentFormState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/**
 * Submits without React's automatic form reset: a reset <select> falls back to
 * its empty first option, and the next save would clear it (DEC-0157).
 */
function submitWithoutReset(dispatch: (data: FormData) => void, prepare?: (data: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    prepare?.(data);
    startTransition(() => dispatch(data));
  };
}

export function CreateContentForm({
  panel,
  kinds,
}: {
  panel: ContentPanel;
  kinds: ReadonlyArray<{ value: string; label: string }>;
}) {
  const [state, submit, pending] = useActionState(createContentAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">نوشته تازه</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        با عنوان شروع کنید؛ پیش‌نویس ساخته می‌شود و بقیه را در صفحه ویرایش می‌نویسید.
      </p>
      <form action={submit} className="mt-lg space-y-lg" data-testid="create-content-form">
        <input type="hidden" name="panel" value={panel} />
        <Result state={state} testId="create-content-result" />
        <SelectField label="نوع" name="kind" required options={kinds} data-testid="content-kind" />
        <TextField label="عنوان" name="titleFa" required data-testid="content-title-new" />
        {state.duplicate ? (
          <label className="flex items-center gap-sm text-body-sm">
            <input type="checkbox" name="confirmDuplicate" value="YES" data-testid="confirm-duplicate" />
            با وجود عنوان مشابه، نوشته تازه ساخته شود
          </label>
        ) : null}
        <Button type="submit" disabled={pending} data-testid="create-content">
          {pending ? 'در حال ساخت…' : 'ساخت پیش‌نویس'}
        </Button>
      </form>
    </Card>
  );
}

export interface EditorItem {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly slug: string;
  readonly titleFa: string;
  readonly summaryFa: string;
  readonly bodyFa: string;
  readonly sourcesText: string;
  readonly tagsText: string;
  readonly categoryId: string | null;
  readonly speciesCode: string | null;
  readonly breedId: string | null;
  readonly imageFileId: string | null;
  readonly imageAltFa: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly reviewedOn: string | null;
}

export function ContentFieldsForm({
  panel,
  item,
  categories,
  breeds,
  species,
  canEdit,
}: {
  panel: ContentPanel;
  item: EditorItem;
  categories: ReadonlyArray<{ value: string; label: string }>;
  breeds: ReadonlyArray<{ value: string; label: string }>;
  species: ReadonlyArray<{ value: string; label: string }>;
  canEdit: boolean;
}) {
  const [state, submit, pending] = useActionState(updateContentAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">متن و مشخصات</h2>
      <form onSubmit={submitWithoutReset(submit)} className="mt-lg space-y-lg" data-testid="content-fields-form">
        <input type="hidden" name="panel" value={panel} />
        <input type="hidden" name="contentId" value={item.id} />
        <input type="hidden" name="expectedVersion" value={item.version} />
        <Result state={state} testId="content-fields-result" />
        <fieldset disabled={!canEdit} className="space-y-lg">
          <TextField label="عنوان" name="titleFa" required defaultValue={item.titleFa} data-testid="content-title" />
          <TextField
            label="نشانی صفحه"
            name="slug"
            required
            defaultValue={item.slug}
            hint="حروف فارسی یا لاتین کوچک، رقم و خط تیره. نشانی قبلی به نشانی تازه هدایت می‌شود."
            data-testid="content-slug"
          />
          <TextAreaField label="خلاصه" name="summaryFa" rows={3} defaultValue={item.summaryFa} data-testid="content-summary" />
          <TextAreaField
            label="متن"
            name="bodyFa"
            rows={12}
            defaultValue={item.bodyFa}
            hint="بندها را با یک خط خالی از هم جدا کنید."
            data-testid="content-body"
          />
          <TextAreaField
            label="منابع"
            name="sources"
            rows={3}
            defaultValue={item.sourcesText}
            hint="هر منبع در یک خط: «عنوان | پیوند» یا فقط عنوان. آموزش بدون منبع منتشر نمی‌شود."
            data-testid="content-sources"
          />
          <div className="grid gap-lg md:grid-cols-2">
            <SelectField
              label="دسته"
              name="categoryId"
              defaultValue={item.categoryId ?? ''}
              options={categories}
              placeholder="بدون دسته"
              data-testid="content-category"
            />
            <TextField label="تاریخ بازبینی" name="reviewedOn" type="date" ltr defaultValue={item.reviewedOn ?? ''} data-testid="content-reviewed-on" />
            <SelectField
              label="گونه"
              name="speciesCode"
              defaultValue={item.speciesCode ?? ''}
              options={species}
              placeholder="همه گونه‌ها"
              data-testid="content-species"
            />
            <SelectField
              label="نژاد مرتبط"
              name="breedId"
              defaultValue={item.breedId ?? ''}
              options={breeds}
              placeholder="بدون نژاد"
              data-testid="content-breed"
            />
          </div>
          <TextField label="برچسب‌ها" name="tags" defaultValue={item.tagsText} hint="با ویرگول جدا کنید؛ حداکثر ده برچسب." data-testid="content-tags" />
          {item.imageFileId ? (
            <TextField label="متن جایگزین تصویر" name="imageAltFa" required defaultValue={item.imageAltFa ?? ''} data-testid="content-image-alt" />
          ) : null}
          <div className="grid gap-lg md:grid-cols-2">
            <TextField label="عنوان SEO" name="seoTitle" maxLength={70} defaultValue={item.seoTitle ?? ''} data-testid="content-seo-title" />
            <TextField
              label="توضیح SEO"
              name="seoDescription"
              maxLength={200}
              defaultValue={item.seoDescription ?? ''}
              data-testid="content-seo-description"
            />
          </div>
          <Button type="submit" block disabled={pending || !canEdit} data-testid="save-content">
            {pending ? 'در حال ذخیره…' : 'ذخیره نسخه تازه'}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}

export function ContentImageForm({ panel, item }: { panel: ContentPanel; item: EditorItem }) {
  const [state, submit, pending] = useActionState(uploadContentImageAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">تصویر</h2>
      {item.imageFileId ? (
        <img
          src={'/api/files/' + item.imageFileId}
          alt={item.imageAltFa ?? ''}
          className="mt-md max-h-[240px] rounded-md border border-border-subtle object-contain"
          data-testid="content-image-preview"
        />
      ) : (
        <p className="mt-xs text-body-sm text-text-secondary">هنوز تصویری ندارد.</p>
      )}
      <form action={submit} className="mt-lg space-y-lg" data-testid="content-image-form">
        <input type="hidden" name="panel" value={panel} />
        <input type="hidden" name="contentId" value={item.id} />
        <input type="hidden" name="expectedVersion" value={item.version} />
        <Result state={state} testId="content-image-result" />
        <FileField label="فایل تصویر" name="image" accept="image/jpeg,image/png" maxBytes={5 * 1024 * 1024} required testId="content-image-file" />
        <TextField label="متن جایگزین تصویر" name="altFa" required data-testid="content-image-alt-new" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="upload-content-image">
          {pending ? 'در حال بارگذاری…' : 'ذخیره تصویر'}
        </Button>
      </form>
    </Card>
  );
}

export function ContentStatusForm({
  panel,
  item,
  moves,
}: {
  panel: ContentPanel;
  item: EditorItem;
  moves: ReadonlyArray<{ value: ContentStatus; label: string; needsReason: boolean }>;
}) {
  const [state, submit, pending] = useActionState(changeContentStatusAction, EMPTY);
  const [picked, setTo] = useState<string>('');
  // After a change the allowed moves are different; a choice that is no longer
  // among them must not keep the publish time or the button live.
  const chosen = moves.find((move) => move.value === picked) ?? null;
  const to = chosen?.value ?? '';
  return (
    <Card>
      <h2 className="text-label-lg">وضعیت</h2>
      <form
        onSubmit={submitWithoutReset(submit, (data) => {
          // The picker gives a local time with no zone; the browser knows the zone, the server does not.
          const local = String(data.get('publishAtLocal') ?? '');
          data.set('publishAtIso', local === '' ? '' : new Date(local).toISOString());
        })}
        className="mt-lg space-y-lg"
        data-testid="content-status-form"
      >
        <input type="hidden" name="panel" value={panel} />
        <input type="hidden" name="contentId" value={item.id} />
        <input type="hidden" name="expectedVersion" value={item.version} />
        <Result state={state} testId="content-status-result" />
        <SelectField
          label="اقدام"
          name="to"
          required
          value={to}
          onChange={(event) => setTo(event.target.value)}
          options={moves.map((move) => ({ value: move.value, label: move.label }))}
          data-testid="content-status-to"
        />
        {to === 'PUBLISHED' ? (
          <TextField
            label="زمان انتشار"
            name="publishAtLocal"
            type="datetime-local"
            ltr
            hint="خالی یعنی همین حالا. زمان آینده انتشار را زمان‌بندی می‌کند."
            data-testid="content-publish-at"
          />
        ) : null}
        <TextAreaField
          label="دلیل"
          name="reason"
          rows={2}
          required={chosen?.needsReason ?? false}
          hint={chosen?.needsReason ? 'برای این اقدام لازم است و در تاریخچه ثبت می‌شود.' : undefined}
          data-testid="content-status-reason"
        />
        <Button type="submit" disabled={pending || to === ''} data-testid="change-content-status">
          {pending ? 'در حال ثبت…' : 'ثبت'}
        </Button>
      </form>
    </Card>
  );
}

export function RestoreRevisionButton({
  panel,
  item,
  revisionNumber,
}: {
  panel: ContentPanel;
  item: EditorItem;
  revisionNumber: number;
}) {
  const [state, submit, pending] = useActionState(restoreRevisionAction, EMPTY);
  return (
    <form action={submit} className="space-y-xs" data-testid={'restore-revision-form-' + revisionNumber}>
      <input type="hidden" name="panel" value={panel} />
      <input type="hidden" name="contentId" value={item.id} />
      <input type="hidden" name="expectedVersion" value={item.version} />
      <input type="hidden" name="revisionNumber" value={revisionNumber} />
      <Result state={state} testId={'restore-revision-result-' + revisionNumber} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'restore-revision-' + revisionNumber}>
        {pending ? 'در حال بازگردانی…' : 'بازگردانی این نسخه'}
      </Button>
    </form>
  );
}

export function CreateCategoryForm({ kinds }: { kinds: ReadonlyArray<{ value: string; label: string }> }) {
  const [state, submit, pending] = useActionState(createCategoryAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">دسته تازه</h2>
      <form action={submit} className="mt-lg space-y-lg" data-testid="create-category-form">
        <Result state={state} testId="create-category-result" />
        <div className="grid gap-lg md:grid-cols-3">
          <SelectField label="نوع محتوا" name="kind" required options={kinds} data-testid="category-kind" />
          <TextField label="نام" name="nameFa" required data-testid="category-name" />
          <TextField label="نشانی" name="slug" hint="خالی یعنی از روی نام." data-testid="category-slug" />
        </div>
        <Button type="submit" disabled={pending} data-testid="create-category">
          {pending ? 'در حال ثبت…' : 'ساخت دسته'}
        </Button>
      </form>
    </Card>
  );
}

export function CategoryStateForm({ categoryId, active }: { categoryId: string; active: boolean }) {
  const [state, submit, pending] = useActionState(setCategoryActiveAction, EMPTY);
  return (
    <form action={submit} className="space-y-xs">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="active" value={active ? 'NO' : 'YES'} />
      <Result state={state} testId={'category-state-result-' + categoryId} />
      <Button type="submit" tone="ghost" disabled={pending}>
        {active ? 'کنارگذاشتن از انتخاب‌های تازه' : 'فعال‌سازی دوباره'}
      </Button>
    </form>
  );
}
