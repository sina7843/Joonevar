'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { AppError, staleOf } from '../../src/domain/errors.ts';
import {
  decideAppeal,
  decideListingReports,
  decideMessageReport,
  submitAppeal,
  submitMarketReport,
} from '../../src/marketplace/listing-moderation.ts';
import { startPromotionPurchase } from '../../src/marketplace/promotions.ts';
import type { BulkResultState } from '../../src/ui/bulk-action-bar.tsx';

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
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
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
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
    throw error;
  }
}

/**
 * «پنهان‌کردن آگهی‌ها» (K14 bulk, DEC-0235): the single «توقف آگهی توسط
 * ناظر» decision run once per selected advert with one shared reason, each
 * against the version the moderator saw. Nothing is decided as a group: every
 * advert succeeds or fails on its own and is reported on its own line.
 */
export async function bulkHideListingsAction(_previous: BulkResultState, form: FormData): Promise<BulkResultState> {
  const guard = await guardRoute('/market/listings');
  if (!guard.ok) return { tone: 'error', message: guard.denied.message };
  if (text(form, 'bulkAction') !== 'hide') return { tone: 'error', message: 'کنش گروهی معتبر نیست.' };
  const reasonFa = text(form, 'reason');
  if (reasonFa === '') return { tone: 'error', message: 'دلیل پنهان‌کردن را بنویسید؛ برای فروشنده و در تاریخچه ثبت می‌شود.' };
  const ids = [...new Set(form.getAll('ids').map(String))].slice(0, 100);
  if (ids.length === 0) return { tone: 'error', message: 'هیچ آگهی‌ای انتخاب نشده است.' };

  const results: { id: string; label: string; ok: boolean; message?: string }[] = [];
  for (const listingId of ids) {
    const label = text(form, 'title-' + listingId) || listingId;
    try {
      const result = await decideListingReports(db(), guard.actor, {
        listingId,
        decision: 'HIDE',
        reasonFa,
        expectedListingVersion: Number(form.get('version-' + listingId)),
      });
      results.push({ id: listingId, label: label + ' — پنهان شد، ' + result.closed.toLocaleString('fa-IR') + ' گزارش بسته شد', ok: true });
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      results.push({ id: listingId, label, ok: false, message: error.message });
    }
  }
  revalidatePath('/market/listings');
  const done = results.filter((result) => result.ok).length;
  const fa = (value: number) => value.toLocaleString('fa-IR');
  return {
    tone: done === results.length ? 'success' : done === 0 ? 'error' : 'warning',
    message: fa(done) + ' آگهی از ' + fa(results.length) + ' پنهان شد.',
    results,
  };
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
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
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
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
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
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
    throw error;
  }
}

/**
 * Decide one chat report — PROMPT-005.
 *
 * Hiding stops the message being rendered to either party and says why. It
 * never deletes it: a deposit dispute is argued from the transcript, and
 * evidence that disappears when somebody objects to it is not evidence.
 */
export async function decideMessageReportAction(
  _previous: MarketModerationState,
  form: FormData,
): Promise<MarketModerationState> {
  try {
    const guard = await guardRoute('/market/messages');
    if (!guard.ok) throw guard.denied;
    const result = await decideMessageReport(db(), guard.actor, {
      reportId: text(form, 'reportId'),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reason'),
    });
    revalidatePath('/market/messages');
    return {
      ok: true,
      message: result.hidden ? 'پیام پنهان شد و گزارش بسته شد.' : 'گزارش بدون اقدام بسته شد.',
    };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
    throw error;
  }
}
