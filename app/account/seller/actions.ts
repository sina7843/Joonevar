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
  acceptSellerAgreement,
  addSellerDocument,
  changeSellerMember,
  inviteSellerMember,
  saveSellerApplication,
  startSellerApplication,
  submitSellerApplication,
} from '../../../src/commerce/sellers.ts';
import { startPlanPurchase } from '../../../src/commerce/plans.ts';

export interface SellerFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();

const failure = (error: unknown): SellerFormState => {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
};

export async function startSellerAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    await startSellerApplication(db(), guard.actor, {
      kind: text(form, 'kind'),
      displayNameFa: text(form, 'displayName'),
    });
    revalidatePath('/account/seller');
    return { ok: true, message: 'پرونده فروشگاه ساخته شد؛ فرم را کامل کنید.' };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSellerAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    await saveSellerApplication(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      expectedVersion: Number(text(form, 'version')),
      displayNameFa: text(form, 'displayName'),
      legalNameFa: text(form, 'legalName'),
      businessTypeFa: text(form, 'businessType'),
      nationalIdentifier: text(form, 'nationalIdentifier'),
      representativeNameFa: text(form, 'representativeName'),
      representativePhone: text(form, 'representativePhone'),
      contactEmail: text(form, 'contactEmail'),
      licenceKindFa: text(form, 'licenceKind'),
      licenceNumber: text(form, 'licenceNumber'),
      licenceIssuedOn: text(form, 'licenceIssuedOn'),
      licenceExpiresOn: text(form, 'licenceExpiresOn'),
      provinceCode: text(form, 'provinceCode'),
      cityId: text(form, 'cityId'),
      addressFa: text(form, 'address'),
      postalCode: text(form, 'postalCode'),
      settlementIban: text(form, 'iban'),
      settlementHolderNameFa: text(form, 'ibanHolder'),
      shippingPolicyFa: text(form, 'shippingPolicy'),
      returnPolicyFa: text(form, 'returnPolicy'),
    });
    revalidatePath('/account/seller');
    return { ok: true, message: 'اطلاعات فروشگاه ذخیره شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function acceptAgreementAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    const seller = await acceptSellerAgreement(db(), guard.actor, { sellerId: text(form, 'sellerId') });
    revalidatePath('/account/seller');
    return { ok: true, message: 'قرارداد فروشندگی نسخه ' + seller.agreementVersion + ' پذیرفته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function addSellerDocumentAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    const upload = form.get('document');
    if (!(upload instanceof File) || upload.size === 0) throw validation('فایل مدرک را انتخاب کنید.');
    const kind = text(form, 'kind');
    if (kind !== 'BUSINESS_LICENCE' && kind !== 'REPRESENTATIVE_ID' && kind !== 'BANK_PROOF' && kind !== 'OTHER') {
      throw validation('نوع مدرک معتبر نیست.');
    }
    await addSellerDocument(db(), env().PRIVATE_STORAGE_DIR, guard.actor, {
      sellerId: text(form, 'sellerId'),
      kind,
      noteFa: text(form, 'note') || null,
      bytes: new Uint8Array(await upload.arrayBuffer()),
      originalName: upload.name,
    });
    revalidatePath('/account/seller');
    return { ok: true, message: 'مدرک افزوده شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitSellerAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    await submitSellerApplication(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      expectedVersion: Number(text(form, 'version')),
    });
    revalidatePath('/account/seller');
    return { ok: true, message: 'پرونده برای بررسی ارسال شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function inviteMemberAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    const role = text(form, 'role');
    if (role !== 'ADMIN' && role !== 'STAFF') throw validation('نقش انتخاب‌شده معتبر نیست.');
    await inviteSellerMember(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      mobile: text(form, 'mobile'),
      role,
    });
    revalidatePath('/account/seller');
    return { ok: true, message: 'عضو تازه به فروشگاه افزوده شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function changeMemberAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    const role = text(form, 'role');
    await changeSellerMember(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      memberId: text(form, 'memberId'),
      role: role === 'ADMIN' || role === 'STAFF' ? role : undefined,
      remove: text(form, 'remove') === 'YES',
    });
    revalidatePath('/account/seller');
    return { ok: true, message: 'دسترسی این عضو به‌روزرسانی شد.' };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Buy a plan period.
 *
 * A priced plan goes to the gateway; a plan recorded as costing nothing starts
 * at once and says so. Neither path lets anybody mark a store as paid.
 */
export async function buyPlanAction(
  _previous: SellerFormState,
  form: FormData,
): Promise<SellerFormState> {
  let destination: string | null = null;
  try {
    const guard = await guardRoute('/account/seller');
    if (!guard.ok) throw guard.denied;
    const { batch } = await startPlanPurchase(db(), guard.actor, {
      sellerId: text(form, 'sellerId'),
      planId: text(form, 'planId'),
    });
    if (batch === null) {
      revalidatePath('/account/seller');
      return { ok: true, message: 'این پلن بدون هزینه ثبت شده بود؛ دوره فروشگاه آغاز شد.' };
    }
    const started = await startAttempt(
      db(),
      guard.actor,
      { batchId: batch.id, callbackUrl: '/account/seller/return' },
      await currentPaymentGateway(),
      await currentPaymentProvider(),
    );
    destination = started.redirectUrl;
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

/** Cancelling keeps the subscription draft and its frozen amount (§26). */
export async function cancelPlanPaymentAction(form: FormData): Promise<void> {
  const batchId = String(form.get('batchId') ?? '');
  const guard = await guardRoute('/account/seller');
  if (!guard.ok) throw guard.denied;
  const attempt = await latestAttempt(db(), batchId);
  if (attempt) await cancelAttempt(db(), { reference: attempt.reference });
  redirect('/account/seller');
}
