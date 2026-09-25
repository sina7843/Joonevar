'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AppError, validation } from '../../../../src/domain/errors.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../../../../src/adapters/current.ts';
import { startAttempt } from '../../../../src/billing/payments.ts';
import { placeOrder, setCartLine } from '../../../../src/commerce/cart.ts';
import { startOrderPayment } from '../../../../src/commerce/orders.ts';

export interface CartFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

function count(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^[0-9]+$/.test(raw)) throw validation('تعداد را با رقم انگلیسی بنویسید.');
  return Number(raw);
}

function money(form: FormData, key: string): bigint {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^[0-9]+$/.test(raw)) throw validation('مبلغ تأییدشده خوانده نشد؛ صفحه را دوباره باز کنید.');
  return BigInt(raw);
}

const failure = (error: unknown): CartFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

/** Put something in the basket, or change how many of it. */
export async function setCartLineAction(_previous: CartFormState, form: FormData): Promise<CartFormState> {
  try {
    const guard = await guardRoute('/shop/cart');
    if (!guard.ok) throw guard.denied;
    const quantity = count(form, 'quantity');
    await setCartLine(db(), guard.actor, { skuId: text(form, 'skuId'), quantity });
    revalidatePath('/shop/cart');
    return { ok: true, message: quantity === 0 ? 'این قلم از سبد برداشته شد.' : 'سبد خرید به‌روز شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Place the order and go to the gateway.
 *
 * The confirmed figure travels with the form, but it is not what gets charged:
 * the amount is read from the order row on the server. It is the buyer's
 * statement of what they agreed to, and a mismatch stops the checkout instead
 * of charging either number.
 */
export async function checkoutAction(_previous: CartFormState, form: FormData): Promise<CartFormState> {
  let destination: string;
  try {
    const guard = await guardRoute('/shop/cart');
    if (!guard.ok) throw guard.denied;
    const placed = await placeOrder(db(), guard.actor, {
      delivery: {
        recipientNameFa: text(form, 'recipientName'),
        recipientPhone: text(form, 'recipientPhone'),
        provinceFa: text(form, 'province') || null,
        cityFa: text(form, 'city') || null,
        addressFa: text(form, 'address'),
        postalCode: text(form, 'postalCode') || null,
        noteFa: text(form, 'note') || null,
      },
      confirmedTotalToman: money(form, 'confirmedTotal'),
      chosenMethods: Object.fromEntries(
        [...form.entries()]
          .filter(([key]) => key.startsWith('method-'))
          .map(([key, value]) => [key.slice('method-'.length), String(value)]),
      ),
    });
    const batch = await startOrderPayment(db(), guard.actor, placed.order.id);
    const started = await startAttempt(
      db(),
      guard.actor,
      { batchId: batch.id, callbackUrl: '/account/orders/' + placed.order.id + '/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}
