'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AppError, validation } from '../../../src/domain/errors.ts';
import { leaveReview, moderateReview, replyToReview } from '../../../src/commerce/reviews.ts';
import { answerQuestion, askQuestion, decideQuestion } from '../../../src/commerce/questions.ts';
import { follow, saveItem, setPreferences, unfollow, unsaveItem } from '../../../src/commerce/saved.ts';
import { createDiscountRule, moveDiscountRule, publishStackingPolicy } from '../../../src/commerce/discounts.ts';
import { adjustPoints } from '../../../src/commerce/loyalty.ts';
import { DISCOUNT_KINDS, type DiscountKind } from '../../../src/commerce/trust-model.ts';

export interface TrustFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

function count(form: FormData, key: string): number {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^-?[0-9]+$/.test(raw)) throw validation('عدد را با رقم انگلیسی بنویسید.');
  return Number(raw);
}

function optionalMoney(form: FormData, key: string): bigint | null {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (raw === '') return null;
  if (!/^[0-9]+$/.test(raw)) throw validation('مبلغ را با رقم انگلیسی بنویسید.');
  return BigInt(raw);
}

function optionalCount(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (raw === '') return null;
  if (!/^[0-9]+$/.test(raw)) throw validation('عدد را با رقم انگلیسی بنویسید.');
  return Number(raw);
}

function optionalDate(form: FormData, key: string): Date | null {
  const raw = text(form, key);
  if (raw === '') return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw validation('تاریخ معتبر نیست.');
  return parsed;
}

const failure = (error: unknown): TrustFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

// ── reviews ────────────────────────────────────────────────────────────────

