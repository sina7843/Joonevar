'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { TextField } from '../ui/field.tsx';
import { Check, Result, submitWith } from '../vets/directory-forms.tsx';
import { deleteSavedSearchAction, saveSearchAction, toggleFavoriteAction, type DiscoveryFormState } from './discovery-actions.ts';

const EMPTY: DiscoveryFormState = {};

export function FavoriteForm({ profileId, favorite }: { profileId: string; favorite: boolean }) {
  const [state, submit, pending] = useActionState(toggleFavoriteAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex flex-wrap items-center gap-sm">
      <input type="hidden" name="profileId" value={profileId} />
      <Button type="submit" tone="ghost" disabled={pending} aria-pressed={favorite} data-testid={'finder-favorite-' + profileId}>
        {favorite ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
      </Button>
      <Result state={state} testId={'finder-favorite-result-' + profileId} />
    </form>
  );
}

export function SaveSearchForm({ query }: { query: string }) {
  const [state, submit, pending] = useActionState(saveSearchAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid="finder-save-search-form">
      <input type="hidden" name="query" value={query} />
      <div className="min-w-[12rem] flex-1">
        <TextField label="نام این جست‌وجو" name="nameFa" required maxLength={80} data-testid="finder-save-search-name" />
      </div>
      <Check name="notify" label="وقتی حیوان تازه‌ای جور شد خبرم کن" defaultChecked testId="finder-save-search-notify" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-save-search-submit">
        ذخیره جست‌وجو
      </Button>
      <div className="w-full">
        <Result state={state} testId="finder-save-search-result" />
      </div>
    </form>
  );
}

export function DeleteSavedSearchForm({ id }: { id: string }) {
  const [state, submit, pending] = useActionState(deleteSavedSearchAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex items-center gap-sm">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'finder-saved-delete-' + id}>
        حذف
      </Button>
      <Result state={state} testId={'finder-saved-delete-result-' + id} />
    </form>
  );
}
