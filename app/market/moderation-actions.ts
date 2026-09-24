'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { AppError } from '../../src/domain/errors.ts';
import {
  decideAppeal,
  decideListingReports,
  submitAppeal,
  submitMarketReport,
} from '../../src/marketplace/listing-moderation.ts';
import { startPromotionPurchase } from '../../src/marketplace/promotions.ts';

export interface MarketModerationState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

/**
 * Report an advert, a picture of it, or its seller — PROMPT-004.
 *
 * Guarded on the report route rather than on the marketplace: reading an advert
 * needs no account, reporting one does.
 */
export async function submitMarketReportAction(
  _previous: MarketModerationState,
  form: FormData,
): Promise<MarketModerationState> {
  try {
    const listingId = text(form, 'listingId');
    const guard = await guardRoute('/report/listing/' + listingId);
    if (!guard.ok) throw guard.denied;
    await submitMarketReport(db(), guard.actor, {
      target: text(form, 'target'),
      listingId,
      mediaId: text(form, 'mediaId') || null,
      reason: text(form, 'reason'),
      details: text(form, 'details') || null,
    });
    return { ok: true, message: 'گزارش شما ثبت شد و بررسی می‌شود. نام شما به فروشنده گفته نمی‌شود.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

/** One decision closes every open report about the same advert. */
export async function decideListingReportsAction(
  _previous: MarketModerationState,
  form: FormData,
): Promise<MarketModerationState> {
  try {
    const guard = await guardRoute('/market/listings');
    if (!guard.ok) throw guard.denied;
    const result = await decideListingReports(db(), guard.actor, {
      listingId: text(form, 'listingId'),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reason'),
      expectedListingVersion: Number(form.get('listingVersion')),
    });
    revalidatePath('/market/listings');
    return {
      ok: true,
      message: 'تصمیم ثبت شد و ' + result.closed.toLocaleString('fa-IR') + ' گزارش بسته شد.',
    };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

/** The seller's objection. Nothing about the original decision is rewritten. */
export async function submitAppealAction(
  _previous: MarketModerationState,
  form: FormData,
): Promise<MarketModerationState> {
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    await submitAppeal(db(), guard.actor, {
      reportId: text(form, 'reportId'),
      statementFa: text(form, 'statement'),
    });
    revalidatePath('/account/listings');
    return { ok: true, message: 'اعتراض شما ثبت شد و بررسی می‌شود.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function decideAppealAction(
  _previous: MarketModerationState,
  form: FormData,
): Promise<MarketModerationState> {
  try {
    const guard = await guardRoute('/market/listings');
    if (!guard.ok) throw guard.denied;
    await decideAppeal(db(), guard.actor, {
      appealId: text(form, 'appealId'),
      uphold: text(form, 'outcome') !== 'OVERTURN',
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/listings');
    return { ok: true, message: 'پاسخ اعتراض ثبت شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * Buy a promotion for one's own advert.
 *
 * The action only opens the payment. The promotion becomes live inside the
 * transaction that verifies it, never here.
 */
export async function startPromotionAction(
  _previous: MarketModerationState,
  form: FormData,
): Promise<MarketModerationState> {
  try {
    const guard = await guardRoute('/account/listings');
    if (!guard.ok) throw guard.denied;
    const listingId = text(form, 'listingId');
    await startPromotionPurchase(db(), guard.actor, {
      listingId,
      packageId: text(form, 'packageId'),
    });
    revalidatePath('/account/listings/' + listingId);
    return { ok: true, message: 'بسته تبلیغ ثبت شد؛ از صفحه پرداخت‌ها آن را پرداخت کنید.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
