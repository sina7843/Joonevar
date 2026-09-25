import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { AppError } from '../../../src/domain/errors.ts';
import { directoryReferenceData } from '../../../src/vets/directory.ts';
import { myStores, sellerDetail, sellerMembersOf } from '../../../src/commerce/sellers.ts';
import { currentSubscription, publishedPlans } from '../../../src/commerce/plans.ts';
import {
  isSellerEditable,
  roleAllows,
  SELLER_KIND_FA,
  SELLER_ROLE_FA,
  SELLER_STATUS_FA,
  type SellerKind,
  type SellerRole,
  type SellerStatus,
} from '../../../src/commerce/seller-model.ts';
import {
  AcceptAgreementForm,
  BuyPlanForm,
  InviteMemberForm,
  MemberRowForm,
  SellerApplicationForm,
  SellerDocumentForm,
  StartSellerForm,
  SubmitSellerForm,
} from './forms.tsx';

export const dynamic = 'force-dynamic';

const dateFa = (value: Date | null) =>
  value === null ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(value);

/**
 * A seller's own store — PROMPT-008.
 *
 * One page for the whole of a tenant's own side: the application, its
 * documents, the people who work in it, and the plan period that lets it
 * trade. What this account may do here comes from its role inside this one
 * store and from nothing global.
 */
