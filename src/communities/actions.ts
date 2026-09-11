'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError, validation } from '../domain/errors.ts';
import {
  addCommunityEvent,
  assignCommunityOwner,
  changeCommunityStatus,
  createCommunity,
  inviteCommunityManager,
  removeCommunityManager,
  respondToCommunityInvitation,
  setCommunityPublisher,
  setCommunityRegistration,
  updateCommunityEvent,
  updateCommunityProfile,
} from './service.ts';
import { changeCommunityPostStatus, createCommunityPost, updateCommunityPost } from './posts.ts';

export interface CommunityFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * The environment a form was submitted from. The guard checks that the actor
 * may be there; the service then checks the record itself (DEC-0170).
 */
const SURFACES = { admin: '/admin/communities', review: '/review/communities', owner: '/account/communities' } as const;
export type CommunitySurface = keyof typeof SURFACES;

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorOf(form: FormData) {
  const surface = text(form, 'surface');
  if (!Object.hasOwn(SURFACES, surface)) throw validation('محیط ارسال فرم معتبر نیست.');
  const guard = await guardRoute(SURFACES[surface as CommunitySurface]);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): CommunityFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(): void {
  for (const path of Object.values(SURFACES)) revalidatePath(path, 'layout');
  revalidatePath('/associations', 'layout');
}

export async function createCommunityAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    const row = await createCommunity(db(), await actorOf(form), {
      kind: text(form, 'kind'),
      displayNameFa: text(form, 'displayNameFa'),
      scope: text(form, 'scope'),
      sourceFa: text(form, 'sourceFa'),
      reason: text(form, 'reason'),
      confirmedNotDuplicate: form.get('confirmedNotDuplicate') === 'on',
    });
    refresh();
    return { ok: true, message: '«' + row.displayNameFa + '» ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCommunityProfileAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await updateCommunityProfile(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      displayNameFa: text(form, 'displayNameFa'),
      aboutFa: text(form, 'aboutFa'),
      scope: text(form, 'scope'),
      provinceCode: text(form, 'provinceCode'),
      cityId: text(form, 'cityId'),
      membershipInfoFa: text(form, 'membershipInfoFa'),
      membershipUrl: text(form, 'membershipUrl'),
      contactPhone: text(form, 'contactPhone'),
      websiteUrl: text(form, 'websiteUrl'),
      speciesCodes: form.getAll('species').map(String),
      breedIds: form.getAll('breed').map(String),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'پرونده ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setCommunityRegistrationAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await setCommunityRegistration(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      registrationNumber: text(form, 'registrationNumber'),
      licenceStatus: text(form, 'licenceStatus'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'شماره ثبت و وضعیت مجوز ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setCommunityPublisherAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    const row = await setCommunityPublisher(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      canPublishPosts: text(form, 'canPublishPosts') === 'GRANT',
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: row.canPublishPosts ? 'مجوز انتشار مستقیم داده شد.' : 'مجوز انتشار مستقیم برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function assignCommunityOwnerAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await assignCommunityOwner(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      mobile: text(form, 'mobile'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'مدیریت واگذار شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeCommunityStatusAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    const row = await changeCommunityStatus(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: row.publicStatus === 'PUBLISHED' ? 'پرونده منتشر شد.' : 'پرونده پنهان شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── Managers ─────────────────────────────────────────────────────────────

export async function inviteCommunityManagerAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await inviteCommunityManager(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      mobile: text(form, 'mobile'),
      roleFa: text(form, 'roleFa'),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'دعوت فرستاده شد؛ نام مدیر پس از پذیرش او نمایش داده می‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCommunityManagerAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await removeCommunityManager(db(), await actorOf(form), {
      managerId: text(form, 'managerId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      reason: text(form, 'reason'),
    });
    refresh();
    return { ok: true, message: 'مدیر از فهرست برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function respondToCommunityInvitationAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    const guard = await guardRoute('/account/communities');
    if (!guard.ok) throw guard.denied;
    const row = await respondToCommunityInvitation(db(), guard.actor, {
      managerId: text(form, 'managerId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      accept: text(form, 'answer') === 'ACCEPT',
    });
    refresh();
    return { ok: true, message: row.status === 'ACCEPTED' ? 'مدیریت این پرونده را پذیرفتید.' : 'دعوت رد شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── Events ───────────────────────────────────────────────────────────────

const eventFields = (form: FormData) => ({
  titleFa: text(form, 'titleFa'),
  startsOn: text(form, 'startsOn'),
  endsOn: text(form, 'endsOn'),
  cityId: text(form, 'cityId'),
  placeFa: text(form, 'placeFa'),
  descriptionFa: text(form, 'descriptionFa'),
  registrationUrl: text(form, 'registrationUrl'),
  status: text(form, 'status'),
  cancelReasonFa: text(form, 'cancelReasonFa'),
  reason: text(form, 'reason'),
});

export async function addCommunityEventAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await addCommunityEvent(db(), await actorOf(form), text(form, 'communityId'), eventFields(form));
    refresh();
    return { ok: true, message: 'رویداد اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCommunityEventAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await updateCommunityEvent(db(), await actorOf(form), {
      eventId: text(form, 'eventId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      ...eventFields(form),
    });
    refresh();
    return { ok: true, message: 'رویداد ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── Club posts ───────────────────────────────────────────────────────────

export async function createCommunityPostAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await createCommunityPost(db(), await actorOf(form), {
      communityId: text(form, 'communityId'),
      titleFa: text(form, 'titleFa'),
      confirmDuplicate: form.get('confirmDuplicate') === 'on',
    });
    refresh();
    return { ok: true, message: 'پیش‌نویس نوشته ساخته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCommunityPostAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    await updateCommunityPost(db(), await actorOf(form), {
      postId: text(form, 'postId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      titleFa: text(form, 'titleFa'),
      summaryFa: text(form, 'summaryFa'),
      bodyFa: text(form, 'bodyFa'),
    });
    refresh();
    return { ok: true, message: 'نوشته ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeCommunityPostStatusAction(_previous: CommunityFormState, form: FormData): Promise<CommunityFormState> {
  try {
    const row = await changeCommunityPostStatus(db(), await actorOf(form), {
      postId: text(form, 'postId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
    });
    refresh();
    return {
      ok: true,
      message: row.status === 'PUBLISHED' ? 'نوشته منتشر شد.' : row.status === 'ARCHIVED' ? 'نوشته بایگانی شد.' : 'نوشته به پیش‌نویس برگشت.',
    };
  } catch (error) {
    return failure(error);
  }
}
