import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge, type StatusTone } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetDirectoryEditor } from '../../../../src/vets/directory.ts';
import { LOCATION_KIND_FA, VET_PUBLIC_STATUS_FA } from '../../../../src/vets/directory-model.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { AddCityForm, LocationPublicForm, VetPublicProfileForm, VetPublicStatusForm } from './forms.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');

function Axis({ label, tone, value, detail, testId }: { label: string; tone: StatusTone; value: string; detail?: string; testId: string }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-sm border-b border-border-subtle py-sm last:border-b-0" data-testid={testId}>
      <div className="min-w-0">
        <p className="text-label-md">{label}</p>
        {detail ? <p className="mt-2xs text-caption text-text-secondary">{detail}</p> : null}
      </div>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </li>
  );
}

/**
 * One veterinarian's public directory page, edited by the superadmin —
 * Requirements-Phase-2 §7, §21 (PROMPT-006). The same row the Phase 1 registry
 * above records; the status axes are shown one by one and never summed.
 */
export default async function AdminVetDirectoryPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const guard = await guardRoute('/admin/vets/' + encodeURIComponent(accountId));
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const data = await vetDirectoryEditor(db(), guard.actor, accountId);
  if (data === null) notFound();
  const { facts, completeness, blockers, reference } = data;
  const { profile } = facts;
  const editable = {
    accountId: profile.accountId,
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
  };

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — سوپرادمین" pathname="/admin/vets" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Link href="/admin/vets" className="text-label-md text-text-brand underline underline-offset-4">
          بازگشت به دامپزشکان
        </Link>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <h1 className="text-h4">{profile.displayNameFa}</h1>
              <p className="mt-2xs text-caption text-text-secondary">پروفایل عمومی دایرکتوری</p>
            </div>
            <span data-testid="directory-public-status">
              <StatusBadge tone={profile.publicStatus === 'PUBLISHED' ? 'success' : profile.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
                {VET_PUBLIC_STATUS_FA[profile.publicStatus]}
              </StatusBadge>
            </span>
          </div>
          {profile.publicStatus === 'PUBLISHED' && profile.publicSlug ? (
            <p className="mt-sm text-body-sm">
              <Link
                href={'/veterinarians/' + profile.publicSlug}
                className="text-text-brand underline underline-offset-4"
                data-testid="directory-public-link"
              >
                مشاهده صفحه عمومی
              </Link>
            </p>
          ) : null}

          <ul className="mt-lg" data-testid="directory-axes">
            <Axis
              testId="axis-completeness"
              label="تکمیل پروفایل"
              tone={completeness.complete ? 'success' : 'neutral'}
              value={fa(completeness.done) + ' از ' + fa(completeness.total)}
              detail={completeness.missing.length > 0 ? 'مانده: ' + completeness.missing.join('، ') : undefined}
            />
            <Axis testId="axis-ownership" label="مالکیت" tone="info" value="متعلق به حساب دامپزشک" />
            <Axis
              testId="axis-verification"
              label="تأیید حرفه‌ای (کد نظام)"
              tone={profile.councilVerifiedAt ? 'success' : 'neutral'}
              value={profile.councilVerifiedAt ? 'تأییدشده' : 'تأییدنشده'}
              detail={profile.councilVerifiedAt ? 'تأیید در ' + formatCivilDateFa(profile.councilVerifiedAt.toISOString().slice(0, 10)) : undefined}
            />
            <Axis
              testId="axis-trusted"
              label="معتمد همزیست"
              tone={facts.trusted ? 'success' : 'neutral'}
              value={facts.trusted ? 'فعال' : 'غیرفعال'}
              detail="از مسیر نقش دامپزشک معتمد فاز یک؛ این صفحه آن را تغییر نمی‌دهد."
            />
            <Axis testId="axis-advertising" label="تبلیغات" tone="neutral" value="بسته فعالی ندارد" detail="هیچ بسته‌ای نشان حرفه‌ای نمی‌سازد." />
          </ul>
        </Card>

        <VetPublicStatusForm profile={editable} blockers={blockers} />
        <VetPublicProfileForm profile={editable} specialties={reference.specialties} species={reference.species} />

        <Card>
          <h2 className="text-label-lg">محل‌های کار</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            نشانی، تلفن، پروانه و امکانات در فهرست دامپزشکان ثبت می‌شوند. اینجا فقط شهر و نمایش عمومی هر محل تعیین می‌شود و
            Finder تغییری نمی‌کند.
          </p>
          {facts.locations.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="محل کاری ثبت نشده است" description="ابتدا در فهرست دامپزشکان محل کار را ثبت کنید." />
            </div>
          ) : (
            <ul className="mt-lg space-y-lg">
              {facts.locations.map((location) => (
                <li key={location.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'directory-location-' + location.id}>
                  <div className="flex flex-wrap items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <h3 className="text-label-md">{location.nameFa}</h3>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {[LOCATION_KIND_FA[location.kind], location.provinceFa, location.cityFa, location.addressFa].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <StatusBadge tone={!location.isActive ? 'warning' : location.isPublic ? 'success' : 'neutral'}>
                      {!location.isActive ? 'غیرفعال' : location.isPublic ? 'عمومی' : 'غیرعمومی'}
                    </StatusBadge>
                  </div>
                  <LocationPublicForm
                    accountId={profile.accountId}
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

        <AddCityForm accountId={profile.accountId} provinces={reference.provinces} />
      </div>
    </OpsShell>
  );
}
