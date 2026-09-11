'use client';

import { useActionState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Check, PlacePicker, Result, submitWith, type CityOption, type Option } from '../vets/directory-forms.tsx';
import {
  CENTRE_STATUS_FA,
  LICENCE_STATUSES,
  LICENCE_STATUS_FA,
  WEEKDAYS_FA,
  type CentreStatus,
  type LicenceStatusName,
} from './model.ts';
import {
  addCentreBranchAction,
  assignCentreOwnerAction,
  attachLocationToCentreAction,
  changeCentreStatusAction,
  createCentreAction,
  inviteCentreMemberAction,
  removeCentreMemberAction,
  respondToCentreInvitationAction,
  setCentreLicenceAction,
  updateCentreBranchAction,
  updateCentreProfileAction,
  type CentreFormState,
  type CentreSurface,
} from './actions.ts';

const EMPTY: CentreFormState = {};

const Hidden = ({ surface, centreId }: { surface: CentreSurface; centreId?: string }) => (
  <>
    <input type="hidden" name="surface" value={surface} />
    {centreId ? <input type="hidden" name="centreId" value={centreId} /> : null}
  </>
);

function ReasonField({ surface, testId }: { surface: CentreSurface; testId: string }) {
  return surface === 'owner' ? (
    <TextField label="یادداشت تغییر" name="reason" maxLength={500} data-testid={testId} />
  ) : (
    <TextField label="دلیل تغییر" name="reason" required maxLength={500} hint="در تاریخچه تغییرات ثبت می‌شود." data-testid={testId} />
  );
}

export interface EditableCentre {
  readonly id: string;
  readonly version: number;
  readonly typeCode: string;
  readonly displayNameFa: string;
  readonly aboutFa: string | null;
  readonly phone: string | null;
  readonly websiteUrl: string | null;
  readonly licenceNumber: string | null;
  readonly licenceStatus: LicenceStatusName;
  readonly publicStatus: CentreStatus;
  readonly hiddenByReview: boolean;
  readonly ownerAccountId: string | null;
  readonly serviceCodes: readonly string[];
  readonly speciesCodes: readonly string[];
  readonly facilityCodes: readonly string[];
}

