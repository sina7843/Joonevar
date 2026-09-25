'use client';

import { useActionState } from 'react';
import { Button } from '../../../src/ui/button.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../../../src/ui/field.tsx';
import {
  APPLICABLE_KINDS,
  IBAN_NOTE_FA,
  LICENCE_NOTE_FA,
  SELLER_KIND_FA,
  SELLER_ROLE_FA,
} from '../../../src/commerce/seller-model.ts';
import {
  acceptAgreementAction,
  addSellerDocumentAction,
  buyPlanAction,
  changeMemberAction,
  inviteMemberAction,
  saveSellerAction,
  startSellerAction,
  submitSellerAction,
  type SellerFormState,
} from './actions.ts';

const EMPTY: SellerFormState = {};

function Result({ state, testId }: { state: SellerFormState; testId: string }) {
  if (!state.message) return null;
  return (
    <div data-testid={testId}>
      <Alert tone={state.ok ? 'success' : 'error'} title={state.message} />
    </div>
  );
}

/** Start an application. Only the two kinds the product decision names. */
export function StartSellerForm() {
  const [state, submit, pending] = useActionState(startSellerAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="start-seller-form">
      <Result state={state} testId="start-seller-result" />
      <SelectField
        label="نوع کسب‌وکار"
        name="kind"
        required
        defaultValue="PET_SHOP"
        options={APPLICABLE_KINDS.map((value) => ({ value, label: SELLER_KIND_FA[value] }))}
        data-testid="seller-kind"
      />
      <TextField label="نام نمایشی فروشگاه" name="displayName" required data-testid="seller-display-name" />
      <Button type="submit" disabled={pending} data-testid="start-seller-submit">
        {pending ? 'در حال ساخت…' : 'شروع پرونده فروشندگی'}
      </Button>
    </form>
  );
}

export interface SellerFormValues {
  readonly sellerId: string;
  readonly version: number;
  readonly displayNameFa: string;
  readonly legalNameFa: string;
  readonly businessTypeFa: string;
  readonly nationalIdentifier: string;
  readonly representativeNameFa: string;
  readonly representativePhone: string;
  readonly contactEmail: string;
  readonly licenceKindFa: string;
  readonly licenceNumber: string;
  readonly licenceIssuedOn: string;
  readonly licenceExpiresOn: string;
  readonly provinceCode: string;
  readonly cityId: string;
  readonly addressFa: string;
  readonly postalCode: string;
  readonly settlementIban: string;
  readonly settlementHolderNameFa: string;
  readonly shippingPolicyFa: string;
  readonly returnPolicyFa: string;
}

/**
 * The application itself.
 *
 * The licence block says in as many words that Hamzist does not decide which
 * licence the law requires, and the settlement block says a person verifies the
 * account rather than a bank API.
 */
