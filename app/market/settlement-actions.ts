'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { env } from '../../src/config/env.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { AppError, validation } from '../../src/domain/errors.ts';
import { currentPaymentGateway, currentPaymentProvider } from '../../src/adapters/current.ts';
import { executeRefund, recordManualRefund } from '../../src/marketplace/refunds.ts';
import { addDisputeEvidence, decideDispute } from '../../src/marketplace/disputes.ts';
import { publishCommissionRule } from '../../src/marketplace/commission-rules.ts';
import { publishPlan } from '../../src/commerce/plans.ts';
import { decideProduct, mergeProduct } from '../../src/commerce/catalog.ts';
import { recordHandoverByAdmin, releaseHandoverHold } from '../../src/marketplace/handover.ts';
import {
  changeSellerStanding,
  decideSellerApplication,
  verifySettlementAccount,
} from '../../src/commerce/sellers.ts';
import { REFUND_STATUS_FA } from '../../src/marketplace/cancellation-model.ts';

export interface SettlementState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

function money(form: FormData, key: string): bigint {
  const raw = text(form, key).replace(/[\s,،]/g, '');
  if (!/^[0-9]+$/.test(raw)) throw validation('مبلغ را با رقم انگلیسی و بدون جداکننده بنویسید.');
  return BigInt(raw);
}

const failure = (error: unknown): SettlementState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

/**
 * Try one refund at the gateway.
 *
 * The action reports exactly what the provider said, including that it cannot
 * refund from here at all. It never turns a failure into a success message.
 */
export async function executeRefundAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/refunds');
    if (!guard.ok) throw guard.denied;
    const { refund } = await executeRefund(
      db(),
      guard.actor,
      text(form, 'refundId'),
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    revalidatePath('/market/refunds');
    return {
      ok: refund.status === 'PAID',
      message:
        'وضعیت استرداد: ' +
        (REFUND_STATUS_FA[refund.status] ?? refund.status) +
        (refund.lastErrorFa ? ' — ' + refund.lastErrorFa : ''),
    };
  } catch (error) {
    return failure(error);
  }
}

