'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AppError } from '../../../src/domain/errors.ts';
import {
  attachListingMedia,
  createListing,
  moveListing,
  publishListing,
  removeListingMedia,
  saveListing,
} from '../../../src/marketplace/listings.ts';
import { isListingStatus } from '../../../src/marketplace/listing-model.ts';

export interface ListingFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

/**
 * Start an advert for one animal — PROMPT-003.
 *
 * The eligibility question is asked in the service, not here: the button may be
 * hidden for a reason the screen knows, and the answer still has to be the same
 * when somebody posts the form anyway.
 */
export async function createListingAction(
  _previous: ListingFormState,
  form: FormData,
): Promise<ListingFormState> {
  let created: string;
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    const listing = await createListing(db(), guard.actor, { animalId: text(form, 'animalId') });
    created = listing.id;
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath('/account/listings');
  redirect('/account/listings/' + created);
}

export async function saveListingAction(
  _previous: ListingFormState,
  form: FormData,
): Promise<ListingFormState> {
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    const listingId = text(form, 'listingId');
    await saveListing(db(), guard.actor, {
      listingId,
      expectedVersion: Number(form.get('version')),
      priceMode: text(form, 'priceMode'),
      priceToman: text(form, 'priceToman'),
      descriptionFa: text(form, 'descriptionFa'),
      reasonForSaleFa: text(form, 'reasonForSaleFa'),
      provinceCode: text(form, 'provinceCode'),
      cityId: text(form, 'cityId'),
      vaccinationStatus: text(form, 'vaccinationStatus'),
      neuterStatus: text(form, 'neuterStatus'),
      healthNoteFa: text(form, 'healthNoteFa'),
      deliveryMethods: form.getAll('deliveryMethods').map((v) => String(v)),
    });
    revalidatePath('/account/listings/' + listingId);
    return { ok: true, message: 'اطلاعات آگهی ذخیره شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function attachListingMediaAction(
  _previous: ListingFormState,
  form: FormData,
): Promise<ListingFormState> {
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    const listingId = text(form, 'listingId');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION', 'فایلی انتخاب نشده است.');
    const kind = text(form, 'kind') === 'VIDEO' ? 'VIDEO' : 'IMAGE';

    await attachListingMedia(db(), env().PRIVATE_STORAGE_DIR, guard.actor, {
      listingId,
      kind,
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
      altFa: text(form, 'altFa'),
    });
    revalidatePath('/account/listings/' + listingId);
    return { ok: true, message: kind === 'VIDEO' ? 'ویدئو افزوده شد.' : 'تصویر افزوده شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function removeListingMediaAction(
  _previous: ListingFormState,
  form: FormData,
): Promise<ListingFormState> {
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    const listingId = text(form, 'listingId');
    await removeListingMedia(db(), guard.actor, { listingId, mediaId: text(form, 'mediaId') });
    revalidatePath('/account/listings/' + listingId);
    return { ok: true, message: 'رسانه حذف شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

/** Publish, pause, resume, remove. The state machine decides what is allowed. */
export async function moveListingAction(
  _previous: ListingFormState,
  form: FormData,
): Promise<ListingFormState> {
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    const listingId = text(form, 'listingId');
    const to = text(form, 'to');
    if (!isListingStatus(to)) throw new AppError('VALIDATION', 'این تغییر وضعیت مجاز نیست.');
    const expectedVersion = Number(form.get('version'));

    if (to === 'PUBLISHED') {
      await publishListing(db(), guard.actor, { listingId, expectedVersion });
    } else {
      await moveListing(db(), guard.actor, {
        listingId,
        to,
        reasonFa: text(form, 'reason') || undefined,
        expectedVersion,
      });
    }
    revalidatePath('/account/listings');
    revalidatePath('/account/listings/' + listingId);
    return { ok: true, message: 'وضعیت آگهی تغییر کرد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
