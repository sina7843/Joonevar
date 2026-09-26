'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError } from '../domain/errors.ts';
import { deleteSavedSearch, saveSearch, toggleFavorite } from './discovery.ts';

export interface DiscoveryFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

async function signedIn() {
  const guard = await guardRoute('/account/mating-finder');
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): DiscoveryFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

export async function toggleFavoriteAction(_p: DiscoveryFormState, form: FormData): Promise<DiscoveryFormState> {
  try {
    const added = await toggleFavorite(db(), await signedIn(), field(form, 'profileId'));
    revalidatePath('/mating-finder', 'layout');
    revalidatePath('/account/mating-finder/favorites');
    return { ok: true, message: added ? 'به علاقه‌مندی‌ها افزوده شد.' : 'از علاقه‌مندی‌ها برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** The filters come from the page's own query string, re-parsed on the server. */
export async function saveSearchAction(_p: DiscoveryFormState, form: FormData): Promise<DiscoveryFormState> {
  try {
    const raw = Object.fromEntries(new URLSearchParams(field(form, 'query')).entries());
    await saveSearch(db(), await signedIn(), { nameFa: field(form, 'nameFa'), raw, notify: form.get('notify') === 'on' });
    revalidatePath('/account/mating-finder/saved-searches');
    return { ok: true, message: 'جست‌وجو ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSavedSearchAction(_p: DiscoveryFormState, form: FormData): Promise<DiscoveryFormState> {
  try {
    await deleteSavedSearch(db(), await signedIn(), field(form, 'id'));
    revalidatePath('/account/mating-finder/saved-searches');
    return { ok: true, message: 'جست‌وجو حذف شد.' };
  } catch (error) {
    return failure(error);
  }
}
