import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionOwner, StatusBadge } from '../../../src/ui/status.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import type { IconName } from '../../../src/ui/icon-paths.ts';
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

/** The store's own areas; each page checks the role on the server. */
const SECTIONS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: '/account/seller/catalog', label: 'کاتالوگ کالا', icon: 'package' },
  { href: '/account/seller/orders', label: 'سفارش‌های فروشگاه', icon: 'shoppingBag' },
  { href: '/account/seller/returns', label: 'مرجوعی‌ها', icon: 'arrowUUpLeft' },
  { href: '/account/seller/finance', label: 'مالی و تسویه', icon: 'bank' },
  { href: '/account/seller/reviews', label: 'نظرها و پرسش‌ها', icon: 'star' },
  { href: '/account/seller/promotions', label: 'تخفیف‌ها', icon: 'percent' },
];

/**
 * A seller's own store — PROMPT-008. P06 record file: the application,
 * documents and people in the main column; status, settlement, plan and the
 * one next move in the side column.
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
      <PublicShell actor={actor} title="فروشگاه من" pathname="/account/seller" header={<PageHeader title="فروشگاه من" back={{ href: '/dashboard' }} />}>
        <div className="max-w-(--size-container-reading) space-y-lg">
          <Alert tone="info" title="فروشنده کالا فقط پت‌شاپ و کسب‌وکار تأییدشده است">
            <span data-testid="seller-intro">
              برای فروش کالا در همزیست، پرونده کسب‌وکار خود را ثبت کنید. احراز هویت تأییدشده لازم است و
              پرونده پس از بررسی و آغاز دوره پلن فعال می‌شود.
            </span>
          </Alert>
          <Card>
            <SectionHeader size="sm" title="ثبت فروشگاه تازه" />
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
  const canSubmit = isSellerEditable(status) && roleAllows(role, 'STORE_SUBMIT');

  return (
    <PublicShell
      actor={actor}
      title="فروشگاه من"
      pathname="/account/seller"
      header={
        <PageHeader
          title={seller.displayNameFa ?? 'فروشگاه بدون نام'}
          back={{ href: '/dashboard' }}
          aside={
            <span data-testid="seller-status">
              <StatusBadge status={status} />
            </span>
          }
          meta={[
            SELLER_KIND_FA[seller.kind as SellerKind],
            'نقش شما: ' + SELLER_ROLE_FA[role],
            'نسخه ' + seller.version.toLocaleString('fa-IR'),
          ]}
        />
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <aside aria-label="وضعیت و اقدام" className="min-w-0 space-y-lg lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <Card variant="compact">
            <SectionHeader size="sm" title="وضعیت و اقدام" />
            <div className="mt-sm space-y-md">
              <KeyValueList
                rows={[
                  {
                    key: 'حساب تسویه',
                    value: (
                      <>
                        <bdi dir="ltr">{detail.maskedIban ?? '—'}</bdi>
                        {seller.ibanVerifiedAt ? ' — تأییدشده ' + dateFa(seller.ibanVerifiedAt) : ' — تأیید نشده'}
                      </>
                    ),
                    testId: 'seller-iban',
                  },
                  {
                    key: 'دوره پلن',
                    value:
                      subscription.subscription === null
                        ? 'پلنی خریداری نشده است'
                        : (subscription.planLabelFa ?? '') +
                          ' — ' +
                          (subscription.expired
                            ? 'منقضی'
                            : subscription.subscription.status === 'PENDING_PAYMENT'
                              ? 'در انتظار پرداخت'
                              : 'تا ' + dateFa(subscription.subscription.endsAt)),
                    testId: 'seller-plan',
                  },
                ]}
              />
              {seller.statusReasonFa ? (
                <p className="text-body-sm" data-testid="seller-status-reason">
                  {seller.statusReasonFa}
                </p>
              ) : null}
              {canSubmit ? (
                <ActionOwner owner="USER" />
              ) : status === 'SUBMITTED' || status === 'UNDER_REVIEW' ? (
                <ActionOwner owner="SYSTEM" />
              ) : null}
              {detail.blockers.length > 0 && isSellerEditable(status) ? (
                <Alert tone="warning" title="برای ارسال پرونده این موارد لازم است">
                  <ul className="list-disc space-y-2xs ps-md" data-testid="seller-blockers">
                    {detail.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              {canSubmit ? <SubmitSellerForm sellerId={seller.id} version={seller.version} /> : null}
            </div>
          </Card>

          {(status === 'APPROVED' || status === 'ACTIVE' || status === 'SUSPENDED') && roleAllows(role, 'STORE_BILLING') ? (
            <Card variant="compact">
              <SectionHeader size="sm" title="پلن فروشندگی" />
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

          <Card variant="compact">
            <SectionHeader size="sm" title="بخش‌های فروشگاه" />
            <ul className="mt-sm">
              {SECTIONS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hz-link hz-link--standalone">
                    <Icon name={link.icon} size="sm" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </aside>

        <div className="min-w-0 space-y-xl lg:col-span-8 lg:col-start-1 lg:row-start-1">
          <Card>
            <SectionHeader size="sm" title="اطلاعات کسب‌وکار" />
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
            <SectionHeader size="sm" title="قرارداد و مدارک" />
            <div className="mt-lg space-y-lg">
              <AcceptAgreementForm sellerId={seller.id} accepted={seller.agreementVersion} />
              {detail.documents.length > 0 ? (
                <ul className="hz-cardlist" data-testid="seller-documents">
                  {detail.documents.map((document) => (
                    <li key={document.id} className="hz-cardlist__item">
                      <div className="hz-cardlist__row">
                        <span className="inline-flex items-center gap-xs text-body-sm">
                          <Icon name="fileText" size="sm" />
                          <bdi dir="ltr">{document.kind}</bdi>
                        </span>
                        <span className="hz-cardlist__meta">{dateFa(document.createdAt)}</span>
                      </div>
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

          {roleAllows(role, 'STORE_MEMBERS') ? (
            <Card>
              <SectionHeader size="sm" title="همکاران فروشگاه" count={members.length.toLocaleString('fa-IR')} />
              <p className="mt-2xs text-caption text-text-secondary">
                نقش هر همکار فقط در همین فروشگاه معنی دارد و هیچ دسترسی‌ای به فروشگاه دیگری نمی‌دهد.
              </p>
              <ul className="hz-cardlist mt-lg" data-testid="seller-members">
                {members.map((member) => (
                  <li key={member.id} className="hz-cardlist__item">
                    <div className="hz-cardlist__row">
                      <bdi className="hz-id" dir="ltr">
                        {member.mobile}
                      </bdi>
                      <span className="flex flex-wrap gap-xs">
                        <span className="hz-tag hz-tag--neutral">{SELLER_ROLE_FA[member.role as SellerRole]}</span>
                        <StatusBadge status={member.status} size="sm" />
                      </span>
                    </div>
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
      </div>
    </PublicShell>
  );
}