export function CentreCreateForm({
  surface,
  types,
  provinces,
  cities,
}: {
  surface: CentreSurface;
  types: readonly Option[];
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(createCentreAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">ثبت مرکز تازه</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        مرکز تازه پیش‌نویس است و تا افزودن شعبه و انتشار در فهرست عمومی دیده نمی‌شود. فقط اطلاعات عمومی و قابل استناد را ثبت کنید.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="centre-create-form">
        <Hidden surface={surface} />
        <Result state={state} testId="centre-create-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام مرکز" name="displayNameFa" required maxLength={160} data-testid="centre-name" />
          <SelectField
            label="نوع مرکز"
            name="typeCode"
            required
            options={types.map((row) => ({ value: row.code, label: row.nameFa }))}
            data-testid="centre-type"
          />
        </div>
        <PlacePicker provinces={provinces} cities={cities} testIdPrefix="centre-" />
        <TextField label="تماس یا نشانی عمومی" name="contactFa" maxLength={300} data-testid="centre-contact" />
        <TextField
          label="منبع اطلاعات"
          name="sourceFa"
          maxLength={300}
          hint="فقط برای بررسی؛ در صفحه عمومی نمایش داده نمی‌شود."
          data-testid="centre-source"
        />
        <ReasonField surface={surface} testId="centre-create-reason" />
        <Check name="confirmedNotDuplicate" label="مراکز مشابه را دیده‌ام و این مرکز تکراری نیست" defaultChecked={false} testId="centre-confirm" />
        <Button type="submit" disabled={pending} data-testid="create-centre">
          ثبت مرکز
        </Button>
      </form>
    </Card>
  );
}

export function CentreProfileForm({
  surface,
  centre,
  types,
  services,
  speciesList,
  facilities,
}: {
  surface: CentreSurface;
  centre: EditableCentre;
  types: readonly Option[];
  services: readonly Option[];
  speciesList: readonly Option[];
  facilities: readonly Option[];
}) {
  const [state, submit, pending] = useActionState(updateCentreProfileAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">پرونده مرکز</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="centre-profile-form">
        <Hidden surface={surface} centreId={centre.id} />
        <input type="hidden" name="expectedVersion" value={centre.version} />
        <Result state={state} testId="centre-profile-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام مرکز" name="displayNameFa" required maxLength={160} defaultValue={centre.displayNameFa} data-testid="centre-profile-name" />
          <SelectField
            label="نوع مرکز"
            name="typeCode"
            required
            defaultValue={centre.typeCode}
            options={types.map((row) => ({ value: row.code, label: row.nameFa }))}
            data-testid="centre-profile-type"
          />
        </div>
        <TextAreaField label="معرفی مرکز" name="aboutFa" maxLength={4000} defaultValue={centre.aboutFa ?? ''} data-testid="centre-about" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="تلفن عمومی" name="phone" ltr inputMode="tel" maxLength={20} defaultValue={centre.phone ?? ''} data-testid="centre-phone" />
          <TextField label="وب‌سایت" name="websiteUrl" ltr maxLength={300} defaultValue={centre.websiteUrl ?? ''} data-testid="centre-website" />
        </div>

        <fieldset>
          <legend className="text-label-md">خدمات</legend>
          <div className="mt-sm grid gap-xs sm:grid-cols-2 lg:grid-cols-3">
            {services.map((row) => (
              <Check
                key={row.code}
                name="service"
                value={row.code}
                label={row.nameFa}
                defaultChecked={centre.serviceCodes.includes(row.code)}
                testId={'centre-service-' + row.code}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-label-md">گونه‌هایی که پذیرفته می‌شوند</legend>
          <div className="mt-sm flex flex-wrap gap-lg">
            {speciesList.map((row) => (
              <Check
                key={row.code}
                name="species"
                value={row.code}
                label={row.nameFa}
                defaultChecked={centre.speciesCodes.includes(row.code)}
                testId={'centre-species-' + row.code}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-label-md">امکانات</legend>
          <div className="mt-sm grid gap-xs sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((row) => (
              <Check
                key={row.code}
                name="facility"
                value={row.code}
                label={row.nameFa}
                defaultChecked={centre.facilityCodes.includes(row.code)}
                testId={'centre-facility-' + row.code}
              />
            ))}
          </div>
        </fieldset>

        <ReasonField surface={surface} testId="centre-profile-reason" />
        <Button type="submit" disabled={pending} data-testid="save-centre-profile">
          ذخیره پرونده مرکز
        </Button>
      </form>
    </Card>
  );
}

/** The licence, recorded by whoever checked it. The owner never records their own (P2-D05). */
export function CentreLicenceForm({ surface, centre }: { surface: CentreSurface; centre: EditableCentre }) {
  const [state, submit, pending] = useActionState(setCentreLicenceAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">مجوز مرکز</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        فقط همان چیزی که در مدارک دیده شده است ثبت می‌شود. وضعیت «معتبر» یعنی مجوز بررسی و تأیید شده است.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="centre-licence-form">
        <Hidden surface={surface} centreId={centre.id} />
        <input type="hidden" name="expectedVersion" value={centre.version} />
        <Result state={state} testId="centre-licence-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="شماره مجوز" name="licenceNumber" ltr maxLength={60} defaultValue={centre.licenceNumber ?? ''} data-testid="licence-number" />
          <SelectField
            label="وضعیت مجوز"
            name="licenceStatus"
            required
            defaultValue={centre.licenceStatus}
            options={LICENCE_STATUSES.map((value) => ({ value, label: LICENCE_STATUS_FA[value] }))}
            data-testid="licence-status"
          />
        </div>
        <TextField label="دلیل ثبت" name="reason" required maxLength={500} data-testid="licence-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="save-centre-licence">
          ثبت مجوز
        </Button>
      </form>
    </Card>
  );
}

export function CentreStatusForm({
  surface,
  centre,
  blockers,
}: {
  surface: CentreSurface;
  centre: EditableCentre;
  blockers: readonly string[];
}) {
  const [state, submit, pending] = useActionState(changeCentreStatusAction, EMPTY);
  const targets: CentreStatus[] = centre.publicStatus === 'PUBLISHED' ? ['HIDDEN'] : ['PUBLISHED'];
  const lockedForOwner = surface === 'owner' && centre.hiddenByReview && centre.publicStatus === 'HIDDEN';
  return (
    <Card>
      <h2 className="text-label-lg">انتشار</h2>
      <p className="mt-xs text-body-sm text-text-secondary">{'وضعیت فعلی: ' + CENTRE_STATUS_FA[centre.publicStatus]}</p>
      <Result state={state} testId="centre-status-result" />
      {lockedForOwner ? (
        <div className="mt-md" data-testid="centre-review-hidden">
          <Alert tone="warning" title="این مرکز در بررسی همزیست پنهان شده است">
            انتشار دوباره فقط از بررسی همزیست ممکن است.
          </Alert>
        </div>
      ) : (
        <>
          {blockers.length > 0 && centre.publicStatus !== 'PUBLISHED' ? (
            <div className="mt-md" data-testid="centre-blockers">
              <Alert tone="warning" title="پیش از انتشار">
                <ul className="list-disc space-y-2xs pr-lg">
                  {blockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}
          <form key={centre.publicStatus} onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="centre-status-form">
            <Hidden surface={surface} centreId={centre.id} />
            <input type="hidden" name="expectedVersion" value={centre.version} />
            <SelectField
              label="وضعیت تازه"
              name="to"
              required
              defaultValue={targets[0]}
              options={targets.map((value) => ({ value, label: CENTRE_STATUS_FA[value] }))}
              data-testid="centre-status-to"
            />
            <ReasonField surface={surface} testId="centre-status-reason" />
            <Button type="submit" disabled={pending} data-testid="change-centre-status">
              ثبت وضعیت
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

export function CentreOwnerForm({ centre }: { centre: EditableCentre }) {
  const [state, submit, pending] = useActionState(assignCentreOwnerAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">مدیر مرکز</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        مدیریت این مرکز به حسابی که شماره‌اش را می‌نویسید سپرده می‌شود. Claim با بررسی مدارک در مرحله بعدی ساخته می‌شود.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg grid gap-md md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="centre-owner-form">
        <Hidden surface="admin" centreId={centre.id} />
        <input type="hidden" name="expectedVersion" value={centre.version} />
        <div className="md:col-span-3">
          <Result state={state} testId="centre-owner-result" />
        </div>
        <TextField label="شماره موبایل مدیر" name="mobile" ltr required inputMode="numeric" data-testid="owner-mobile" />
        <TextField label="دلیل" name="reason" required maxLength={500} data-testid="owner-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="assign-centre-owner">
          واگذاری
        </Button>
      </form>
    </Card>
  );
}

export interface EditableBranch {
  readonly id: string;
  readonly version: number;
  readonly nameFa: string;
  readonly kind: string;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly neighborhoodFa: string | null;
  readonly addressFa: string | null;
  readonly phone: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly isOpen24h: boolean;
  readonly hoursNoteFa: string | null;
  readonly isPublic: boolean;
  readonly isActive: boolean;
  readonly hours: ReadonlyArray<{ weekday: number; opensAt: string; closesAt: string }>;
}

const KINDS = [
  { value: 'CLINIC', label: 'کلینیک' },
  { value: 'HOSPITAL', label: 'بیمارستان' },
  { value: 'CENTRE', label: 'مرکز' },
];

function HoursFields({ branch, suffix }: { branch?: EditableBranch; suffix: string }) {
  return (
    <fieldset>
      <legend className="text-label-md">ساعات اعلام‌شده</legend>
      <p className="mt-2xs text-caption text-text-secondary">
        روزهایی که خالی بماند اعلام نشده‌اند. این ساعات فقط اطلاع‌رسانی است و نوبت نمی‌دهد.
      </p>
      <div className="mt-sm space-y-xs">
        {WEEKDAYS_FA.map((day, weekday) => {
          const row = branch?.hours.find((hour) => hour.weekday === weekday);
          return (
            <div key={day} className="grid items-end gap-sm sm:grid-cols-[6rem_1fr_1fr]">
              <span className="text-body-sm">{day}</span>
              <TextField label="از" name={'opens_' + weekday} ltr maxLength={5} defaultValue={row?.opensAt ?? ''} data-testid={'opens-' + weekday + suffix} />
              <TextField label="تا" name={'closes_' + weekday} ltr maxLength={5} defaultValue={row?.closesAt ?? ''} data-testid={'closes-' + weekday + suffix} />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function BranchForm({
  surface,
  centreId,
  branch,
  provinces,
  cities,
}: {
  surface: CentreSurface;
  centreId: string;
  branch?: EditableBranch;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(branch ? updateCentreBranchAction : addCentreBranchAction, EMPTY);
  const suffix = branch ? '-' + branch.id : '';
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-md" data-testid={branch ? 'branch-form-' + branch.id : 'add-branch-form'}>
      <Hidden surface={surface} centreId={centreId} />
      {branch ? (
        <>
          <input type="hidden" name="locationId" value={branch.id} />
          <input type="hidden" name="expectedVersion" value={branch.version} />
        </>
      ) : null}
      <Result state={state} testId={branch ? 'branch-result-' + branch.id : 'add-branch-result'} />
      <div className="grid gap-md md:grid-cols-2">
        <TextField label="نام شعبه" name="nameFa" required maxLength={120} defaultValue={branch?.nameFa ?? ''} data-testid={'branch-name' + suffix} />
        <SelectField label="نوع" name="kind" required defaultValue={branch?.kind ?? 'CLINIC'} options={KINDS} data-testid={'branch-kind' + suffix} />
      </div>
      <PlacePicker
        provinces={provinces}
        cities={cities}
        required
        defaultProvince={branch?.provinceCode}
        defaultCity={branch?.cityId}
        testIdPrefix="branch-"
        testIdSuffix={suffix}
      />
      <div className="grid gap-md md:grid-cols-2">
        <TextField label="محله" name="neighborhoodFa" maxLength={120} defaultValue={branch?.neighborhoodFa ?? ''} data-testid={'branch-neighborhood' + suffix} />
        <TextField label="تلفن شعبه" name="phone" ltr inputMode="tel" maxLength={20} defaultValue={branch?.phone ?? ''} data-testid={'branch-phone' + suffix} />
      </div>
      <TextField label="نشانی" name="addressFa" maxLength={300} defaultValue={branch?.addressFa ?? ''} data-testid={'branch-address' + suffix} />
      <div className="grid gap-md md:grid-cols-2">
        <TextField label="عرض جغرافیایی" name="latitude" ltr maxLength={20} defaultValue={branch?.latitude?.toString() ?? ''} data-testid={'branch-lat' + suffix} />
        <TextField label="طول جغرافیایی" name="longitude" ltr maxLength={20} defaultValue={branch?.longitude?.toString() ?? ''} data-testid={'branch-lng' + suffix} />
      </div>
      <TextField label="یادداشت ساعات" name="hoursNoteFa" maxLength={300} defaultValue={branch?.hoursNoteFa ?? ''} data-testid={'branch-hours-note' + suffix} />
      <HoursFields branch={branch} suffix={suffix} />
      <Check name="isOpen24h" label="شبانه‌روزی" defaultChecked={branch?.isOpen24h ?? false} testId={'branch-24h' + suffix} />
      <Check name="isPublic" label="نمایش این شعبه در صفحه عمومی" defaultChecked={branch?.isPublic ?? true} testId={'branch-public' + suffix} />
      {branch ? <Check name="isActive" label="شعبه فعال است" defaultChecked={branch.isActive} testId={'branch-active' + suffix} /> : null}
      {branch ? <ReasonField surface={surface} testId={'branch-reason' + suffix} /> : null}
      <Button type="submit" tone="secondary" disabled={pending} data-testid={branch ? 'save-branch-' + branch.id : 'add-branch'}>
        {branch ? 'ذخیره شعبه' : 'افزودن شعبه'}
      </Button>
    </form>
  );
}

/** An existing Phase 1 place, linked to this centre rather than copied into it. */
export function AttachLocationForm({ centreId, locations }: { centreId: string; locations: ReadonlyArray<{ id: string; label: string }> }) {
  const [state, submit, pending] = useActionState(attachLocationToCentreAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">پیوند محل کار موجود</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        محل کاری که در فهرست دامپزشکان ثبت شده است به این مرکز پیوند می‌خورد؛ پروانه، امکانات و جایگاه آن در Finder دست نمی‌خورد.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg grid gap-md md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="attach-location-form">
        <Hidden surface="admin" centreId={centreId} />
        <div className="md:col-span-3">
          <Result state={state} testId="attach-location-result" />
        </div>
        <SelectField
          label="محل کار"
          name="locationId"
          required
          options={locations.map((row) => ({ value: row.id, label: row.label }))}
          data-testid="attach-location-id"
        />
        <TextField label="دلیل" name="reason" required maxLength={500} data-testid="attach-location-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="attach-location">
          پیوند
        </Button>
      </form>
    </Card>
  );
}

export function MemberInviteForm({ surface, centreId }: { surface: CentreSurface; centreId: string }) {
  const [state, submit, pending] = useActionState(inviteCentreMemberAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="member-invite-form">
      <Hidden surface={surface} centreId={centreId} />
      <Result state={state} testId="member-invite-result" />
      <div className="grid gap-md md:grid-cols-2">
        <TextField
          label="نشانی عمومی یا کد نظام دامپزشک"
          name="vetRef"
          ltr
          required
          maxLength={40}
          hint="مثل vet-1a2b3c4d5e یا کد نظام."
          data-testid="member-ref"
        />
        <TextField label="سمت در مرکز" name="roleFa" maxLength={120} data-testid="member-role" />
      </div>
      <ReasonField surface={surface} testId="member-reason" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="invite-member">
        فرستادن دعوت
      </Button>
    </form>
  );
}

export function MemberRemoveForm({ surface, member }: { surface: CentreSurface; member: { id: string; version: number } }) {
  const [state, submit, pending] = useActionState(removeCentreMemberAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid={'member-remove-form-' + member.id}>
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="expectedVersion" value={member.version} />
      <div className="min-w-[12rem] flex-1">
        <ReasonField surface={surface} testId={'member-remove-reason-' + member.id} />
      </div>
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'remove-member-' + member.id}>
        برداشتن از فهرست
      </Button>
      <div className="w-full">
        <Result state={state} testId={'member-remove-result-' + member.id} />
      </div>
    </form>
  );
}

/** The veterinarian's own answer to a centre's invitation. */
export function CentreInvitationForm({ invitation }: { invitation: { id: string; version: number; centreNameFa: string; roleFa: string | null } }) {
  const [state, submit, pending] = useActionState(respondToCentreInvitationAction, EMPTY);
  return (
    <div className="rounded-lg border border-border-subtle p-lg" data-testid={'centre-invitation-' + invitation.id}>
      <p className="text-label-md">{invitation.centreNameFa}</p>
      {invitation.roleFa ? <p className="mt-2xs text-caption text-text-secondary">{'سمت پیشنهادی: ' + invitation.roleFa}</p> : null}
      <p className="mt-xs text-body-sm text-text-secondary">تا وقتی نپذیرید، نام شما در صفحه این مرکز نمایش داده نمی‌شود.</p>
      <Result state={state} testId={'centre-invitation-result-' + invitation.id} />
      {/* One form per answer: the answer travels in a field of its own, never in a button's value. */}
      <div className="mt-md flex flex-wrap gap-sm">
        {(
          [
            { answer: 'ACCEPT', label: 'پذیرش', tone: 'primary' as const, testId: 'accept-invitation-' },
            { answer: 'DECLINE', label: 'رد دعوت', tone: 'ghost' as const, testId: 'decline-invitation-' },
          ] as const
        ).map((choice) => (
          <form
            key={choice.answer}
            onSubmit={submitWith(submit)}
            data-testid={choice.testId.replace('-invitation-', '-invitation-form-') + invitation.id}
          >
            <input type="hidden" name="memberId" value={invitation.id} />
            <input type="hidden" name="expectedVersion" value={invitation.version} />
            <input type="hidden" name="answer" value={choice.answer} />
            <Button type="submit" tone={choice.tone} disabled={pending} data-testid={choice.testId + invitation.id}>
              {choice.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
