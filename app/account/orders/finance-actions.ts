'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AppError, validation } from '../../../src/domain/errors.ts';
import { addReturnEvidence, moveReturn, requestReturn, publishReturnPolicy } from '../../../src/commerce/returns.ts';
import { moveBatch, openSettlementBatch, recordOperatorEntry, requestCadence } from '../../../src/commerce/ledger.ts';
import type { ReturnStatus, ReturnedCondition } from '../../../src/commerce/fulfilment-model.ts';
import type { SettlementStatus } from '../../../src/commerce/fulfilment-model.ts';

export interface FinanceFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

function money(form: FormData, key: string): bigint {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^-?[0-9]+$/.test(raw)) throw validation('مبلغ را با رقم انگلیسی و بدون جداکننده بنویسید.');
  return BigInt(raw);
}

function count(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^[0-9]+$/.test(raw)) throw validation('عدد را با رقم انگلیسی بنویسید.');
  return Number(raw);
}

const failure = (error: unknown): FinanceFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

/** The buyer asks for goods to go back, line by line. */
export async function requestReturnAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/account/orders');
    if (!guard.ok) throw guard.denied;
    const chosen = form.getAll('items').map(String);
    if (chosen.length === 0) throw validation('حداقل یک قلم را برای مرجوعی انتخاب کنید.');
    const created = await requestReturn(db(), guard.actor, {
      subOrderId: text(form, 'subOrderId'),
      reasonFa: text(form, 'reason'),
      lines: chosen.map((orderItemId) => ({
        orderItemId,
        quantity: count(form, 'quantity-' + orderItemId),
        reasonFa: text(form, 'reason-' + orderItemId) || text(form, 'reason'),
      })),
    });
    revalidatePath('/account/orders');
    revalidatePath('/account/seller/returns');
    return { ok: true, message: 'درخواست مرجوعی ' + created.reference + ' ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

async function move(guardPath: string, form: FormData): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute(guardPath);
    if (!guard.ok) throw guard.denied;
    const condition = text(form, 'condition');
    const moved = await moveReturn(db(), guard.actor, {
      returnId: text(form, 'returnId'),
      to: text(form, 'to') as ReturnStatus,
      noteFa: text(form, 'note') || null,
      trackingCode: text(form, 'tracking') || null,
      condition: condition === '' ? null : (condition as ReturnedCondition),
    });
    revalidatePath('/account/orders');
    revalidatePath('/account/seller/returns');
    revalidatePath('/market/returns');
    return { ok: true, message: 'مرجوعی ' + moved.reference + ' به‌روزرسانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

export const moveReturnAsBuyerAction = async (_p: FinanceFormState, form: FormData) =>
  move('/account/orders', form);
export const moveReturnAsSellerAction = async (_p: FinanceFormState, form: FormData) =>
  move('/account/seller/returns', form);
export const moveReturnAsOperatorAction = async (_p: FinanceFormState, form: FormData) =>
  move('/market/returns', form);

export async function addReturnEvidenceAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/account/orders');
    if (!guard.ok) throw guard.denied;
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw validation('فایلی انتخاب نشده است.');
    await addReturnEvidence(db(), env().PRIVATE_STORAGE_DIR, guard.actor, {
      returnId: text(form, 'returnId'),
      noteFa: text(form, 'note') || null,
      bytes: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name,
    });
    revalidatePath('/account/orders');
    revalidatePath('/account/seller/returns');
    return { ok: true, message: 'مدرک افزوده شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** The shop asks for a different settlement cadence, which starts next cycle. */
export async function requestCadenceAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/account/seller/finance');
    if (!guard.ok) throw guard.denied;
    const cadence = text(form, 'cadence');
    if (cadence !== 'WEEKLY' && cadence !== 'MONTHLY') throw validation('دوره تسویه معتبر نیست.');
    const from = await requestCadence(db(), guard.actor, { sellerId: text(form, 'sellerId'), cadence });
    revalidatePath('/account/seller/finance');
    return {
      ok: true,
      message: 'از ' + from.toLocaleDateString('fa-IR') + ' دوره تسویه شما تغییر می‌کند.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function openBatchAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/market/settlement');
    if (!guard.ok) throw guard.denied;
    const batch = await openSettlementBatch(db(), guard.actor, text(form, 'sellerId'));
    revalidatePath('/market/settlement');
    return { ok: true, message: 'دسته تسویه ' + batch.reference + ' ساخته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function moveBatchAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/market/settlement');
    if (!guard.ok) throw guard.denied;
    const moved = await moveBatch(db(), guard.actor, {
      batchId: text(form, 'batchId'),
      to: text(form, 'to') as SettlementStatus,
      bankReference: text(form, 'bankReference') || null,
      reasonFa: text(form, 'reason') || null,
    });
    revalidatePath('/market/settlement');
    revalidatePath('/account/seller/finance');
    return { ok: true, message: 'وضعیت دسته ' + moved.reference + ' ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function ledgerEntryAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/market/settlement');
    if (!guard.ok) throw guard.denied;
    const kind = text(form, 'kind');
    if (kind !== 'PROMOTION_CHARGE' && kind !== 'PENALTY' && kind !== 'ADJUSTMENT') {
      throw validation('نوع ثبت معتبر نیست.');
    }
    await recordOperatorEntry(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      kind,
      amountToman: money(form, 'amount'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/settlement');
    revalidatePath('/account/seller/finance');
    return { ok: true, message: 'در دفتر مالی این فروشگاه ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Publish a version of the platform's return promise. */
export async function publishReturnPolicyAction(
  _previous: FinanceFormState,
  form: FormData,
): Promise<FinanceFormState> {
  try {
    const guard = await guardRoute('/market/returns');
    if (!guard.ok) throw guard.denied;
    const exceptions: {
      categoryId: string;
      rule: 'SEALED_ONLY' | 'NOT_RETURNABLE';
      windowDays: number | null;
      reasonFa: string;
    }[] = [];
    for (const [key, value] of form.entries()) {
      if (!key.startsWith('rule-')) continue;
      const categoryId = key.slice('rule-'.length);
      const rule = String(value);
      if (rule === 'STANDARD') continue;
      if (rule !== 'SEALED_ONLY' && rule !== 'NOT_RETURNABLE') throw validation('قاعده مرجوعی معتبر نیست.');
      exceptions.push({
        categoryId,
        rule,
        windowDays: null,
        reasonFa: text(form, 'reason-' + categoryId),
      });
    }
    const published = await publishReturnPolicy(db(), guard.actor, {
      version: text(form, 'version'),
      windowDays: count(form, 'windowDays'),
      bodyFa: text(form, 'body'),
      exceptions,
    });
    revalidatePath('/market/returns');
    return { ok: true, message: 'نسخه ' + published.version + ' سیاست مرجوعی منتشر شد.' };
  } catch (error) {
    return failure(error);
  }
}
