import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { PageCrumbs } from '../../../../src/ui/page-crumbs.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { ActionOwner, StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { AppError } from '../../../../src/domain/errors.ts';
import { sellerListing } from '../../../../src/marketplace/listings.ts';
import { sellerEligibility } from '../../../../src/marketplace/listing-eligibility.ts';
import { directoryReferenceData } from '../../../../src/vets/directory.ts';
import {
  DELIVERY_METHOD_FA,
  LISTING_STATUS_FA,
  movesFrom,
  NEUTER_FA,
  VACCINATION_FA,
  isEditable,
  type Disclosure,
  type ListingStatus,
} from '../../../../src/marketplace/listing-model.ts';
import { AddMediaForm, ListingContentForm, MoveListingForm, PromotionForm, RemoveMediaForm } from '../forms.tsx';
import { promotionPackages, promotionsOfListing } from '../../../../src/marketplace/promotions.ts';
import { appealableReports, myAppeals } from '../../../../src/marketplace/listing-moderation.ts';
import { AppealForm } from '../../../../src/marketplace/moderation-forms.tsx';

export const dynamic = 'force-dynamic';

const MOVE_LABEL: Partial<Record<ListingStatus, string>> = {
  PUBLISHED: 'انتشار آگهی',
  PAUSED: 'توقف موقت آگهی',
  REMOVED: 'حذف آگهی',
};

const dateFa = (value: Date | null) =>
  value === null ? '—' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(value);

/**
 * One advert — PROMPT-003. P06 record file: the advert's sections in the main
 * column, its status and the one next move in the side column.
 *
 * The page is in two halves on purpose. First: what Hamzist knows about the
 * animal, read from the animal record and not editable here. Then: what the
 * seller says, which is the only part this form owns. Mixing the two is how a
 * marketplace ends up with an advert that contradicts the pedigree.
 */
