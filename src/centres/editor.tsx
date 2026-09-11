import Link from 'next/link';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/states.tsx';
import { StatusBadge, type StatusTone } from '../ui/status.tsx';
import { formatCivilDateFa } from '../domain/calendar.ts';
import { packagePurchaseEligibility } from '../vets/directory-model.ts';
import type { CentreEditorData } from './service.ts';
import { CENTRE_STATUS_FA, LICENCE_STATUS_FA, WEEKDAYS_FA, type CentreStatus, type LicenceStatusName } from './model.ts';
import type { CentreSurface } from './actions.ts';
import {
  AttachLocationForm,
  BranchForm,
  CentreLicenceForm,
  CentreOwnerForm,
  CentreProfileForm,
  CentreStatusForm,
  MemberInviteForm,
  MemberRemoveForm,
  type EditableCentre,
} from './forms.tsx';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const dateFa = (value: Date): string => formatCivilDateFa(value.toISOString().slice(0, 10));

const MEMBER_STATUS_FA: Record<string, string> = {
  INVITED: 'در انتظار پذیرش',
  ACCEPTED: 'تأییدشده',
  DECLINED: 'ردشده',
  REMOVED: 'برداشته‌شده',
};

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
 * One centre, edited by its manager, the review operator or the superadmin —
 * Requirements-Phase-2 §9, §21 (PROMPT-008). The status axes are shown one by
 * one and never summed (P2-D05).
 */
