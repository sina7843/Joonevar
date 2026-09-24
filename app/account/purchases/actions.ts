'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AppError, validation } from '../../../src/domain/errors.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../../../src/adapters/current.ts';
import { cancelAttempt, latestAttempt, startAttempt } from '../../../src/billing/payments.ts';
import {
  acceptInquiry,
  blockThread,
  closeInquiry,
  createInquiry,
  postMessage,
  proposeHandover,
  proposeOffer,
  respondToHandover,
  respondToOffer,
  startDepositPayment,
} from '../../../src/marketplace/inquiries.ts';
import { reportInquiryMessage } from '../../../src/marketplace/listing-moderation.ts';

export interface InquiryFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

/** Money arrives as digits in a form field and becomes an exact integer here. */
function money(form: FormData, key: string): bigint {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^[0-9]+$/.test(raw)) throw validation('مبلغ را با رقم انگلیسی و بدون جداکننده بنویسید.');
  return BigInt(raw);
}

const failure = (error: unknown): InquiryFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

const threadPath = (id: string) => '/account/purchases/' + id;

/** Ask to buy. The advert stays public; the request is what needs the KYC. */
export async function createInquiryAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  let created: string;
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    const offer = text(form, 'offerToman');
    const inquiry = await createInquiry(db(), guard.actor, {
      listingId: text(form, 'listingId'),
      messageFa: text(form, 'message') || null,
      offerToman: offer === '' ? null : money(form, 'offerToman'),
    });
    created = inquiry.id;
  } catch (error) {
    return failure(error);
  }
  redirect(threadPath(created));
}

export async function proposeOfferAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    await proposeOffer(db(), guard.actor, { inquiryId, amountToman: money(form, 'amountToman') });
    revalidatePath(threadPath(inquiryId));
    return { ok: true, message: 'پیشنهاد قیمت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function respondToOfferAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    const accept = text(form, 'answer') === 'ACCEPT';
    await respondToOffer(db(), guard.actor, { inquiryId, offerId: text(form, 'offerId'), accept });
    revalidatePath(threadPath(inquiryId));
    return {
      ok: true,
      message: accept ? 'قیمت نهایی قفل شد و دیگر تغییر نمی‌کند.' : 'پیشنهاد رد شد.',
    };
  } catch (error) {
    return failure(error);
  }
}

/** The seller chooses this buyer. The database decides the race, not this call. */
export async function acceptInquiryAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    await acceptInquiry(db(), guard.actor, {
      inquiryId,
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath(threadPath(inquiryId));
    revalidatePath('/account/listings/' + text(form, 'listingId') + '/requests');
    return { ok: true, message: 'درخواست پذیرفته شد؛ مهلت پرداخت بیعانه برای خریدار آغاز شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function closeInquiryAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'DECLINED' && to !== 'WITHDRAWN') throw validation('این تغییر وضعیت مجاز نیست.');
    await closeInquiry(db(), guard.actor, {
      inquiryId,
      to,
      reasonFa: text(form, 'reason') || undefined,
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath(threadPath(inquiryId));
    revalidatePath('/account/listings/' + text(form, 'listingId') + '/requests');
    return { ok: true, message: to === 'DECLINED' ? 'درخواست رد شد.' : 'درخواست پس گرفته شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Open the deposit payment.
 *
 * The amount is never in this form: the batch reads it from the frozen figure
 * on the request itself, and the reservation happens inside the verifying
 * transaction, not here.
 */
export async function payDepositAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  let destination: string;
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    const { batch } = await startDepositPayment(db(), guard.actor, { inquiryId });
    const started = await startAttempt(
      db(),
      guard.actor,
      { batchId: batch.id, callbackUrl: threadPath(inquiryId) + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Cancelling keeps the request and its frozen deposit for a retry (§26). */
export async function cancelDepositAction(form: FormData): Promise<void> {
  const inquiryId = String(form.get('inquiryId') ?? '');
  const batchId = String(form.get('batchId') ?? '');
  const guard = await guardRoute('/account/purchases');
  if (!guard.ok) throw guard.denied;
  const attempt = await latestAttempt(db(), batchId);
  if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  redirect(threadPath(inquiryId));
}

export async function postMessageAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    const upload = form.get('attachment');
    const file = upload instanceof File && upload.size > 0 ? upload : null;
    await postMessage(db(), env().PRIVATE_STORAGE_DIR, guard.actor, {
      inquiryId,
      bodyFa: text(form, 'body') || null,
      file: file
        ? { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name }
        : null,
    });
    revalidatePath(threadPath(inquiryId));
    return { ok: true, message: 'پیام ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function proposeHandoverAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    const when = new Date(text(form, 'proposedAt'));
    if (Number.isNaN(when.getTime())) throw validation('زمان پیشنهادی را کامل وارد کنید.');
    await proposeHandover(db(), guard.actor, {
      inquiryId,
      method: text(form, 'method'),
      placeFa: text(form, 'place') || null,
      proposedAt: when,
    });
    revalidatePath(threadPath(inquiryId));
    return { ok: true, message: 'زمان و محل تحویل پیشنهاد شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function respondToHandoverAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    await respondToHandover(db(), guard.actor, {
      inquiryId,
      proposalId: text(form, 'proposalId'),
      accept: text(form, 'answer') === 'ACCEPT',
    });
    revalidatePath(threadPath(inquiryId));
    return { ok: true, message: 'پاسخ شما ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function blockThreadAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    await blockThread(db(), guard.actor, { inquiryId, reasonFa: text(form, 'reason') });
    revalidatePath(threadPath(inquiryId));
    return { ok: true, message: 'گفت‌وگو بسته شد. آنچه گفته شده حذف نمی‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reportMessageAction(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const inquiryId = text(form, 'inquiryId');
  try {
    const guard = await guardRoute('/account/purchases');
    if (!guard.ok) throw guard.denied;
    await reportInquiryMessage(db(), guard.actor, {
      inquiryId,
      messageId: text(form, 'messageId'),
      reason: text(form, 'reason'),
      details: text(form, 'details') || null,
    });
    revalidatePath(threadPath(inquiryId));
    return { ok: true, message: 'گزارش شما ثبت شد و ناظر آن را بررسی می‌کند.' };
  } catch (error) {
    return failure(error);
  }
}
