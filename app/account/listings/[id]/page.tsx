import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
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
 * One advert — PROMPT-003.
 *
 * The page is in two halves on purpose. Above: what Hamzist knows about the
 * animal, read from the animal record and not editable here. Below: what the
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

  return (
    <PublicShell actor={actor} title="آگهی فروش" pathname="/account/listings">
      <div className="space-y-lg p-lg">
        <p className="text-caption">
          <Link href="/account/listings" className="text-text-brand" data-testid="back-to-listings">
            بازگشت به آگهی‌های من
          </Link>
        </p>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-sm">
            <h2 className="text-label-lg">{animal.nameFa ?? 'بدون نام'}</h2>
            <StatusBadge tone={status === 'PUBLISHED' ? 'success' : 'neutral'}>
              <span data-testid="listing-status">{LISTING_STATUS_FA[status]}</span>
            </StatusBadge>
          </div>
          {listing.statusReasonFa ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="listing-status-reason">
              {listing.statusReasonFa}
            </p>
          ) : null}
          <p className="mt-sm text-caption text-text-secondary">
            نسخه {listing.version.toLocaleString('fa-IR')}
            <span className="mx-sm text-text-disabled">|</span>
            انتشار: {dateFa(listing.publishedAt)}
            <span className="mx-sm text-text-disabled">|</span>
            انقضا: {dateFa(listing.expiresAt)}
          </p>
        </Card>

        <Card>
          <h2 className="text-label-lg">اطلاعات قطعی از پرونده حیوان</h2>
          <p className="mt-2xs text-caption text-text-secondary">
            این موارد از پرونده حیوان خوانده می‌شوند و از این فرم تغییر نمی‌کنند؛ اصلاحشان از همان مسیری انجام
            می‌شود که ثبتشان کرده است.
          </p>
          <dl className="mt-lg grid gap-sm text-body-sm md:grid-cols-2" data-testid="derived-facts">
            <div>
              <dt className="text-caption text-text-secondary">گونه و نژاد</dt>
              <dd>{(animal.species === 'DOG' ? 'سگ' : animal.species) + ' — ' + (animal.breedFa ?? 'نامشخص')}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">جنسیت</dt>
              <dd>{animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : 'ثبت نشده'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">تاریخ تولد</dt>
              <dd>
                <bdi>{animal.birthDate ?? 'ثبت نشده'}</bdi>
                {animal.birthDateApproximate ? ' (تقریبی)' : ''}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">شناسه‌ها</dt>
              <dd>
                <bdi className="hz-ltr font-mono">{animal.petId ?? '—'}</bdi>
                <span className="mx-xs text-text-disabled">/</span>
                <bdi className="hz-ltr font-mono">{animal.pedigreeCode ?? '—'}</bdi>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">میکروچیپ</dt>
              <dd data-testid="fact-microchip">
                {animal.microchipRegistered ? 'ثبت‌شده' : 'ثبت نشده'}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">شجره‌نامه</dt>
              <dd>{animal.pedigreeIssued ? 'صادرشده' : 'صادر نشده'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">تست اصالت والدین</dt>
              <dd>{animal.parentageFinal ? 'نتیجه نهایی دارد' : 'ندارد'}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">تأیید هویت توسط دامپزشک</dt>
              <dd>{animal.identityVerified ? 'انجام شده' : 'انجام نشده'}</dd>
            </div>
          </dl>
        </Card>

        <Alert tone={detail.handover.allowed ? 'info' : 'warning'} title="تحویل و انتقال مالکیت">
          <span data-testid="handover-note">
            {detail.handover.allowed
              ? 'این حیوان به حداقل سن مجاز تحویل رسیده است.'
              : (detail.handover.reasonFa ?? '')}
            {detail.handover.from !== null
              ? ' زودترین تاریخ تحویل: ' +
                new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(detail.handover.from) +
                '.'
              : ''}
          </span>
        </Alert>

        {!eligibility.allowed ? (
          <Alert tone="error" title="شرایط فروش این حیوان در حال حاضر برقرار نیست">
            <ul className="space-y-2xs" data-testid="listing-eligibility-blockers">
              {eligibility.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.messageFa}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <Card>
          <h2 className="text-label-lg">تصاویر و ویدئو</h2>
          <p className="mt-2xs text-caption text-text-secondary">
            تصاویر تا زمانی که آگهی منتشر است دیده می‌شوند؛ با توقف یا حذف آگهی از دسترس عمومی خارج می‌شوند.
          </p>
          {detail.media.length === 0 ? (
            <p className="mt-lg text-caption text-text-secondary">هنوز رسانه‌ای افزوده نشده است.</p>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="listing-media">
              {detail.media.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-md"
                  data-testid={'media-row-' + item.id}
                >
                  <div className="min-w-0">
                    <p className="text-label-md">{item.kind === 'VIDEO' ? 'ویدئو' : 'تصویر'}</p>
                    <p className="text-caption text-text-secondary">{item.altFa}</p>
                  </div>
                  {editable ? <RemoveMediaForm listingId={listing.id} mediaId={item.id} /> : null}
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
          <h2 className="text-label-lg">اطلاعات آگهی</h2>
          {!editable ? (
            <p className="mt-sm text-caption text-text-disabled">
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
          <h2 className="text-label-lg">اظهارات فعلی و روش‌های تحویل</h2>
          <ul className="mt-lg space-y-2xs text-body-sm" data-testid="listing-disclosures">
            <li>
              واکسیناسیون:{' '}
              {listing.vaccinationStatus ? VACCINATION_FA[listing.vaccinationStatus as Disclosure] : 'ثبت نشده'}
            </li>
            <li>
              عقیم‌سازی: {listing.neuterStatus ? NEUTER_FA[listing.neuterStatus as Disclosure] : 'ثبت نشده'}
            </li>
            <li>
              روش تحویل:{' '}
              {detail.deliveryMethods.length === 0
                ? 'ثبت نشده'
                : detail.deliveryMethods.map((m) => DELIVERY_METHOD_FA[m]).join('، ')}
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="text-label-lg">وضعیت آگهی</h2>
          {detail.blockers.length > 0 ? (
            <div className="mt-md">
              <Alert tone="warning" title="برای انتشار، این موارد باقی مانده است">
                <ul className="space-y-2xs" data-testid="publication-blockers">
                  {detail.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}
          <div className="mt-lg grid gap-lg md:grid-cols-3">
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
        </Card>

        <Card>
          <h2 className="text-label-lg">تبلیغ آگهی</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="promotion-note">
            بسته تبلیغ فقط جایگاه نمایش آگهی را در نتایج مرتبط بالاتر می‌برد و همیشه با برچسب «تبلیغ» دیده
            می‌شود. روی اعتبار، تأیید یا امتیاز شما هیچ اثری ندارد و در تاریخ خودش تمام می‌شود.
          </p>
          {promotions.length > 0 ? (
            <ul className="mt-lg space-y-sm text-body-sm" data-testid="listing-promotions">
              {promotions.map((promotion) => (
                <li
                  key={promotion.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-md"
                  data-testid={'promotion-row-' + promotion.id}
                >
                  <span>{promotion.packageLabelFa}</span>
                  <StatusBadge tone={promotion.stateFa === 'فعال' ? 'success' : 'neutral'}>
                    {promotion.stateFa}
                  </StatusBadge>
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
            <p className="mt-sm text-caption text-text-disabled">فقط آگهی منتشرشده قابل تبلیغ است.</p>
          )}
        </Card>

        {listingAppeals.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">اعتراض‌های من درباره این آگهی</h2>
            <ul className="mt-lg space-y-sm text-body-sm" data-testid="my-appeals">
              {listingAppeals.map((appeal) => (
                <li key={appeal.id} className="rounded-lg border border-border-subtle p-md">
                  <p>{appeal.statementFa}</p>
                  <p className="mt-2xs text-caption text-text-secondary">
                    {appeal.status === 'OPEN'
                      ? 'در انتظار بررسی'
                      : appeal.status === 'UPHELD'
                        ? 'تصمیم قبلی پابرجا ماند'
                        : 'اعتراض پذیرفته شد'}
                    {appeal.decisionReasonFa ? ' — ' + appeal.decisionReasonFa : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {appealable.length > 0 ? (
          <Card>
            <h2 className="text-label-lg">اعتراض به تصمیم ناظر</h2>
            <p className="mt-2xs text-caption text-text-secondary">
              اگر این تصمیم را درست نمی‌دانید، دلیلتان را بنویسید. تصمیم قبلی حذف نمی‌شود؛ پاسخ اعتراض کنار
              آن ثبت می‌شود.
            </p>
            <ul className="mt-lg space-y-md" data-testid="appealable-reports">
              {appealable.map((report) => (
                <li key={report.id} className="rounded-lg border border-border-subtle p-md">
                  <p className="text-body-sm">{report.decisionReason ?? 'بدون دلیل ثبت‌شده'}</p>
                  <AppealForm reportId={report.id} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-label-lg">تاریخچه نسخه‌ها</h2>
          <ul className="mt-lg space-y-sm text-body-sm" data-testid="listing-revisions">
            {detail.revisions.map((revision) => (
              <li key={revision.number} className="rounded-lg border border-border-subtle p-md">
                <p className="text-label-md">
                  نسخه {revision.number.toLocaleString('fa-IR')} — {revision.action}
                </p>
                <p className="text-caption text-text-secondary">
                  {new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(
                    revision.createdAt,
                  )}
                  {revision.reasonFa ? ' — ' + revision.reasonFa : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PublicShell>
  );
}
