'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../../../src/adapters/current.ts';
import { startAttempt } from '../../../src/billing/payments.ts';
import { cancelUnpaidOrder } from '../../../src/commerce/cart.ts';
import { moveSubOrder, startOrderPayment } from '../../../src/commerce/orders.ts';
import type { SubOrderStatus } from '../../../src/commerce/order-model.ts';

export interface OrderFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

const failure = (error: unknown): OrderFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

/** Try the payment again while the goods are still being held. */
export async function retryOrderPaymentAction(_previous: OrderFormState, form: FormData): Promise<OrderFormState> {
  const orderId = text(form, 'orderId');
  let destination: string;
  try {
    const guard = await guardRoute('/account/orders');
    if (!guard.ok) throw guard.denied;
    const batch = await startOrderPayment(db(), guard.actor, orderId);
    const started = await startAttempt(
      db(),
      guard.actor,
      { batchId: batch.id, callbackUrl: '/account/orders/' + orderId + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function cancelOrderAction(_previous: OrderFormState, form: FormData): Promise<OrderFormState> {
  try {
    const guard = await guardRoute('/account/orders');
    if (!guard.ok) throw guard.denied;
    await cancelUnpaidOrder(db(), guard.actor, text(form, 'orderId'), text(form, 'reason') || 'لغو توسط خریدار');
    revalidatePath('/account/orders');
    return { ok: true, message: 'سفارش لغو شد و کالاها به فروشگاه برگشتند.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * One move of one sub-order, from whichever side is making it.
 *
 * Buyer, seller and operator each enter through their own address, so the
 * route being guarded is never something a form can choose. What any of them
 * may do from the status the sub-order is actually in is decided in the
 * domain, against the record itself.
 */
async function move(guardPath: string, form: FormData): Promise<OrderFormState> {
  try {
    const guard = await guardRoute(guardPath);
    if (!guard.ok) throw guard.denied;
    const moved = await moveSubOrder(db(), guard.actor, {
      subOrderId: text(form, 'subOrderId'),
      to: text(form, 'to') as SubOrderStatus,
      reasonFa: text(form, 'reason') || null,
      trackingCode: text(form, 'tracking') || null,
    });
    revalidatePath('/account/orders');
    revalidatePath('/account/seller/orders');
    revalidatePath('/market/orders');
    return { ok: true, message: 'وضعیت زیرسفارش ' + moved.reference + ' ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export const moveAsBuyerAction = async (_p: OrderFormState, form: FormData): Promise<OrderFormState> =>
  move('/account/orders', form);

export const moveAsSellerAction = async (_p: OrderFormState, form: FormData): Promise<OrderFormState> =>
  move('/account/seller/orders', form);

export const moveAsOperatorAction = async (_p: OrderFormState, form: FormData): Promise<OrderFormState> =>
  move('/market/orders', form);