export function SellerApplicationForm({
  values,
  provinces,
  cities,
  disabled,
}: {
  values: SellerFormValues;
  provinces: readonly { value: string; label: string }[];
  cities: readonly { value: string; label: string; provinceCode: string }[];
  disabled: boolean;
}) {
  const [state, submit, pending] = useActionState(saveSellerAction, EMPTY);
  return (
    <form action={submit} className="space-y-md" data-testid="seller-application-form">
      <input type="hidden" name="sellerId" value={values.sellerId} />
      <input type="hidden" name="version" value={values.version} />
      <Result state={state} testId="seller-save-result" />

      <TextField label="نام نمایشی فروشگاه" name="displayName" defaultValue={values.displayNameFa} required disabled={disabled} data-testid="field-display-name" />
      <TextField label="نام رسمی کسب‌وکار" name="legalName" defaultValue={values.legalNameFa} required disabled={disabled} data-testid="field-legal-name" />
      <TextField label="نوع کسب‌وکار" name="businessType" defaultValue={values.businessTypeFa} required disabled={disabled} data-testid="field-business-type" />
      <TextField
        label="شناسه ملی کسب‌وکار یا کد ملی صاحب کسب‌وکار"
        name="nationalIdentifier"
        defaultValue={values.nationalIdentifier}
        required
        ltr
        disabled={disabled}
        data-testid="field-identifier"
      />
      <TextField label="نام نماینده" name="representativeName" defaultValue={values.representativeNameFa} required disabled={disabled} data-testid="field-rep-name" />
      <TextField label="شماره تماس نماینده" name="representativePhone" defaultValue={values.representativePhone} required ltr disabled={disabled} data-testid="field-rep-phone" />
      <TextField label="ایمیل تماس" name="contactEmail" defaultValue={values.contactEmail} ltr disabled={disabled} data-testid="field-email" />

      <p className="text-caption text-text-secondary" data-testid="licence-note">
        {LICENCE_NOTE_FA}
      </p>
      <TextField label="عنوان مجوز" name="licenceKind" defaultValue={values.licenceKindFa} disabled={disabled} data-testid="field-licence-kind" />
      <TextField label="شماره مجوز" name="licenceNumber" defaultValue={values.licenceNumber} ltr disabled={disabled} data-testid="field-licence-number" />
      <TextField label="تاریخ صدور مجوز" name="licenceIssuedOn" defaultValue={values.licenceIssuedOn} disabled={disabled} data-testid="field-licence-issued" />
      <TextField label="تاریخ انقضای مجوز" name="licenceExpiresOn" defaultValue={values.licenceExpiresOn} disabled={disabled} data-testid="field-licence-expires" />

      <SelectField
        label="استان"
        name="provinceCode"
        required
        defaultValue={values.provinceCode}
        options={provinces}
        disabled={disabled}
        data-testid="field-province"
      />
      <SelectField
        label="شهر"
        name="cityId"
        required
        defaultValue={values.cityId}
        options={cities.map(({ value, label }) => ({ value, label }))}
        disabled={disabled}
        data-testid="field-city"
      />
      <TextAreaField label="نشانی فروشگاه" name="address" rows={2} defaultValue={values.addressFa} required disabled={disabled} data-testid="field-address" />
      <TextField label="کد پستی" name="postalCode" defaultValue={values.postalCode} ltr disabled={disabled} data-testid="field-postal" />

      <p className="text-caption text-text-secondary" data-testid="iban-note">
        {IBAN_NOTE_FA}
      </p>
      <TextField label="شماره شبای تسویه" name="iban" defaultValue={values.settlementIban} required ltr disabled={disabled} data-testid="field-iban" />
      <TextField label="نام صاحب حساب" name="ibanHolder" defaultValue={values.settlementHolderNameFa} required disabled={disabled} data-testid="field-iban-holder" />

      <TextAreaField label="قوانین ارسال فروشگاه" name="shippingPolicy" rows={3} defaultValue={values.shippingPolicyFa} required disabled={disabled} data-testid="field-shipping" />
      <TextAreaField label="قوانین مرجوعی فروشگاه" name="returnPolicy" rows={3} defaultValue={values.returnPolicyFa} required disabled={disabled} data-testid="field-return" />

      <Button type="submit" disabled={pending || disabled} data-testid="save-seller">
        {pending ? 'در حال ذخیره…' : 'ذخیره اطلاعات فروشگاه'}
      </Button>
    </form>
  );
}

export function AcceptAgreementForm({ sellerId, accepted }: { sellerId: string; accepted: string | null }) {
  const [state, submit, pending] = useActionState(acceptAgreementAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="agreement-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="agreement-result" />
      <p className="text-body-sm" data-testid="agreement-state">
        {accepted === null ? 'قرارداد فروشندگی هنوز پذیرفته نشده است.' : 'نسخه پذیرفته‌شده: ' + accepted}
      </p>
      <Button type="submit" tone="secondary" disabled={pending} data-testid="accept-agreement">
        {pending ? 'در حال ثبت…' : 'پذیرش قرارداد فروشندگی'}
      </Button>
    </form>
  );
}

