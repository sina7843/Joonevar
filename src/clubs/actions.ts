'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError, validation } from '../domain/errors.ts';
import {
  assignClubRole,
  cancelClubOwnershipRequest,
  createClub,
  decideClubOwnership,
  decideClubReports,
  decideClubVerification,
  removeClubRole,
  reportClub,
  requestClubOwnership,
  setClubPublication,
  setClubStanding,
  submitClubForVerification,
} from './service.ts';

export interface ClubFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * The environment a form was submitted from. The guard says whether the actor
 * may be there at all; the service then asks what they may do in this one club.
 */
const SURFACES = { owner: '/account/clubs', assoc: '/assoc/clubs', moderation: '/content/clubs', public: '/report' } as const;
export type ClubSurface = keyof typeof SURFACES;

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorOf(form: FormData) {
  const surface = text(form, 'surface');
  if (!Object.hasOwn(SURFACES, surface)) throw validation('محیط ارسال فرم معتبر نیست.');
  const guard = await guardRoute(SURFACES[surface as ClubSurface]);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): ClubFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(clubId?: string): void {
  revalidatePath('/account/clubs', 'layout');
  revalidatePath('/assoc/clubs', 'layout');
  revalidatePath('/content/clubs', 'layout');
  revalidatePath('/clubs', 'layout');
  revalidatePath('/associations', 'layout');
  if (clubId) revalidatePath('/account/clubs/' + clubId);
}

export async function createClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await createClub(db(), await actorOf(form), {
      displayNameFa: text(form, 'displayNameFa'),
      scope: text(form, 'scope'),
      aboutFa: text(form, 'aboutFa'),
      contactPhone: text(form, 'contactPhone'),
    });
    refresh(club.id);
    return { ok: true, message: 'کلاب «' + club.displayNameFa + '» به‌صورت پیش‌نویس ساخته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await submitClubForVerification(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      noteFa: text(form, 'noteFa'),
    });
    refresh(club.id);
    return { ok: true, message: 'کلاب برای بررسی انجمن فرستاده شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubVerificationAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await decideClubVerification(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      outcome: text(form, 'outcome'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(club.id);
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setClubStandingAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await setClubStanding(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(club.id);
    return { ok: true, message: 'وضعیت کلاب ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setClubPublicationAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await setClubPublication(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      publish: text(form, 'publish') === 'true',
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(club.id);
    return { ok: true, message: club.publicStatus === 'PUBLISHED' ? 'صفحه عمومی کلاب منتشر شد.' : 'صفحه عمومی کلاب پنهان شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function assignClubRoleAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await assignClubRole(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      mobile: text(form, 'mobile'),
      role: text(form, 'role'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'نقش در همین کلاب ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function removeClubRoleAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await removeClubRole(db(), await actorOf(form), {
      membershipId: text(form, 'membershipId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'نقش برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function requestClubOwnershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await requestClubOwnership(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      kind: text(form, 'kind'),
      targetMobile: text(form, 'targetMobile'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'درخواست ثبت شد و در انتظار تصمیم انجمن است.' };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelClubOwnershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await cancelClubOwnershipRequest(db(), await actorOf(form), {
      requestId: text(form, 'requestId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'درخواست پس گرفته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubOwnershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const decided = await decideClubOwnership(db(), await actorOf(form), {
      requestId: text(form, 'requestId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      approve: text(form, 'approve') === 'true',
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(decided.club.id);
    return { ok: true, message: 'تصمیم مالکیت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reportClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await reportClub(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      reason: text(form, 'reason'),
      details: text(form, 'details') || null,
    });
    revalidatePath('/content/clubs', 'layout');
    return { ok: true, message: 'گزارش شما ثبت شد و بررسی می‌شود. نام شما به کلاب گفته نمی‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubReportsAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const result = await decideClubReports(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(result.club.id);
    return { ok: true, message: 'تصمیم برای ' + result.decided.toLocaleString('fa-IR') + ' گزارش باز ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}