export async function leaveReviewAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/reviews');
    if (!guard.ok) throw guard.denied;
    await leaveReview(db(), guard.actor, {
      subOrderId: text(form, 'subOrderId') || undefined,
      inquiryId: text(form, 'inquiryId') || undefined,
      productId: text(form, 'productId') || null,
      scoreOne: count(form, 'scoreOne'),
      scoreTwo: count(form, 'scoreTwo'),
      scoreThree: count(form, 'scoreThree'),
      bodyFa: text(form, 'body') || null,
    });
    revalidatePath('/account/reviews');
    revalidatePath('/shop');
    return { ok: true, message: 'نظر شما ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function replyToReviewAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/seller/reviews');
    if (!guard.ok) throw guard.denied;
    await replyToReview(db(), guard.actor, {
      reviewId: text(form, 'reviewId'),
      replyFa: text(form, 'reply'),
    });
    revalidatePath('/account/seller/reviews');
    return { ok: true, message: 'پاسخ شما ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function moderateReviewAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/market/trust');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'PUBLISHED' && to !== 'HIDDEN' && to !== 'REMOVED') throw validation('تصمیم معتبر نیست.');
    await moderateReview(db(), guard.actor, {
      reviewId: text(form, 'reviewId'),
      to,
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/trust');
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── questions ──────────────────────────────────────────────────────────────

export async function askQuestionAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/saved');
    if (!guard.ok) throw guard.denied;
    await askQuestion(db(), guard.actor, {
      productId: text(form, 'productId') || null,
      sellerId: text(form, 'sellerId') || null,
      bodyFa: text(form, 'body'),
    });
    revalidatePath('/shop');
    return { ok: true, message: 'پرسش شما ثبت شد و پس از بررسی نمایش داده می‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideQuestionAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/market/trust');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'PUBLISHED' && to !== 'REJECTED') throw validation('تصمیم معتبر نیست.');
    await decideQuestion(db(), guard.actor, {
      questionId: text(form, 'questionId'),
      to,
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/trust');
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function answerQuestionAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/seller/reviews');
    if (!guard.ok) throw guard.denied;
    await answerQuestion(db(), guard.actor, {
      questionId: text(form, 'questionId'),
      answerFa: text(form, 'answer'),
    });
    revalidatePath('/account/seller/reviews');
    revalidatePath('/shop');
    return { ok: true, message: 'پاسخ شما ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── keeping and following ──────────────────────────────────────────────────

export async function toggleSavedAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/saved');
    if (!guard.ok) throw guard.denied;
    const productId = text(form, 'productId') || null;
    const listingId = text(form, 'listingId') || null;
    if (text(form, 'remove') === 'yes') {
      await unsaveItem(db(), guard.actor, { productId, listingId });
      revalidatePath('/account/saved');
      return { ok: true, message: 'از فهرست برداشته شد.' };
    }
    await saveItem(db(), guard.actor, { productId, listingId });
    revalidatePath('/account/saved');
    return { ok: true, message: 'به فهرست شما اضافه شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function toggleFollowAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/saved');
    if (!guard.ok) throw guard.denied;
    const sellerId = text(form, 'sellerId') || null;
    const kennelId = text(form, 'kennelId') || null;
    if (text(form, 'remove') === 'yes') {
      await unfollow(db(), guard.actor, { sellerId, kennelId });
      revalidatePath('/account/saved');
      return { ok: true, message: 'دنبال کردن متوقف شد.' };
    }
    await follow(db(), guard.actor, { sellerId, kennelId });
    revalidatePath('/account/saved');
    return { ok: true, message: 'دنبال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setPreferencesAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/account/saved');
    if (!guard.ok) throw guard.denied;
    await setPreferences(db(), guard.actor, {
      recommendationsOff: form.get('recommendationsOff') === 'on',
      historyOff: form.get('historyOff') === 'on',
      priceAlertsOff: form.get('priceAlertsOff') === 'on',
    });
    revalidatePath('/account/saved');
    return { ok: true, message: 'تنظیمات شما ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── discounts and points ───────────────────────────────────────────────────

export async function createDiscountAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const seller = text(form, 'sellerId') || null;
    const guard = await guardRoute(seller ? '/account/seller/promotions' : '/market/promotions');
    if (!guard.ok) throw guard.denied;
    const kind = text(form, 'kind') as DiscountKind;
    if (!DISCOUNT_KINDS.includes(kind)) throw validation('نوع تخفیف معتبر نیست.');
    await createDiscountRule(db(), guard.actor, {
      kind,
      labelFa: text(form, 'label'),
      code: text(form, 'code') || null,
      sellerId: seller,
      categoryId: text(form, 'categoryId') || null,
      productId: text(form, 'productId') || null,
      percentBp: text(form, 'percentBp') === '' ? null : count(form, 'percentBp'),
      amountToman: optionalMoney(form, 'amount'),
      maxDiscountToman: optionalMoney(form, 'maxDiscount'),
      minBasketToman: optionalMoney(form, 'minBasket'),
      startsAt: optionalDate(form, 'startsAt'),
      endsAt: optionalDate(form, 'endsAt'),
      totalUses: optionalCount(form, 'totalUses'),
      usesPerAccount: optionalCount(form, 'usesPerAccount'),
      priority: text(form, 'priority') === '' ? 100 : count(form, 'priority'),
      noteFa: text(form, 'note') || null,
    });
    revalidatePath('/account/seller/promotions');
    revalidatePath('/market/promotions');
    return { ok: true, message: 'تخفیف ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function moveDiscountAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const seller = text(form, 'sellerId') || null;
    const guard = await guardRoute(seller ? '/account/seller/promotions' : '/market/promotions');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'ACTIVE' && to !== 'PAUSED' && to !== 'ENDED') throw validation('وضعیت معتبر نیست.');
    await moveDiscountRule(db(), guard.actor, { ruleId: text(form, 'ruleId'), to });
    revalidatePath('/account/seller/promotions');
    revalidatePath('/market/promotions');
    return { ok: true, message: 'وضعیت تخفیف ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function publishStackingAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/market/promotions');
    if (!guard.ok) throw guard.denied;
    const combinable: [DiscountKind, DiscountKind][] = [];
    for (const pair of form.getAll('combinable').map(String)) {
      const [left, right] = pair.split('+') as [DiscountKind, DiscountKind];
      if (DISCOUNT_KINDS.includes(left) && DISCOUNT_KINDS.includes(right)) combinable.push([left, right]);
    }
    await publishStackingPolicy(db(), guard.actor, {
      version: text(form, 'version'),
      bodyFa: text(form, 'body'),
      combinable,
      order: [...DISCOUNT_KINDS],
    });
    revalidatePath('/market/promotions');
    return { ok: true, message: 'سیاست هم‌زمانی تخفیف‌ها منتشر شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function adjustPointsAction(_p: TrustFormState, form: FormData): Promise<TrustFormState> {
  try {
    const guard = await guardRoute('/market/promotions');
    if (!guard.ok) throw guard.denied;
    await adjustPoints(db(), guard.actor, {
      accountId: text(form, 'accountId'),
      points: count(form, 'points'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/promotions');
    return { ok: true, message: 'امتیاز اصلاح شد.' };
  } catch (error) {
    return failure(error);
  }
}