export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRoute('/account/listings');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const { id } = await params;

  let detail;
  try {
    detail = await sellerListing(db(), actor, id);
  } catch (error) {
    if (error instanceof AppError) return <RecordNotFound error={error} />;
    throw error;
  }

  const { listing, animal } = detail;
  const status = listing.status as ListingStatus;
  const editable = isEditable(status);
  const [reference, eligibility, packages, promotions, appeals] = await Promise.all([
    directoryReferenceData(db()),
    sellerEligibility(db(), actor.accountId, listing.animalId),
    promotionPackages(db()),
    promotionsOfListing(db(), listing.id),
    myAppeals(db(), actor),
  ]);
  const appealable = status === 'SUSPENDED' ? await appealableReports(db(), actor, listing.id) : [];
  const listingAppeals = appeals.filter((appeal) => appeal.listingId === listing.id);
  const moves = movesFrom(status, 'SELLER');
  const name = animal.nameFa ?? 'بدون نام';
  const now = new Date();

  return (
    <PublicShell
      actor={actor}
      title="آگهی فروش"
      pathname="/account/listings"
      header={
        <div>
          <PageCrumbs items={[{ href: '/dashboard', name: 'خانه' }, { href: '/account/listings', name: 'آگهی‌های من' }, { name }]} />
          <PageHeader
            title={'آگهی فروش · ' + name}
            back={{ href: '/account/listings', label: 'آگهی‌های من' }}
            aside={
              <span data-testid="listing-status">
                <StatusBadge status={status} />
              </span>
            }
            meta={[
              'نسخه ' + listing.version.toLocaleString('fa-IR'),
              'انتشار: ' + dateFa(listing.publishedAt),
              'انقضا: ' + dateFa(listing.expiresAt),
            ]}
            actions={
              <>
                <Link href={'/account/listings/' + listing.id + '/requests'} className="hz-btn hz-btn--secondary" data-testid="listing-requests-link">
                  <Icon name="chatCircleDots" size="sm" />
                  درخواست‌های خرید این آگهی
                </Link>
                <Link href="/account/listings" className="hz-link hz-link--standalone hz-show-md" data-testid="back-to-listings">
                  بازگشت به آگهی‌های من
                </Link>
              </>
            }
          />
        </div>
      }
    >
      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-xl lg:col-span-8">
          <Card>
            <SectionHeader size="sm" title="اطلاعات قطعی از پرونده حیوان" />
            <p className="mt-2xs text-caption text-text-secondary">
              این موارد از پرونده حیوان خوانده می‌شوند و از این فرم تغییر نمی‌کنند؛ اصلاحشان از همان مسیری انجام
              می‌شود که ثبتشان کرده است.
            </p>
            <div className="mt-md" data-testid="derived-facts">
              <KeyValueList
                twoCol
                rows={[
                  { key: 'گونه و نژاد', value: (animal.species === 'DOG' ? 'سگ' : animal.species) + ' — ' + (animal.breedFa ?? 'نامشخص') },
                  { key: 'جنسیت', value: animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : null, empty: 'ثبت نشده' },
                  {
                    key: 'تاریخ تولد',
                    value: animal.birthDate ? (
                      <>
                        {animal.birthDateApproximate ? 'حدود ' : ''}
                        <bdi>{animal.birthDate}</bdi>
                      </>
                    ) : null,
                    empty: 'ثبت نشده',
                  },
                  {
                    key: 'شناسه‌ها',
                    value: (
                      <>
                        <bdi className="hz-id" dir="ltr">
                          {animal.petId ?? '—'}
                        </bdi>
                        {' / '}
                        <bdi className="hz-id" dir="ltr">
                          {animal.pedigreeCode ?? '—'}
                        </bdi>
                      </>
                    ),
                  },
                  { key: 'میکروچیپ', value: animal.microchipRegistered ? 'ثبت‌شده' : 'ثبت نشده', testId: 'fact-microchip' },
                  { key: 'شجره‌نامه', value: animal.pedigreeIssued ? 'صادرشده' : 'صادر نشده' },
                  { key: 'تست اصالت والدین', value: animal.parentageFinal ? 'نتیجه نهایی دارد' : 'ندارد' },
                  { key: 'تأیید هویت توسط دامپزشک', value: animal.identityVerified ? 'انجام شده' : 'انجام نشده' },
                ]}
              />
            </div>
          </Card>

          <Card>
            <SectionHeader size="sm" title="تصاویر و ویدئو" count={detail.media.length > 0 ? detail.media.length.toLocaleString('fa-IR') : undefined} />
            <p className="mt-2xs text-caption text-text-secondary">
              تصاویر تا زمانی که آگهی منتشر است دیده می‌شوند؛ با توقف یا حذف آگهی از دسترس عمومی خارج می‌شوند.
            </p>
            {detail.media.length === 0 ? (
              <p className="mt-lg text-caption text-text-secondary">هنوز رسانه‌ای افزوده نشده است.</p>
            ) : (
              <ul className="hz-cardlist mt-lg" data-testid="listing-media">
                {detail.media.map((item) => (
                  <li key={item.id} className="hz-cardlist__item" data-testid={'media-row-' + item.id}>
                    <div className="hz-cardlist__row">
                      <div className="flex min-w-0 items-center gap-sm">
                        <Icon name={item.kind === 'VIDEO' ? 'camera' : 'image'} size="md" />
                        <div className="min-w-0">
                          <p className="hz-cardlist__title">{item.kind === 'VIDEO' ? 'ویدئو' : 'تصویر'}</p>
                          <p className="hz-cardlist__meta">{item.altFa}</p>
                        </div>
                      </div>
                      {editable ? <RemoveMediaForm listingId={listing.id} mediaId={item.id} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {editable ? (
              <div className="mt-lg grid gap-lg md:grid-cols-2">
                <AddMediaForm listingId={listing.id} kind="IMAGE" />
                <AddMediaForm listingId={listing.id} kind="VIDEO" />
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionHeader size="sm" title="اطلاعات آگهی" />
            {!editable ? (
              <p className="mt-sm text-caption text-text-secondary">
                آگهی در وضعیت «{LISTING_STATUS_FA[status]}» قابل ویرایش نیست.
              </p>
            ) : null}
            <div className="mt-lg">
              <ListingContentForm
                disabled={!editable}
                provinces={reference.provinces}
                cities={reference.cities}
                values={{
                  listingId: listing.id,
                  version: listing.version,
                  priceMode: listing.priceMode,
                  priceToman: listing.priceToman === null ? '' : listing.priceToman.toString(),
                  descriptionFa: listing.descriptionFa ?? '',
                  reasonForSaleFa: listing.reasonForSaleFa ?? '',
                  provinceCode: listing.provinceCode ?? '',
                  cityId: listing.cityId ?? '',
                  vaccinationStatus: listing.vaccinationStatus,
                  neuterStatus: listing.neuterStatus,
                  healthNoteFa: listing.healthNoteFa ?? '',
                  deliveryMethods: detail.deliveryMethods,
                }}
              />
            </div>
          </Card>

          <Card>
            <SectionHeader size="sm" title="اظهارات فعلی و روش‌های تحویل" />
            <ul className="mt-md" data-testid="listing-disclosures">
              <li className="hz-kv__row">
                <span className="hz-kv__key">واکسیناسیون:</span>{' '}
                <span className="hz-kv__value">
                  {listing.vaccinationStatus ? VACCINATION_FA[listing.vaccinationStatus as Disclosure] : 'ثبت نشده'}
                </span>
              </li>
              <li className="hz-kv__row">
                <span className="hz-kv__key">عقیم‌سازی:</span>{' '}
                <span className="hz-kv__value">{listing.neuterStatus ? NEUTER_FA[listing.neuterStatus as Disclosure] : 'ثبت نشده'}</span>
              </li>
              <li className="hz-kv__row">
                <span className="hz-kv__key">روش تحویل:</span>{' '}
                <span className="hz-kv__value">
                  {detail.deliveryMethods.length === 0 ? 'ثبت نشده' : detail.deliveryMethods.map((m) => DELIVERY_METHOD_FA[m]).join('، ')}
                </span>
              </li>
            </ul>
          </Card>

          <Card>
            <SectionHeader size="sm" title="تبلیغ آگهی" />
            <p className="mt-2xs text-caption text-text-secondary" data-testid="promotion-note">
              بسته تبلیغ فقط جایگاه نمایش آگهی را در نتایج مرتبط بالاتر می‌برد و همیشه با برچسب «تبلیغ» دیده
              می‌شود. روی اعتبار، تأیید یا امتیاز شما هیچ اثری ندارد و در تاریخ خودش تمام می‌شود.
            </p>
            {promotions.length > 0 ? (
              <ul className="hz-cardlist mt-lg" data-testid="listing-promotions">
                {promotions.map((promotion) => (
                  <li key={promotion.id} className="hz-cardlist__item" data-testid={'promotion-row-' + promotion.id}>
                    <div className="hz-cardlist__row">
                      <span className="text-body-sm">{promotion.packageLabelFa}</span>
                      <StatusBadge status={promotion.status === 'ACTIVE' && promotion.endsAt !== null && promotion.endsAt.getTime() <= now.getTime() ? 'EXPIRED' : promotion.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {status === 'PUBLISHED' || status === 'RESERVED' ? (
              <PromotionForm
                listingId={listing.id}
                packages={packages.map((row) => ({
                  id: row.id,
                  labelFa: row.labelFa,
                  priceToman: row.priceToman === null ? null : row.priceToman.toString(),
                }))}
              />
            ) : (
              <p className="mt-sm text-caption text-text-secondary">فقط آگهی منتشرشده قابل تبلیغ است.</p>
            )}
          </Card>

          {listingAppeals.length > 0 ? (
            <Card>
              <SectionHeader size="sm" title="اعتراض‌های من درباره این آگهی" />
              <ul className="hz-cardlist mt-lg" data-testid="my-appeals">
                {listingAppeals.map((appeal) => (
                  <li key={appeal.id} className="hz-cardlist__item">
                    <p className="text-body-sm">{appeal.statementFa}</p>
                    <p className="hz-cardlist__meta">
                      {appeal.status === 'OPEN'
                        ? 'در انتظار بررسی'
                        : appeal.status === 'UPHELD'
                          ? 'تصمیم قبلی پابرجا ماند'
                          : 'اعتراض پذیرفته شد'}
                      {appeal.decisionReasonFa ? ' — ' + appeal.decisionReasonFa : ''}
                    </p>
                    {appeal.status === 'OPEN' ? <ActionOwner owner="SYSTEM" /> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {appealable.length > 0 ? (
            <Card>
              <SectionHeader size="sm" title="اعتراض به تصمیم ناظر" />
              <p className="mt-2xs text-caption text-text-secondary">
                اگر این تصمیم را درست نمی‌دانید، دلیلتان را بنویسید. تصمیم قبلی حذف نمی‌شود؛ پاسخ اعتراض کنار
                آن ثبت می‌شود.
              </p>
              <ul className="hz-cardlist mt-lg" data-testid="appealable-reports">
                {appealable.map((report) => (
                  <li key={report.id} className="hz-cardlist__item">
                    <p className="text-body-sm">{report.decisionReason ?? 'بدون دلیل ثبت‌شده'}</p>
                    <AppealForm reportId={report.id} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <SectionHeader size="sm" title="تاریخچه نسخه‌ها" />
            <ol className="mt-md" data-testid="listing-revisions">
              {detail.revisions.map((revision) => (
                <li key={revision.number} className="hz-setting hz-setting--text">
                  <div className="hz-setting__label">
                    <span className="hz-setting__name">
                      نسخه {revision.number.toLocaleString('fa-IR')} — <bdi dir="ltr">{revision.action}</bdi>
                    </span>
                    <span className="hz-setting__hint">
                      {new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(revision.createdAt)}
                      {revision.reasonFa ? ' — ' + revision.reasonFa : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside aria-label="وضعیت و اقدام" className="space-y-lg lg:col-span-4">
          <Card variant="compact">
            <SectionHeader size="sm" title="وضعیت و اقدام" />
            <div className="mt-md space-y-md">
              <div className="flex items-center justify-between gap-sm">
                <span className="text-caption text-text-secondary">وضعیت</span>
                <StatusBadge status={status} />
              </div>
              {listing.statusReasonFa ? (
                <p className="text-body-sm" data-testid="listing-status-reason">
                  {listing.statusReasonFa}
                </p>
              ) : null}
              {moves.length > 0 ? <ActionOwner owner="USER" /> : null}
              {detail.blockers.length > 0 ? (
                <Alert tone="warning" title="برای انتشار، این موارد باقی مانده است">
                  <ul className="space-y-2xs" data-testid="publication-blockers">
                    {detail.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              <div className="space-y-md">
                {moves.map((to) => (
                  <MoveListingForm
                    key={to}
                    listingId={listing.id}
                    version={listing.version}
                    to={to}
                    label={MOVE_LABEL[to] ?? LISTING_STATUS_FA[to]}
                    tone={to === 'PUBLISHED' ? 'primary' : to === 'REMOVED' ? 'ghost' : 'secondary'}
                    withReason={to !== 'PUBLISHED'}
                  />
                ))}
              </div>
            </div>
          </Card>

          {!eligibility.allowed ? (
            <Alert tone="error" title="شرایط فروش این حیوان در حال حاضر برقرار نیست">
              <ul className="space-y-2xs" data-testid="listing-eligibility-blockers">
                {eligibility.blockers.map((blocker) => (
                  <li key={blocker.code}>{blocker.messageFa}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <Alert tone={detail.handover.allowed ? 'info' : 'warning'} title="تحویل و انتقال مالکیت">
            <span data-testid="handover-note">
              {detail.handover.allowed ? 'این حیوان به حداقل سن مجاز تحویل رسیده است.' : (detail.handover.reasonFa ?? '')}
              {detail.handover.from !== null
                ? ' زودترین تاریخ تحویل: ' + new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(detail.handover.from) + '.'
                : ''}
            </span>
          </Alert>
        </aside>
      </div>
    </PublicShell>
  );
}