export default async function SellerPage() {
  const guard = await guardRoute('/account/seller');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  const stores = await myStores(db(), actor);
  if (stores.length === 0) {
    return (
      <PublicShell actor={actor} title="فروشگاه من" pathname="/account/seller">
        <div className="space-y-lg p-lg">
          <Alert tone="info" title="فروشنده کالا فقط پت‌شاپ و کسب‌وکار تأییدشده است">
            <span data-testid="seller-intro">
              برای فروش کالا در همزیست، پرونده کسب‌وکار خود را ثبت کنید. احراز هویت تأییدشده لازم است و
              پرونده پس از بررسی و آغاز دوره پلن فعال می‌شود.
            </span>
          </Alert>
          <Card>
            <h2 className="text-label-lg">ثبت فروشگاه تازه</h2>
            <div className="mt-lg">
              <StartSellerForm />
            </div>
          </Card>
        </div>
      </PublicShell>
    );
  }

  const store = stores[0]!;
  let detail;
  try {
    detail = await sellerDetail(db(), actor, store.id);
  } catch (error) {
    if (error instanceof AppError) return <AccessDenied error={error} />;
    throw error;
  }

  const { seller } = detail;
  const status = seller.status as SellerStatus;
  const role = store.role as SellerRole;
  const editable = isSellerEditable(status) && roleAllows(role, 'STORE_EDIT');
  const [reference, members, subscription, plans] = await Promise.all([
    directoryReferenceData(db()),
    sellerMembersOf(db(), seller.id),
    currentSubscription(db(), seller.id),
    publishedPlans(db()),
  ]);

  return (
    <PublicShell actor={actor} title="فروشگاه من" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-sm">
            <h2 className="text-label-lg">{seller.displayNameFa ?? 'فروشگاه بدون نام'}</h2>
            <StatusBadge tone={status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'warning' : 'neutral'}>
              <span data-testid="seller-status">{SELLER_STATUS_FA[status]}</span>
            </StatusBadge>
          </div>
          <p className="mt-sm text-caption text-text-secondary">
            {SELLER_KIND_FA[seller.kind as SellerKind]}
            <span className="mx-sm text-text-disabled">|</span>
            نقش شما: {SELLER_ROLE_FA[role]}
            <span className="mx-sm text-text-disabled">|</span>
            نسخه {seller.version.toLocaleString('fa-IR')}
          </p>
          {seller.statusReasonFa ? (
            <p className="mt-sm text-body-sm" data-testid="seller-status-reason">
              {seller.statusReasonFa}
            </p>
          ) : null}
          <dl className="mt-lg grid gap-sm text-body-sm md:grid-cols-2">
            <div>
              <dt className="text-caption text-text-secondary">حساب تسویه</dt>
              <dd data-testid="seller-iban">
                <bdi className="hz-ltr font-mono">{detail.maskedIban ?? '—'}</bdi>
                {seller.ibanVerifiedAt ? ' — تأییدشده ' + dateFa(seller.ibanVerifiedAt) : ' — تأیید نشده'}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">دوره پلن</dt>
              <dd data-testid="seller-plan">
                {subscription.subscription === null
                  ? 'پلنی خریداری نشده است'
                  : (subscription.planLabelFa ?? '') +
                    ' — ' +
                    (subscription.expired
                      ? 'منقضی'
                      : subscription.subscription.status === 'PENDING_PAYMENT'
                        ? 'در انتظار پرداخت'
                        : 'تا ' + dateFa(subscription.subscription.endsAt))}
              </dd>
            </div>
          </dl>
        </Card>

        {detail.blockers.length > 0 && isSellerEditable(status) ? (
          <Card>
            <h2 className="text-label-lg">برای ارسال پرونده این موارد لازم است</h2>
            <ul className="mt-lg space-y-2xs text-body-sm" data-testid="seller-blockers">
              {detail.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-label-lg">اطلاعات کسب‌وکار</h2>
          <div className="mt-lg">
            <SellerApplicationForm
              disabled={!editable}
              provinces={reference.provinces.map((row) => ({ value: row.code, label: row.nameFa }))}
              cities={reference.cities.map((row) => ({
                value: row.id,
                label: row.nameFa,
                provinceCode: row.provinceCode,
              }))}
              values={{
                sellerId: seller.id,
                version: seller.version,
                displayNameFa: seller.displayNameFa ?? '',
                legalNameFa: seller.legalNameFa ?? '',
                businessTypeFa: seller.businessTypeFa ?? '',
                nationalIdentifier: seller.nationalIdentifier ?? '',
                representativeNameFa: seller.representativeNameFa ?? '',
                representativePhone: seller.representativePhone ?? '',
                contactEmail: seller.contactEmail ?? '',
                licenceKindFa: seller.licenceKindFa ?? '',
                licenceNumber: seller.licenceNumber ?? '',
                licenceIssuedOn: seller.licenceIssuedOn ?? '',
                licenceExpiresOn: seller.licenceExpiresOn ?? '',
                provinceCode: seller.provinceCode ?? '',
                cityId: seller.cityId ?? '',
                addressFa: seller.addressFa ?? '',
                postalCode: seller.postalCode ?? '',
                settlementIban: seller.settlementIban ?? '',
                settlementHolderNameFa: seller.settlementHolderNameFa ?? '',
                shippingPolicyFa: seller.shippingPolicyFa ?? '',
                returnPolicyFa: seller.returnPolicyFa ?? '',
              }}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">قرارداد و مدارک</h2>
          <div className="mt-lg space-y-lg">
            <AcceptAgreementForm sellerId={seller.id} accepted={seller.agreementVersion} />
            {detail.documents.length > 0 ? (
              <ul className="space-y-2xs text-body-sm" data-testid="seller-documents">
                {detail.documents.map((document) => (
                  <li key={document.id}>
                    {document.kind}
                    <span className="mx-sm text-text-disabled">|</span>
                    {dateFa(document.createdAt)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-text-secondary" data-testid="seller-documents-empty">
                هنوز مدرکی بارگذاری نشده است.
              </p>
            )}
            {editable ? <SellerDocumentForm sellerId={seller.id} /> : null}
          </div>
        </Card>

        {isSellerEditable(status) && roleAllows(role, 'STORE_SUBMIT') ? (
          <Card>
            <h2 className="text-label-lg">ارسال برای بررسی</h2>
            <div className="mt-lg">
              <SubmitSellerForm sellerId={seller.id} version={seller.version} />
            </div>
          </Card>
        ) : null}

        {(status === 'APPROVED' || status === 'ACTIVE' || status === 'SUSPENDED') && roleAllows(role, 'STORE_BILLING') ? (
          <Card>
            <h2 className="text-label-lg">پلن فروشندگی</h2>
            <p className="mt-2xs text-caption text-text-secondary" data-testid="plan-note">
              دوره فروشگاه فقط با پرداخت تأییدشده روی سرور آغاز می‌شود. تا ثبت تعرفه یک پلن، خرید آن باز
              نمی‌شود و «تعیین‌نشده» به معنی رایگان نیست.
            </p>
            <div className="mt-lg">
              <BuyPlanForm
                sellerId={seller.id}
                plans={plans.map((plan) => ({
                  id: plan.id,
                  labelFa: plan.labelFa,
                  priceFa: plan.priceToman === null ? '—' : plan.priceToman.toLocaleString('fa-IR'),
                  configured: plan.priceToman !== null,
                }))}
              />
            </div>
          </Card>
        ) : null}

        {roleAllows(role, 'STORE_MEMBERS') ? (
          <Card>
            <h2 className="text-label-lg">همکاران فروشگاه</h2>
            <p className="mt-2xs text-caption text-text-secondary">
              نقش هر همکار فقط در همین فروشگاه معنی دارد و هیچ دسترسی‌ای به فروشگاه دیگری نمی‌دهد.
            </p>
            <ul className="mt-lg space-y-md" data-testid="seller-members">
              {members.map((member) => (
                <li key={member.id} className="space-y-sm border-b border-border-subtle pb-md last:border-0">
                  <p className="text-body-sm">
                    <bdi className="hz-ltr font-mono">{member.mobile}</bdi>
                    <span className="mx-sm text-text-disabled">|</span>
                    {SELLER_ROLE_FA[member.role as SellerRole]}
                    <span className="mx-sm text-text-disabled">|</span>
                    {member.status === 'ACTIVE' ? 'فعال' : 'حذف‌شده'}
                  </p>
                  {member.role !== 'OWNER' && member.status === 'ACTIVE' ? (
                    <MemberRowForm sellerId={seller.id} memberId={member.id} />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-lg">
              <InviteMemberForm sellerId={seller.id} />
            </div>
          </Card>
        ) : null}
      </div>
    </PublicShell>
  );
}
