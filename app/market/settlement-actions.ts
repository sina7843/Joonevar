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
import { recordHandoverByAdmin, releaseHandoverHold } from '../../src/marketplace/handover.ts';
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