export function SellerDocumentForm({ sellerId }: { sellerId: string }) {
  const [state, submit, pending] = useActionState(addSellerDocumentAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="seller-document-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="seller-document-result" />
      <SelectField
        label="نوع مدرک"
        name="kind"
        required
        defaultValue="BUSINESS_LICENCE"
        options={[
          { value: 'BUSINESS_LICENCE', label: 'مجوز کسب‌وکار' },
          { value: 'REPRESENTATIVE_ID', label: 'مدرک هویتی نماینده' },
          { value: 'BANK_PROOF', label: 'مدرک مالکیت حساب' },
          { value: 'OTHER', label: 'مدرک دیگر' },
        ]}
        data-testid="document-kind"
      />
      <FileField
        label="فایل مدرک"
        name="document"
        accept="image/jpeg,image/png,application/pdf"
        maxBytes={10 * 1024 * 1024}
        testId="document-file"
      />
      <TextField label="توضیح" name="note" data-testid="document-note" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="add-document">
        {pending ? 'در حال بارگذاری…' : 'افزودن مدرک'}
      </Button>
    </form>
  );
}

export function SubmitSellerForm({ sellerId, version }: { sellerId: string; version: number }) {
  const [state, submit, pending] = useActionState(submitSellerAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="submit-seller-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="version" value={version} />
      <Result state={state} testId="submit-seller-result" />
      <Button type="submit" disabled={pending} data-testid="submit-seller">
        {pending ? 'در حال ارسال…' : 'ارسال برای بررسی'}
      </Button>
    </form>
  );
}

export function InviteMemberForm({ sellerId }: { sellerId: string }) {
  const [state, submit, pending] = useActionState(inviteMemberAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="invite-member-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="invite-member-result" />
      <TextField label="شماره موبایل همکار" name="mobile" required ltr data-testid="member-mobile" />
      <SelectField
        label="نقش در این فروشگاه"
        name="role"
        required
        defaultValue="STAFF"
        options={[
          { value: 'ADMIN', label: SELLER_ROLE_FA.ADMIN },
          { value: 'STAFF', label: SELLER_ROLE_FA.STAFF },
        ]}
        data-testid="member-role"
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="invite-member">
        {pending ? 'در حال افزودن…' : 'افزودن همکار'}
      </Button>
    </form>
  );
}

export function MemberRowForm({ sellerId, memberId }: { sellerId: string; memberId: string }) {
  const [state, submit, pending] = useActionState(changeMemberAction, EMPTY);
  return (
    <form action={submit} className="flex flex-wrap items-end gap-sm" data-testid={'member-form-' + memberId}>
      <input type="hidden" name="sellerId" value={sellerId} />
      <input type="hidden" name="memberId" value={memberId} />
      <Result state={state} testId={'member-result-' + memberId} />
      <SelectField
        label="نقش"
        name="role"
        options={[
          { value: 'ADMIN', label: SELLER_ROLE_FA.ADMIN },
          { value: 'STAFF', label: SELLER_ROLE_FA.STAFF },
        ]}
        data-testid={'member-role-' + memberId}
      />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'member-save-' + memberId}>
        ذخیره نقش
      </Button>
      <Button type="submit" name="remove" value="YES" tone="secondary" disabled={pending} data-testid={'member-remove-' + memberId}>
        حذف از فروشگاه
      </Button>
    </form>
  );
}

/** Buy a plan period. The amount is read on the server from the plan's setting. */
export function BuyPlanForm({
  sellerId,
  plans,
}: {
  sellerId: string;
  plans: readonly { id: string; labelFa: string; priceFa: string; configured: boolean }[];
}) {
  const [state, submit, pending] = useActionState(buyPlanAction, EMPTY);
  return (
    <form action={submit} className="space-y-sm" data-testid="buy-plan-form">
      <input type="hidden" name="sellerId" value={sellerId} />
      <Result state={state} testId="buy-plan-result" />
      <SelectField
        label="پلن فروشندگی"
        name="planId"
        required
        options={plans.map((plan) => ({
          value: plan.id,
          label: plan.labelFa + ' — ' + (plan.configured ? plan.priceFa + ' تومان' : 'تعرفه تعیین‌نشده'),
        }))}
        data-testid="plan-select"
      />
      <Button type="submit" disabled={pending} data-testid="buy-plan">
        {pending ? 'در حال ادامه…' : 'خرید یا تمدید پلن'}
      </Button>
    </form>
  );
}
