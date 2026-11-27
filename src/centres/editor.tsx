import Link from 'next/link';
import { Card } from '../ui/card.tsx';
import { SectionHeader } from '../ui/section-header.tsx';
import { EmptyState } from '../ui/states.tsx';
import { StatusBadge, type StatusTone } from '../ui/status.tsx';
import { formatCivilDateFa } from '../domain/calendar.ts';
import { packagePurchaseEligibility } from '../vets/directory-model.ts';
import type { CentreEditorData } from './service.ts';
import { LICENCE_STATUS_FA, WEEKDAYS_FA, type CentreStatus, type LicenceStatusName } from './model.ts';
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

/** Team-member values that differ from the status-dictionary key; the rest are the key. */
const memberKey = (status: string): string => (status === 'INVITED' ? 'PROPOSED' : status);

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
 * One centre, edited by its manager, the review operator or the superadmin —
 * Requirements-Phase-2 §9, §21 (PROMPT-008). The status axes are shown one by
 * one and never summed (P2-D05).
 */
export function CentreEditor({
  data,
  surface,
  unlinkedLocations = [],
  headless = false,
  statusForm = true,
}: {
  data: CentreEditorData;
  surface: CentreSurface;
  unlinkedLocations?: ReadonlyArray<{ id: string; label: string }>;
  /** The page already shows the name and status (DeskHead / record summary). */
  headless?: boolean;
  /** false on the review desk, where publish / hide is the decision panel. */
  statusForm?: boolean;
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
        {headless ? (
          <SectionHeader title="وضعیت پرونده" size="sm" />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <h2 className="hz-h3">{centre.displayNameFa}</h2>
              <p className="mt-2xs text-caption text-text-secondary">{facts.typeNameFa}</p>
            </div>
            <span data-testid="centre-public-status">
              <StatusBadge status={centre.publicStatus} />
            </span>
          </div>
        )}
        {centre.publicStatus === 'PUBLISHED' && centre.publicSlug ? (
          <p className="mt-sm text-body-sm">
            <Link href={'/centers/' + centre.publicSlug} className="hz-link hz-link--standalone" data-testid="centre-public-link">
              مشاهده صفحه عمومی
            </Link>
          </p>
        ) : null}

        <ul className="mt-lg" data-testid="centre-axes">
          <Axis
            testId="centre-axis-completeness"
            label="تکمیل پروفایل"
            // GAPS #4: a count, not a lifecycle status
            status={{ tone: completeness.complete ? 'success' : 'neutral', value: fa(completeness.done) + ' از ' + fa(completeness.total) }}
            detail={completeness.missing.length > 0 ? 'مانده: ' + completeness.missing.join('، ') : undefined}
          />
          <Axis
            testId="centre-axis-ownership"
            label="مالکیت"
            // GAPS #4: no dictionary key for the ownership axis (OWNED / UNOWNED)
            status={{ tone: centre.ownerAccountId ? 'info' : 'warning', value: centre.ownerAccountId ? 'دارای مدیر' : 'بدون مالک' }}
            detail={centre.claimedAt ? 'واگذاری در ' + dateFa(centre.claimedAt) : 'تا واگذاری یا Claim، مرکز مدیری ندارد.'}
          />
          <Axis
            testId="centre-axis-verification"
            label="تأیید مجوز"
            status={centre.licenceStatus}
            detail={centre.licenceVerifiedAt ? 'تأیید در ' + dateFa(centre.licenceVerifiedAt) : undefined}
          />
          <Axis
            testId="centre-axis-serves"
            label="همکار خدمات همزیست"
            // GAPS #4: a yes/no fact, no dictionary key
            status={
              facts.branches.some((branch) => branch.vetAccountId !== null && branch.licenceStatus === 'VALID' && branch.isActive)
                ? { tone: 'success', value: 'بله' }
                : { tone: 'neutral', value: 'خیر' }
            }
            detail="یعنی دست‌کم یک شعبه، محل کار ثبت‌شده و دارای پروانه معتبر در سامانه فاز یک است."
          />
          <Axis
            testId="centre-axis-advertising"
            label="تبلیغات"
            // GAPS #4: no dictionary key for «no active package»
            status={{ tone: 'neutral', value: 'بسته فعالی ندارد' }}
            detail={purchase.allowed ? 'هیچ بسته‌ای مجوز یا تأیید نمی‌سازد.' : purchase.reasonFa}
          />
        </ul>
      </Card>

      {statusForm ? <CentreStatusForm surface={surface} centre={editable} blockers={blockers} /> : null}
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
        <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>شعبه‌ها</span></h2></div>
        <p className="mt-xs text-body-sm text-text-secondary">
          هر شعبه یک محل کار در همان جدول فاز یک است. شعبه‌ای که اینجا ساخته می‌شود پروانه و امکانات خدمات همزیست ندارد و در Finder
          نمی‌آید.
        </p>
        {facts.branches.length === 0 ? (
          <div className="mt-lg">
            <EmptyState title="شعبه‌ای ثبت نشده است" description="برای انتشار مرکز، دست‌کم یک شعبه عمومی با شهر لازم است." />
          </div>
        ) : (
          <ul className="mt-lg divide-y divide-border-subtle">
            {facts.branches.map((branch) => (
              <li key={branch.id} className="py-lg first:pt-0 last:pb-0" data-testid={'centre-branch-' + branch.id}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h3 className="text-label-sm">{branch.nameFa}</h3>
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
                    {branch.isOpen24h ? <span className="hz-tag hz-tag--neutral">شبانه‌روزی</span> : null}
                    <StatusBadge status={!branch.isActive ? 'INACTIVE' : branch.isPublic ? 'PUBLISHED' : 'HIDDEN'} />
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
            <h3 className="text-label-sm">افزودن شعبه</h3>
            <BranchForm surface={surface} centreId={centre.id} provinces={reference.provinces} cities={reference.cities} />
          </div>
        ) : null}
      </Card>

      {surface === 'admin' && unlinkedLocations.length > 0 ? <AttachLocationForm centreId={centre.id} locations={unlinkedLocations} /> : null}

      <Card>
        <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>تیم حرفه‌ای</span></h2></div>
        <p className="mt-xs text-body-sm text-text-secondary">
          نام هر دامپزشک فقط پس از پذیرش دعوت در صفحه عمومی مرکز می‌آید.
        </p>
        {facts.members.length === 0 ? (
          <div className="mt-lg">
            <EmptyState title="عضوی ثبت نشده است" description="با نشانی عمومی یا کد نظام دامپزشک دعوت بفرستید." />
          </div>
        ) : (
          <ul className="mt-lg divide-y divide-border-subtle" data-testid="centre-members">
            {facts.members.map((member) => (
              <li key={member.id} className="py-md first:pt-0 last:pb-0" data-testid={'centre-member-' + member.id}>
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="text-label-sm">{member.nameFa}</p>
                    {member.roleFa ? <p className="text-caption text-text-secondary">{member.roleFa}</p> : null}
                  </div>
                  <StatusBadge status={memberKey(member.status)} />
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