/** Record money an operator sent outside the gateway, with its bank reference. */
export async function recordManualRefundAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/refunds');
    if (!guard.ok) throw guard.denied;
    await recordManualRefund(db(), guard.actor, {
      refundId: text(form, 'refundId'),
      bankReference: text(form, 'bankReference'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/market/refunds');
    return { ok: true, message: 'استرداد دستی با شماره پیگیری ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideDisputeAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/disputes');
    if (!guard.ok) throw guard.denied;
    const amount = text(form, 'refundToman');
    await decideDispute(db(), guard.actor, {
      disputeId: text(form, 'disputeId'),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reason'),
      refundToman: amount === '' ? null : money(form, 'refundToman'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/market/disputes');
    return { ok: true, message: 'رأی ثبت شد و اثر آن روی بیعانه و آگهی اعمال شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** A reviewer's own note or document on a case they are deciding. */
export async function reviewerEvidenceAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/disputes');
    if (!guard.ok) throw guard.denied;
    const upload = form.get('evidence');
    const file = upload instanceof File && upload.size > 0 ? upload : null;
    await addDisputeEvidence(db(), env().PRIVATE_STORAGE_DIR, guard.actor, {
      disputeId: text(form, 'disputeId'),
      noteFa: text(form, 'note') || null,
      file: file ? { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name } : null,
    });
    revalidatePath('/market/disputes');
    return { ok: true, message: 'یادداشت بررسی ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Publish a commission formula.
 *
 * Every figure comes from this form and nothing is defaulted: a percentage left
 * empty is a refusal, not a zero.
 */
export async function publishCommissionRuleAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/commission');
    if (!guard.ok) throw guard.denied;
    const sellerKind = text(form, 'sellerKind');
    const min = text(form, 'minToman');
    const max = text(form, 'maxToman');
    await publishCommissionRule(db(), guard.actor, {
      speciesCode: text(form, 'speciesCode'),
      sellerKind: sellerKind === '' ? null : (sellerKind as 'OWNER' | 'KENNEL'),
      fixedToman: money(form, 'fixedToman'),
      percentBp: Number(text(form, 'percentBp')),
      minToman: min === '' ? null : money(form, 'minToman'),
      maxToman: max === '' ? null : money(form, 'maxToman'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/market/commission');
    return { ok: true, message: 'نسخه تازه قاعده کارمزد منتشر شد و نسخه قبلی بایگانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── handover recovery (PROMPT-007) ────────────────────────────────────────

/**
 * Record a handover that really happened but could not be completed in the
 * product. It skips the one-time code and nothing else: every condition is
 * checked again, the reason is required, and the transfer names the
 * administrator who recorded it.
 */
export async function recordHandoverAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/handovers');
    if (!guard.ok) throw guard.denied;
    await recordHandoverByAdmin(db(), guard.actor, {
      inquiryId: text(form, 'inquiryId'),
      reasonFa: text(form, 'reason'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/market/handovers');
    return { ok: true, message: 'تحویل با ثبت دستی کامل شد و مالکیت منتقل شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function releaseHoldAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/handovers');
    if (!guard.ok) throw guard.denied;
    await releaseHandoverHold(db(), guard.actor, {
      inquiryId: text(form, 'inquiryId'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/handovers');
    return { ok: true, message: 'توقف تحویل برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── seller applications (PROMPT-008) ──────────────────────────────────────

export async function decideSellerAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/sellers');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'UNDER_REVIEW' && to !== 'NEEDS_CORRECTION' && to !== 'APPROVED' && to !== 'REJECTED') {
      throw validation('این تصمیم معتبر نیست.');
    }
    await decideSellerApplication(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      to,
      reasonFa: text(form, 'reason') || null,
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/market/sellers');
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/** Confirm the settlement account from the proof, with the reviewer's name on it. */
export async function verifyIbanAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/sellers');
    if (!guard.ok) throw guard.denied;
    await verifySettlementAccount(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/market/sellers');
    return { ok: true, message: 'مالکیت حساب تسویه تأیید و ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeSellerStandingAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/sellers');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'SUSPENDED' && to !== 'ACTIVE' && to !== 'TERMINATED') throw validation('این تغییر مجاز نیست.');
    await changeSellerStanding(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      to,
      reasonFa: text(form, 'reason'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/market/sellers');
    return { ok: true, message: 'وضعیت فروشگاه تغییر کرد. محصولات، سفارش‌ها و تاریخچه حذف نمی‌شوند.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Publish a seller plan version — PROMPT-008.
 *
 * Every figure comes from this form. The price does not: it lives in the
 * managed settings key the plan names, so publishing a plan never invents a
 * tariff and an unset one keeps the plan unbuyable.
 */
export async function publishPlanAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/plans');
    if (!guard.ok) throw guard.denied;
    const limit = text(form, 'productLimit');
    const promotions = text(form, 'maxActivePromotions');
    await publishPlan(db(), guard.actor, {
      code: text(form, 'code'),
      labelFa: text(form, 'label'),
      durationDays: Number(text(form, 'durationDays')),
      productLimit: limit === '' ? null : Number(limit),
      commissionPercentBp: Number(text(form, 'commissionPercentBp')),
      capabilities: {
        canPromote: text(form, 'canPromote') === 'YES',
        ...(promotions === '' ? {} : { maxActivePromotions: Number(promotions) }),
      },
      priceSettingKey: text(form, 'priceSettingKey'),
      noteFa: text(form, 'note'),
    });
    revalidatePath('/market/plans');
    return { ok: true, message: 'نسخه تازه پلن منتشر شد و نسخه قبلی بایگانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── the catalogue (PROMPT-009) ────────────────────────────────────────────

export async function decideProductAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/catalog');
    if (!guard.ok) throw guard.denied;
    const to = text(form, 'to');
    if (to !== 'PUBLISHED' && to !== 'REJECTED' && to !== 'DRAFT') throw validation('این تصمیم معتبر نیست.');
    await decideProduct(db(), guard.actor, {
      productId: text(form, 'productId'),
      to,
      reasonFa: text(form, 'reason') || null,
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/market/catalog');
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Fold a duplicate into a shared base.
 *
 * The duplicate keeps its address and its orders; its offers move to the base
 * so nobody's stock is stranded on a row that is no longer shown.
 */
export async function mergeProductAction(
  _previous: SettlementState,
  form: FormData,
): Promise<SettlementState> {
  try {
    const guard = await guardRoute('/market/catalog');
    if (!guard.ok) throw guard.denied;
    await mergeProduct(db(), guard.actor, {
      productId: text(form, 'productId'),
      intoProductId: text(form, 'intoProductId'),
      reasonFa: text(form, 'reason'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/market/catalog');
    return { ok: true, message: 'کالا در کالای پایه ادغام شد؛ نشانی قبلی همچنان کار می‌کند.' };
  } catch (error) {
    return failure(error);
  }
}
