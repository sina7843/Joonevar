'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { checkIn, correctService } from '../../src/vets/visits.ts';
import {
  bindExistingChip,
  confirmImplant,
  recordChipRead,
  recordRereadAndBind,
} from '../../src/clinical/microchip.ts';
import {
  markSampleUnusable,
  recordSampling,
  recordShipment,
  resample,
} from '../../src/clinical/samples.ts';
import { recordOfficialIdentity } from '../../src/clinical/identity.ts';
import { recordVetPregnancyResult } from '../../src/mating/pregnancy.ts';
import type { ChipReadMethod, UnusableStatus } from '../../src/domain/microchip.ts';
import { AppError } from '../../src/domain/errors.ts';
import type { VisitServiceTypeName } from '../../src/domain/referral.ts';

export interface VetFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'info' | 'success' | 'error';
  /** Where to continue after a successful check-in or correction. */
  readonly requestId?: string;
}

async function requireActor(pathname: string) {
  const guard = await guardRoute(pathname);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): VetFormState {
  if (error instanceof AppError) return { ok: false, message: error.message, tone: 'error' };
  throw error;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

/**
 * Check-in from a scan or from typed characters — the same code either way.
 *
 * A refusal returns the neutral reason and nothing else: no animal, no owner
 * and no hint about which desk the code does belong to (§11.3).
 */
export async function checkInAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  try {
    const actor = await requireActor('/vet/check-in');
    const outcome = await checkIn(db(), actor, {
      code: text(form, 'code'),
      locationId: text(form, 'locationId'),
    });
    revalidatePath('/vet');
    if (!outcome.ok) return { ok: false, message: outcome.messageFa, tone: 'error' };
    return {
      ok: true,
      tone: 'success',
      message: 'کد پذیرفته شد. نمونه‌گیری خون برای این خدمت اجباری است.',
      requestId: outcome.request.id,
    };
  } catch (error) {
    return failure(error);
  }
}

/** In-place service correction for one animal only (§11.4). */
export async function correctServiceAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const result = await correctService(
      db(),
      actor,
      requestId,
      text(form, 'serviceType') as VisitServiceTypeName,
      text(form, 'reason'),
    );
    revalidatePath('/vet');
    revalidatePath('/vet/requests/' + requestId);
    return {
      ok: true,
      tone: 'success',
      message: 'درخواست قبلی جایگزین شد و کد مراجعه جدید صادر شد؛ برای ادامه باید دوباره پذیرش شود.',
      requestId: result.request.id,
    };
  } catch (error) {
    return failure(error);
  }
}

// ── Microchip and sample (§12) ────────────────────────────────────────────

/**
 * Every reading method ends here with one canonical number, so a device that
 * is not configured never blocks the visit: manual entry writes the same field.
 */
/**
 * §13: the vet certifies the identity in front of the animal, once.
 *
 * The values the owner entered are shown as the starting point, but what is
 * stored is what the vet confirms here. There is no edit action beside this one:
 * a correction afterwards goes through the process that produced the data, not
 * through a second write from the same screen.
 */
