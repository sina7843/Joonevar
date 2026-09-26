'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { currentSmsSender } from '../adapters/current.ts';
import { AppError } from '../domain/errors.ts';
import { acceptTerms, cancelRequest, createRequest, markNotCompleted, proposeTerms, REQUESTS_ROUTE, respondToRequest, setContactConsent } from './requests.ts';
import { blockConversation, postMessage, reportMessage } from './conversation.ts';
import { cancelContract, confirmContract, editContract, ensureContractPdf, publishTemplate, requestContractCode, startContract } from './contracts.ts';
import { REQUIRED_CLAUSE_FA, REQUIRED_CLAUSE_KEYS, type TemplateClause } from './request-model.ts';

export interface RequestFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly otpId?: string;
}

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();
const num = (form: FormData, name: string): number => Number(field(form, name));

async function party() {
  const guard = await guardRoute(REQUESTS_ROUTE);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

async function run(requestId: string, work: () => Promise<string | RequestFormState>): Promise<RequestFormState> {
  try {
    const result = await work();
    revalidatePath(REQUESTS_ROUTE, 'layout');
    if (requestId) revalidatePath(REQUESTS_ROUTE + '/' + requestId);
    return typeof result === 'string' ? { ok: true, message: result } : result;
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

const terms = (form: FormData) => ({
  route: field(form, 'route') as never,
  windowFrom: field(form, 'windowFrom'),
  windowTo: field(form, 'windowTo'),
  cityFa: field(form, 'cityFa'),
  placeCategory: field(form, 'placeCategory') as never,
  financialCategory: field(form, 'financialCategory') as never,
  specialConditionsFa: field(form, 'specialConditionsFa') || null,
});

export async function createRequestAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  let id: string;
  try {
    const row = await createRequest(db(), await party(), {
      senderAnimalId: field(form, 'senderAnimalId'),
      receiverProfileId: field(form, 'receiverProfileId'),
      ...terms(form),
      messageFa: field(form, 'messageFa') || null,
      expiresInDays: field(form, 'expiresInDays') ? num(form, 'expiresInDays') : null,
    });
    id = row.id;
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
  redirect(REQUESTS_ROUTE + '/' + id);
}

export async function respondAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    const accept = field(form, 'decision') === 'ACCEPT';
    const row = await respondToRequest(db(), await party(), { requestId, expectedVersion: num(form, 'expectedVersion'), accept, reasonFa: field(form, 'reasonFa') || null });
    return row.status === 'EXPIRED' ? { ok: false, message: 'مهلت این درخواست گذشته است.' } : accept ? 'درخواست پذیرفته شد و گفت‌وگو باز است.' : 'درخواست رد شد.';
  });
}

export async function proposeTermsAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await proposeTerms(db(), await party(), { requestId, expectedVersion: num(form, 'expectedVersion'), ...terms(form) });
    return 'شرایط تازه برای طرف مقابل فرستاده شد.';
  });
}

export async function acceptTermsAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await acceptTerms(db(), await party(), { requestId, expectedVersion: num(form, 'expectedVersion') });
    return 'شرایط پذیرفته شد.';
  });
}

export async function cancelRequestAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await cancelRequest(db(), await party(), { requestId, expectedVersion: num(form, 'expectedVersion'), reasonFa: field(form, 'reasonFa') });
    return 'درخواست لغو شد.';
  });
}

export async function markNotCompletedAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await markNotCompleted(db(), await party(), { requestId, expectedVersion: num(form, 'expectedVersion'), reasonFa: field(form, 'reasonFa') });
    return 'نتیجه ثبت شد.';
  });
}

export async function consentAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await setContactConsent(db(), await party(), { requestId, consent: field(form, 'consent') === 'true' });
    return 'انتخاب شما ثبت شد.';
  });
}

export async function postMessageAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    const file = form.get('file');
    const attachment = file instanceof File && file.size > 0 ? { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name } : null;
    const result = await postMessage(db(), env().PRIVATE_STORAGE_DIR, await party(), { requestId, bodyFa: field(form, 'bodyFa') || null, file: attachment });
    return result.redacted ? 'پیام فرستاده شد؛ اطلاعات تماس تا توافق دو طرف پنهان شد.' : 'پیام فرستاده شد.';
  });
}