export function CentreEditor({
  data,
  surface,
  unlinkedLocations = [],
}: {
  data: CentreEditorData;
  surface: CentreSurface;
  unlinkedLocations?: ReadonlyArray<{ id: string; label: string }>;
}) {
  const { facts, completeness, blockers, reference } = data;
  const { centre } = facts;
  const purchase = packagePurchaseEligibility({ accountId: centre.ownerAccountId });
  const editable: EditableCentre = {
    id: centre.id,
    version: centre.version,
    typeCode: centre.typeCode,
    displayNameFa: centre.displayNameFa,
    aboutFa: centre.aboutFa,
    phone: centre.phone,
    websiteUrl: centre.websiteUrl,
    licenceNumber: centre.licenceNumber,
    licenceStatus: centre.licenceStatus as LicenceStatusName,
    publicStatus: centre.publicStatus as CentreStatus,
    hiddenByReview: centre.hiddenByReview,
    ownerAccountId: centre.ownerAccountId,
    serviceCodes: facts.serviceCodes,
    speciesCodes: facts.speciesCodes,
    facilityCodes: facts.facilityCodes,
  };
  const canEditContent = surface !== 'review';

  return (
    <div className="space-y-lg">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h1 className="text-h4">{centre.displayNameFa}</h1>
            <p className="mt-2xs text-caption text-text-secondary">{facts.typeNameFa}</p>
          </div>
          <span data-testid="centre-public-status">
            <StatusBadge tone={centre.publicStatus === 'PUBLISHED' ? 'success' : centre.publicStatus === 'HIDDEN' ? 'warning' : 'neutral'}>
              {CENTRE_STATUS_FA[centre.publicStatus as CentreStatus]}
            </StatusBadge>
          </span>
        </div>
        {centre.publicStatus === 'PUBLISHED' && centre.publicSlug ? (
          <p className="mt-sm text-body-sm">
            <Link href={'/centers/' + centre.publicSlug} className="text-text-brand underline underline-offset-4" data-testid="centre-public-link">
              مشاهده صفحه عمومی
            </Link>
          </p>
        ) : null}

        <ul className="mt-lg" data-testid="centre-axes">
          <Axis
            testId="centre-axis-completeness"
            label="تکمیل پروفایل"
            tone={completeness.complete ? 'success' : 'neutral'}
            value={fa(completeness.done) + ' از ' + fa(completeness.total)}
            detail={completeness.missing.length > 0 ? 'مانده: ' + completeness.missing.join('، ') : undefined}
          />
          <Axis
            testId="centre-axis-ownership"
            label="مالکیت"
            tone={centre.ownerAccountId ? 'info' : 'warning'}
            value={centre.ownerAccountId ? 'دارای مدیر' : 'بدون مالک'}
            detail={centre.claimedAt ? 'واگذاری در ' + dateFa(centre.claimedAt) : 'تا واگذاری یا Claim، مرکز مدیری ندارد.'}
          />
          <Axis
            testId="centre-axis-verification"
            label="تأیید مجوز"
            tone={centre.licenceStatus === 'VALID' ? 'success' : centre.licenceStatus === 'NONE' ? 'neutral' : 'warning'}
            value={LICENCE_STATUS_FA[centre.licenceStatus as LicenceStatusName]}
            detail={centre.licenceVerifiedAt ? 'تأیید در ' + dateFa(centre.licenceVerifiedAt) : undefined}
          />
          <Axis
            testId="centre-axis-serves"
            label="همکار خدمات همزیست"
            tone={facts.branches.some((branch) => branch.vetAccountId !== null && branch.licenceStatus === 'VALID' && branch.isActive) ? 'success' : 'neutral'}
            value={facts.branches.some((branch) => branch.vetAccountId !== null && branch.licenceStatus === 'VALID' && branch.isActive) ? 'بله' : 'خیر'}
            detail="یعنی دست‌کم یک شعبه، محل کار ثبت‌شده و دارای پروانه معتبر در سامانه فاز یک است."
          />
          <Axis
            testId="centre-axis-advertising"
            label="تبلیغات"
            tone="neutral"
            value="بسته فعالی ندارد"
            detail={purchase.allowed ? 'هیچ بسته‌ای مجوز یا تأیید نمی‌سازد.' : purchase.reasonFa}
          />
        </ul>
      </Card>

      <CentreStatusForm surface={surface} centre={editable} blockers={blockers} />
      {canEditContent ? (
        <CentreProfileForm
          surface={surface}
          centre={editable}
          types={reference.types}
          services={reference.services}
          speciesList={reference.species}
          facilities={reference.facilities}
        />
      ) : null}
      {surface === 'owner' ? null : <CentreLicenceForm surface={surface} centre={editable} />}
      {surface === 'admin' && centre.ownerAccountId === null ? <CentreOwnerForm centre={editable} /> : null}

      <Card>
        <h2 className="text-label-lg">شعبه‌ها</h2>
        <p className="mt-xs text-body-sm text-text-secondary">
          هر شعبه یک محل کار در همان جدول فاز یک است. شعبه‌ای که اینجا ساخته می‌شود پروانه و امکانات خدمات همزیست ندارد و در Finder
          نمی‌آید.
        </p>
        {facts.branches.length === 0 ? (
          <div className="mt-lg">
            <EmptyState title="شعبه‌ای ثبت نشده است" description="برای انتشار مرکز، دست‌کم یک شعبه عمومی با شهر لازم است." />
          </div>
        ) : (
          <ul className="mt-lg space-y-lg">
            {facts.branches.map((branch) => (
              <li key={branch.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'centre-branch-' + branch.id}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h3 className="text-label-md">{branch.nameFa}</h3>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {[branch.provinceNameFa, branch.cityNameFa, branch.addressFa].filter(Boolean).join(' · ')}
                    </p>
                    {branch.vetAccountId !== null ? (
                      <p className="mt-2xs text-caption text-text-secondary">
                        {'محل کار ثبت‌شده دامپزشک · پروانه: ' + LICENCE_STATUS_FA[branch.licenceStatus as LicenceStatusName]}
                      </p>
                    ) : null}
                    {branch.hours.length > 0 ? (
                      <p className="mt-2xs text-caption text-text-secondary">
                        {branch.hours.map((hour) => WEEKDAYS_FA[hour.weekday] + ' ' + hour.opensAt + '–' + hour.closesAt).join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-xs">
                    {branch.isOpen24h ? <StatusBadge tone="info">شبانه‌روزی</StatusBadge> : null}
                    <StatusBadge tone={!branch.isActive ? 'warning' : branch.isPublic ? 'success' : 'neutral'}>
                      {!branch.isActive ? 'غیرفعال' : branch.isPublic ? 'عمومی' : 'غیرعمومی'}
                    </StatusBadge>
                  </div>
                </div>
                {canEditContent ? (
                  <BranchForm
                    surface={surface}
                    centreId={centre.id}
                    branch={{
                      id: branch.id,
                      version: branch.version,
                      nameFa: branch.nameFa,
                      kind: branch.kind,
                      provinceCode: branch.provinceCode,
                      cityId: branch.cityId,
                      neighborhoodFa: branch.neighborhoodFa,
                      addressFa: branch.addressFa,
                      phone: branch.phone,
                      latitude: branch.latitude,
                      longitude: branch.longitude,
                      isOpen24h: branch.isOpen24h,
                      hoursNoteFa: branch.hoursNoteFa,
                      isPublic: branch.isPublic,
                      isActive: branch.isActive,
                      hours: branch.hours.map((hour) => ({ weekday: hour.weekday, opensAt: hour.opensAt, closesAt: hour.closesAt })),
                    }}
                    provinces={reference.provinces}
                    cities={reference.cities}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEditContent ? (
          <div className="mt-lg border-t border-border-subtle pt-lg">
            <h3 className="text-label-md">افزودن شعبه</h3>
            <BranchForm surface={surface} centreId={centre.id} provinces={reference.provinces} cities={reference.cities} />
          </div>
        ) : null}
      </Card>

      {surface === 'admin' && unlinkedLocations.length > 0 ? <AttachLocationForm centreId={centre.id} locations={unlinkedLocations} /> : null}

      <Card>
        <h2 className="text-label-lg">تیم حرفه‌ای</h2>
        <p className="mt-xs text-body-sm text-text-secondary">
          نام هر دامپزشک فقط پس از پذیرش دعوت در صفحه عمومی مرکز می‌آید.
        </p>
        {facts.members.length === 0 ? (
          <div className="mt-lg">
            <EmptyState title="عضوی ثبت نشده است" description="با نشانی عمومی یا کد نظام دامپزشک دعوت بفرستید." />
          </div>
        ) : (
          <ul className="mt-lg space-y-sm" data-testid="centre-members">
            {facts.members.map((member) => (
              <li key={member.id} className="rounded-lg border border-border-subtle p-md" data-testid={'centre-member-' + member.id}>
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="text-label-md">{member.nameFa}</p>
                    {member.roleFa ? <p className="text-caption text-text-secondary">{member.roleFa}</p> : null}
                  </div>
                  <StatusBadge tone={member.status === 'ACCEPTED' ? 'success' : member.status === 'INVITED' ? 'info' : 'neutral'}>
                    {MEMBER_STATUS_FA[member.status] ?? member.status}
                  </StatusBadge>
                </div>
                {canEditContent && member.status !== 'REMOVED' ? (
                  <MemberRemoveForm surface={surface} member={{ id: member.id, version: member.version }} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEditContent ? <MemberInviteForm surface={surface} centreId={centre.id} /> : null}
      </Card>
    </div>
  );
}
