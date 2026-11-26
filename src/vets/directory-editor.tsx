import Link from 'next/link';
import { Card } from '../ui/card.tsx';
import { SectionHeader } from '../ui/section-header.tsx';
import { EmptyState } from '../ui/states.tsx';
import { StatusBadge, type StatusTone } from '../ui/status.tsx';
import { formatCivilDateFa } from '../domain/calendar.ts';
import type { DirectoryEditorData } from './directory.ts';
import { LOCATION_KIND_FA, packagePurchaseEligibility } from './directory-model.ts';
import type { DirectorySurface } from './directory-actions.ts';
import {
  AddCityForm,
  AddOwnLocationForm,
  LocationPublicForm,
  VetPublicProfileForm,
  VetPublicStatusForm,
} from './directory-forms.tsx';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const dateFa = (value: Date): string => formatCivilDateFa(value.toISOString().slice(0, 10));

/** `status`: a status-dictionary key, or — only for a value with no key (GAPS #4) — tone + value. */
function Axis({
  label,
  status,
  detail,
  testId,
}: {
  label: string;
  status: string | { tone: StatusTone; value: string };
  detail?: string;
  testId: string;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-sm border-b border-border-subtle py-sm last:border-b-0" data-testid={testId}>
      <div className="min-w-0">
        <p className="text-label-sm">{label}</p>
        {detail ? <p className="mt-2xs text-caption text-text-secondary">{detail}</p> : null}
      </div>
      {typeof status === 'string' ? <StatusBadge status={status} /> : <StatusBadge tone={status.tone}>{status.value}</StatusBadge>}
    </li>
  );
}

/**
 * One veterinarian's directory profile, edited by its owner or the superadmin
 * (Requirements-Phase-2 §7, §21; PROMPT-006, PROMPT-007). The five status axes
 * are shown one by one and never summed (P2-D05).
 */