export async function blockAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await blockConversation(db(), await party(), { requestId });
    return 'پیام‌های طرف مقابل در این گفت‌وگو بسته شد.';
  });
}

export async function reportMessageAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  return run('', async () => {
    await reportMessage(db(), await party(), { messageId: field(form, 'messageId'), reason: field(form, 'reason'), details: field(form, 'details') || null });
    return 'گزارش ثبت شد.';
  });
}

export async function startContractAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    await startContract(db(), await party(), { requestId, expectedVersion: num(form, 'expectedVersion') });
    return 'پیش‌نویس قرارداد ساخته شد.';
  });
}

export async function editContractAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    const keys = form.getAll('clause').map(String);
    await editContract(db(), await party(), {
      contractId: field(form, 'contractId'),
      expectedNumber: num(form, 'expectedNumber'),
      choices: { financialDetailsFa: field(form, 'financialDetailsFa') || null, clauses: keys.map((key) => ({ key, fillFa: field(form, 'fill-' + key) || null })) },
    });
    return 'نسخه تازه قرارداد ثبت شد؛ هر دو طرف باید همین نسخه را تأیید کنند.';
  });
}

export async function requestCodeAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    const sent = await requestContractCode(db(), await party(), await currentSmsSender(), { contractId: field(form, 'contractId'), number: num(form, 'number') });
    return { ok: true, message: 'کد تأیید برای شماره همراه شما فرستاده شد.', otpId: sent.otpId };
  });
}

export async function confirmContractAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  const h = await headers();
  return run(requestId, async () => {
    const contractId = field(form, 'contractId');
    const outcome = await confirmContract(db(), await party(), {
      contractId,
      number: num(form, 'number'),
      contentHash: field(form, 'contentHash'),
      otpId: field(form, 'otpId'),
      code: field(form, 'code'),
      ip: (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null,
      userAgent: h.get('user-agent'),
    });
    if (outcome.state === 'INVALID_CODE') return { ok: false, message: 'کد درست نیست؛ ' + outcome.attemptsRemaining.toLocaleString('fa-IR') + ' تلاش دیگر باقی است.', otpId: field(form, 'otpId') };
    if (outcome.confirmed) {
      // The PDF is made after the confirmation commits; a failure here leaves the download to make it.
      await ensureContractPdf(db(), env().PRIVATE_STORAGE_DIR, contractId).catch(() => null);
      return 'هر دو طرف تأیید کردند؛ قرارداد ثبت شد.';
    }
    return 'تأیید شما ثبت شد؛ منتظر تأیید طرف مقابل روی همین نسخه.';
  });
}

export async function cancelContractAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  const requestId = field(form, 'requestId');
  return run(requestId, async () => {
    const row = await cancelContract(db(), await party(), { contractId: field(form, 'contractId'), reasonFa: field(form, 'reasonFa'), unilateral: form.get('unilateral') === 'on' });
    return row.status === 'CANCELLED' ? 'قرارداد لغو شد.' : 'درخواست لغو برای طرف مقابل فرستاده شد.';
  });
}

export async function publishTemplateAction(_p: RequestFormState, form: FormData): Promise<RequestFormState> {
  try {
    const guard = await guardRoute('/admin/mating-finder');
    if (!guard.ok) throw guard.denied;
    const clauses: TemplateClause[] = REQUIRED_CLAUSE_KEYS.map((key) => ({ key, required: true, titleFa: REQUIRED_CLAUSE_FA[key], bodyFa: field(form, 'body-' + key) }));
    for (const i of [1, 2, 3]) {
      const key = field(form, 'optKey-' + i).toUpperCase();
      if (key) clauses.push({ key, required: false, titleFa: field(form, 'optTitle-' + i), bodyFa: field(form, 'optBody-' + i) });
    }
    const row = await publishTemplate(db(), guard.actor, { titleFa: field(form, 'titleFa'), clauses, reasonFa: field(form, 'reasonFa'), expectedCurrentVersion: num(form, 'expectedCurrentVersion') });
    revalidatePath('/admin/mating-finder');
    return { ok: true, message: 'قالب نسخه ' + row.version.toLocaleString('fa-IR') + ' منتشر شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