export async function recordIdentityAction(
  _previous: VetFormState,
  form: FormData,
): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    await recordOfficialIdentity(db(), actor, requestId, {
      name: text(form, 'name'),
      breedId: text(form, 'breedId'),
      sex: text(form, 'sex') as 'MALE' | 'FEMALE',
      birthDate: text(form, 'birthDate'),
      birthDateApproximate: form.get('birthDateApproximate') !== null,
      color: text(form, 'color'),
      markings: text(form, 'markings'),
    });
    revalidatePath('/vet/requests/' + requestId);
    return {
      ok: true,
      tone: 'success',
      message: 'مشخصات رسمی ثبت شد. این مشخصات دیگر از فرم پروفایل مالک تغییر نمی‌کنند.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function readChipAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const outcome = await recordChipRead(db(), actor, requestId, {
      number: text(form, 'number'),
      method: text(form, 'method') as ChipReadMethod,
    });
    revalidatePath('/vet/requests/' + requestId);
    if (outcome.state === 'CONFLICT') {
      return { ok: false, tone: 'error', message: outcome.messageFa + ' عملیات متوقف شد و تعارض ثبت شد.' };
    }
    if (outcome.state === 'CONFIRMED') {
      return { ok: true, tone: 'success', message: 'سریال با رکورد همین حیوان می‌خواند؛ تأیید شد.' };
    }
    if (outcome.state === 'BINDABLE') {
      return {
        ok: true,
        tone: 'info',
        message: 'این چیپ رکورد سیستمی ندارد. پس از کنترل یکتایی می‌توانید آن را به همین حیوان متصل کنید.',
      };
    }
    return { ok: true, tone: 'info', message: 'سریال پیش از کاشت ثبت شد. حالا کاشت را انجام و ثبت کنید.' };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmImplantAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    await confirmImplant(db(), actor, requestId);
    revalidatePath('/vet/requests/' + requestId);
    return { ok: true, tone: 'info', message: 'کاشت ثبت شد. حالا سریال را دوباره بخوانید تا تطبیق داده شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function rereadChipAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const outcome = await recordRereadAndBind(db(), actor, requestId, {
      number: text(form, 'number'),
      method: text(form, 'method') as ChipReadMethod,
    });
    revalidatePath('/vet/requests/' + requestId);
    return outcome.state === 'BOUND'
      ? { ok: true, tone: 'success', message: 'سریال تطبیق داده شد و به‌صورت دائمی به همین حیوان متصل شد.' }
      : { ok: false, tone: 'error', message: outcome.messageFa + ' هیچ اتصالی ثبت نشد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function bindExistingChipAction(
  _previous: VetFormState,
  form: FormData,
): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const outcome = await bindExistingChip(db(), actor, requestId);
    revalidatePath('/vet/requests/' + requestId);
    return outcome.state === 'BOUND'
      ? { ok: true, tone: 'success', message: 'چیپ موجود پس از کنترل یکتایی به همین حیوان متصل شد.' }
      : { ok: false, tone: 'error', message: outcome.messageFa + ' هیچ اتصالی ثبت نشد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function recordSamplingAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const sample = await recordSampling(db(), actor, requestId, { noteFa: text(form, 'note') || null });
    revalidatePath('/vet/requests/' + requestId);
    revalidatePath('/vet/samples');
    return {
      ok: true,
      tone: 'success',
      message: 'نمونه خون ثبت شد و کد رهگیری ' + sample.trackingCode + ' صادر شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function markSampleUnusableAction(
  _previous: VetFormState,
  form: FormData,
): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    await markSampleUnusable(
      db(),
      actor,
      text(form, 'sampleId'),
      text(form, 'status') as UnusableStatus,
      text(form, 'reason'),
    );
    revalidatePath('/vet/requests/' + requestId);
    revalidatePath('/vet/samples');
    return {
      ok: true,
      tone: 'info',
      message: 'نمونه غیرقابل‌استفاده ثبت شد. کد و سابقه قبلی حفظ می‌شود؛ کد جدید فقط پس از نمونه‌گیری مجدد صادر می‌شود.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function resampleAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const sample = await resample(db(), actor, requestId, { noteFa: text(form, 'note') || null });
    revalidatePath('/vet/requests/' + requestId);
    revalidatePath('/vet/samples');
    return {
      ok: true,
      tone: 'success',
      message: 'نمونه‌گیری مجدد در همین درخواست ثبت شد؛ کد جدید ' + sample.trackingCode + ' است.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function recordShipmentAction(_previous: VetFormState, form: FormData): Promise<VetFormState> {
  try {
    const actor = await requireActor('/vet/samples');
    await recordShipment(db(), actor, text(form, 'sampleId'), text(form, 'reference'));
    revalidatePath('/vet/samples');
    return { ok: true, tone: 'success', message: 'ارسال نمونه روی همان کد رهگیری ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * The veterinarian's independent pregnancy result — §18.2, §18.3.
 *
 * It is recorded from this panel only, for a request assigned to this
 * veterinarian, and it never rewrites the owner's declaration.
 */
export async function recordPregnancyResultAction(
  _previous: VetFormState,
  form: FormData,
): Promise<VetFormState> {
  const requestId = text(form, 'requestId');
  try {
    const actor = await requireActor('/vet/requests/' + requestId);
    const raw = text(form, 'expectedCount').trim();
    const row = await recordVetPregnancyResult(db(), actor, requestId, {
      pregnant: text(form, 'pregnant') === 'YES',
      expectedCount: raw === '' ? null : Number(raw),
      noteFa: text(form, 'note'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/vet/requests/' + requestId);
    return {
      ok: true,
      tone: 'success',
      message: 'نتیجه مستقل شما (نسخه ' + row.version + ') ثبت شد؛ اعلام مالک تغییر نمی‌کند.',
    };
  } catch (error) {
    return failure(error);
  }
}