export function VetDirectoryEditor({
  data,
  surface,
  headless = false,
}: {
  data: DirectoryEditorData;
  surface: Exclude<DirectorySurface, 'review'>;
  /** The page already shows the name and status (record summary). */
  headless?: boolean;
}) {
  const { facts, completeness, blockers, reference } = data;
  const { profile } = facts;
  const purchase = packagePurchaseEligibility(profile);
  const editable = {
    profileId: profile.id,
    version: profile.version,
    headlineFa: profile.headlineFa,
    bioFa: profile.bioFa,
    experienceFa: profile.experienceFa,
    phone: profile.phone,
    showPhone: profile.showPhone,
    showCouncilCode: profile.showCouncilCode,
    specialtyCodes: facts.specialtyCodes,
    speciesCodes: facts.speciesCodes,
    publicStatus: profile.publicStatus,
    hiddenByReview: profile.hiddenByReview,
  };

  return (
    <div className="space-y-lg">
      <Card>
        {headless ? (
          <SectionHeader title="وضعیت پرونده" size="sm" />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <h2 className="hz-h3">{profile.displayNameFa}</h2>
              <p className="mt-2xs text-caption text-text-secondary">پروفایل عمومی دایرکتوری</p>
            </div>
            <span data-testid="directory-public-status">
              <StatusBadge status={profile.publicStatus} />
            </span>
          </div>
        )}
        {profile.publicStatus === 'PUBLISHED' && profile.publicSlug ? (
          <p className="mt-sm text-body-sm">
            <Link href={'/veterinarians/' + profile.publicSlug} className="hz-link hz-link--standalone" data-testid="directory-public-link">
              مشاهده صفحه عمومی
            </Link>
          </p>
        ) : null}

        <ul className="mt-lg" data-testid="directory-axes">
          <Axis
            testId="axis-completeness"
            label="تکمیل پروفایل"
            // GAPS #4: a count, not a lifecycle status
            status={{ tone: completeness.complete ? 'success' : 'neutral', value: fa(completeness.done) + ' از ' + fa(completeness.total) }}
            detail={completeness.missing.length > 0 ? 'مانده: ' + completeness.missing.join('، ') : undefined}
          />
          <Axis
            testId="axis-ownership"
            label="مالکیت"
            // GAPS #4: no dictionary key for the ownership axis (CLAIMED / OWNED / UNOWNED)
            status={{
              tone: profile.accountId ? 'info' : 'warning',
              value: profile.accountId ? (profile.claimedAt ? 'Claim‌شده' : 'متعلق به حساب دامپزشک') : 'بدون مالک',
            }}
            detail={profile.claimedAt ? 'Claim تأییدشده در ' + dateFa(profile.claimedAt) : undefined}
          />
          <Axis
            testId="axis-verification"
            label="تأیید حرفه‌ای (کد نظام)"
            // GAPS #4: no dictionary key for «تأییدنشده» (unverified)
            status={profile.councilVerifiedAt ? 'VERIFIED' : { tone: 'neutral', value: 'تأییدنشده' }}
            detail={profile.councilVerifiedAt ? 'تأیید در ' + dateFa(profile.councilVerifiedAt) : undefined}
          />
          <Axis
            testId="axis-trusted"
            label="معتمد همزیست"
            status={facts.trusted ? 'ACTIVE' : 'INACTIVE'}
            detail="از مسیر نقش دامپزشک معتمد فاز یک؛ تأیید پروفایل یا بسته آن را نمی‌سازد."
          />
          <Axis
            testId="axis-advertising"
            label="تبلیغات"
            // GAPS #4: no dictionary key for «no active package»
            status={{ tone: 'neutral', value: 'بسته فعالی ندارد' }}
            detail={purchase.allowed ? 'هیچ بسته‌ای نشان حرفه‌ای نمی‌سازد.' : purchase.reasonFa}
          />
        </ul>
      </Card>

      <VetPublicStatusForm surface={surface} profile={editable} blockers={blockers} />
      <VetPublicProfileForm surface={surface} profile={editable} specialties={reference.specialties} species={reference.species} />

      <Card>
        <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>محل‌های کار</span></h2></div>
        <p className="mt-xs text-body-sm text-text-secondary">
          {surface === 'admin'
            ? 'نشانی، تلفن، پروانه و امکانات در فهرست دامپزشکان ثبت می‌شوند. اینجا فقط شهر و نمایش عمومی هر محل تعیین می‌شود و Finder تغییری نمی‌کند.'
            : 'شهر، ساعات و نمایش عمومی هر محل را اینجا تعیین کنید. پروانه و امکانات خدمات همزیست فقط با بررسی سوپرادمین ثبت می‌شوند.'}
        </p>
        {facts.locations.length === 0 ? (
          <div className="mt-lg">
            <EmptyState
              title="محل کاری ثبت نشده است"
              description={surface === 'admin' ? 'ابتدا در فهرست دامپزشکان محل کار را ثبت کنید.' : 'با فرم «افزودن محل کار» اولین محل کارتان را ثبت کنید.'}
            />
          </div>
        ) : (
          <ul className="mt-lg divide-y divide-border-subtle">
            {facts.locations.map((location) => (
              <li key={location.id} className="py-lg first:pt-0 last:pb-0" data-testid={'directory-location-' + location.id}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h3 className="text-label-sm">{location.nameFa}</h3>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {[LOCATION_KIND_FA[location.kind], location.provinceFa, location.cityFa, location.addressFa].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <StatusBadge status={!location.isActive ? 'INACTIVE' : location.isPublic ? 'PUBLISHED' : 'HIDDEN'} />
                </div>
                <LocationPublicForm
                  surface={surface}
                  location={{
                    id: location.id,
                    version: location.version,
                    isPublic: location.isPublic,
                    isActive: location.isActive,
                    provinceCode: location.provinceCode,
                    cityId: location.cityId,
                    hoursNoteFa: location.hoursNoteFa,
                  }}
                  provinces={reference.provinces}
                  cities={reference.cities}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {surface === 'owner' ? (
        <AddOwnLocationForm provinces={reference.provinces} cities={reference.cities} />
      ) : (
        <AddCityForm surface={surface} provinces={reference.provinces} />
      )}
    </div>
  );
}
